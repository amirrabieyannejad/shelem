// stats.js
// -----------------------------------------------------------------------------
// Lebenslange Spieler-Statistik (Level/XP) und Partner-Statistik (wer mit wem).
//
// Quelle der Wahrheit sind die persistierten Tabellen `rounds`, `games` und
// `game_players`. Daraus werden die Kennzahlen aggregiert und zusätzlich in
// `player_stats` / `pair_stats` gespiegelt, damit sie schnell abrufbar sind und
// dauerhaft erhalten bleiben, solange der Spieler existiert.
// -----------------------------------------------------------------------------

import { pool } from "./db.js";

// ---------------------------------------------------------------------------
// Level-Definition
// ---------------------------------------------------------------------------
export const LEVELS = [
  { level: 1,  minXp: 0,     title: "تازه‌کار",     de: "Neuling" },
  { level: 2,  minXp: 150,   title: "مبتدی",        de: "Anfänger" },
  { level: 3,  minXp: 400,   title: "بازیکن",       de: "Spieler" },
  { level: 4,  minXp: 800,   title: "حرفه‌ای",      de: "Fortgeschritten" },
  { level: 5,  minXp: 1500,  title: "کارکشته",      de: "Routinier" },
  { level: 6,  minXp: 2600,  title: "استاد",        de: "Meister" },
  { level: 7,  minXp: 4200,  title: "استاد بزرگ",   de: "Großmeister" },
  { level: 8,  minXp: 6500,  title: "نابغه",        de: "Virtuose" },
  { level: 9,  minXp: 10000, title: "افسانه",       de: "Legende" },
  { level: 10, minXp: 15000, title: "اسطوره",       de: "Mythos" },
];

// XP-Formel: Aktivität zählt, Erfolg zählt mehr, riskante Fehlgebote kosten.
export function computeXp(s) {
  const xp =
    10 * (s.gamesPlayed || 0) +
    60 * (s.gamesWon || 0) +
    3 * (s.roundsWon || 0) +
    6 * (s.hakemSuccess || 0) +
    20 * (s.doublePos || 0) -
    12 * (s.doubleNeg || 0) +
    Math.floor((s.pointsFor || 0) / 150);
  return Math.max(0, Math.round(xp));
}

export function levelForXp(xp) {
  let cur = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.minXp) cur = l;
  const next = LEVELS.find((l) => l.minXp > xp) || null;
  const span = next ? next.minXp - cur.minXp : 0;
  const progress = next ? Math.min(1, (xp - cur.minXp) / (span || 1)) : 1;
  return {
    level: cur.level,
    title: cur.title,
    titleDe: cur.de,
    minXp: cur.minXp,
    nextLevelXp: next ? next.minXp : null,
    progress: Math.round(progress * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// Wahrscheinlichkeits-Helfer
// ---------------------------------------------------------------------------

// Laplace/Empirical-Bayes-Schätzer: bei wenigen Spielen zieht es Richtung Prior.
function smoothedRate(wins, played, prior = 0.5, alpha = 4) {
  if (!played) return prior;
  return (wins + alpha * prior) / (played + alpha);
}

// Wilson-Konfidenzintervall (95 %)
function wilson(wins, played) {
  if (!played) return { low: 0, high: 1 };
  const z = 1.96;
  const p = wins / played;
  const d = 1 + (z * z) / played;
  const c = p + (z * z) / (2 * played);
  const s = z * Math.sqrt((p * (1 - p)) / played + (z * z) / (4 * played * played));
  return { low: Math.max(0, (c - s) / d), high: Math.min(1, (c + s) / d) };
}

function confidenceLabel(games, rounds) {
  if (games >= 20 || rounds >= 200) return "hoch";
  if (games >= 8 || rounds >= 80) return "mittel";
  if (games >= 3 || rounds >= 25) return "niedrig";
  return "sehr niedrig";
}

const r3 = (x) => Math.round(x * 1000) / 1000;

// ---------------------------------------------------------------------------
// SQL-Aggregation
// ---------------------------------------------------------------------------

// Pro Spieler: Rundenkennzahlen
const SQL_PLAYER_ROUNDS = `
with base as (
  select gp.user_id,
         gp.team,
         case when gp.team = 'Fire' then 'Storm' else 'Fire' end as opp,
         r.*
    from game_players gp
    join rounds r on r.game_id = gp.game_id
   where gp.team is not null
)
select user_id,
       count(*)::int                                                    as rounds_played,
       coalesce(sum((round_points->>team)::int),0)::bigint              as points_for,
       coalesce(sum((round_points->>opp)::int),0)::bigint               as points_against,
       count(*) filter (
         where (round_points->>team)::int > (round_points->>opp)::int
       )::int                                                           as rounds_won,
       count(*) filter (where bidder_user_id = user_id)::int            as hakem_rounds,
       count(*) filter (
         where bidder_user_id = user_id
           and coalesce(bid_success, (round_points->>team)::int >= bid)
       )::int                                                           as hakem_success,
       count(*) filter (
         where rule_applied = 'doublePositive' and bidder_team = team
       )::int                                                           as double_pos,
       count(*) filter (
         where rule_applied = 'doubleNegative' and bidder_team = team
       )::int                                                           as double_neg
  from base
 group by user_id
`;

// Pro Spieler: Spielkennzahlen (nur Spiele mit mindestens einer gespielten Runde)
const SQL_PLAYER_GAMES = `
select gp.user_id,
       count(*)::int as games_played,
       count(*) filter (where g.winner_team is not null and g.winner_team = gp.team)::int as games_won,
       count(*) filter (where g.winner_team is not null)::int as games_finished
  from game_players gp
  join games g on g.id = gp.game_id
 where gp.team is not null
   and exists (select 1 from rounds r where r.game_id = g.id)
 group by gp.user_id
`;

// Paare: zwei Spieler im selben Spiel im selben Team
const SQL_PAIR_ROUNDS = `
with pairs as (
  select a.game_id,
         a.user_id as ua,
         b.user_id as ub,
         a.team
    from game_players a
    join game_players b
      on b.game_id = a.game_id
     and b.team    = a.team
     and a.user_id < b.user_id
   where a.team is not null
),
base as (
  select p.ua, p.ub, p.team,
         case when p.team = 'Fire' then 'Storm' else 'Fire' end as opp,
         r.round_points
    from pairs p
    join rounds r on r.game_id = p.game_id
)
select ua, ub,
       count(*)::int as rounds_played,
       count(*) filter (
         where (round_points->>team)::int > (round_points->>opp)::int
       )::int as rounds_won,
       coalesce(sum((round_points->>team)::int),0)::bigint as points_for,
       coalesce(sum((round_points->>opp)::int),0)::bigint  as points_against
  from base
 group by ua, ub
`;

const SQL_PAIR_GAMES = `
with pairs as (
  select a.game_id,
         a.user_id as ua,
         b.user_id as ub,
         a.team
    from game_players a
    join game_players b
      on b.game_id = a.game_id
     and b.team    = a.team
     and a.user_id < b.user_id
   where a.team is not null
)
select p.ua, p.ub,
       count(*)::int as games_played,
       count(*) filter (where g.winner_team is not null and g.winner_team = p.team)::int as games_won,
       count(*) filter (where p.team = 'Fire')::int  as games_as_fire,
       count(*) filter (where p.team = 'Storm')::int as games_as_storm,
       count(*) filter (where p.team = 'Fire'  and g.winner_team = 'Fire')::int  as wins_as_fire,
       count(*) filter (where p.team = 'Storm' and g.winner_team = 'Storm')::int as wins_as_storm,
       (array_agg(p.team order by g.updated_at desc))[1] as last_team,
       max(g.updated_at) as last_played_at
  from pairs p
  join games g on g.id = p.game_id
 where exists (select 1 from rounds r where r.game_id = g.id)
 group by p.ua, p.ub
`;

// ---------------------------------------------------------------------------
// Aggregation + Spiegelung in die Cache-Tabellen
// ---------------------------------------------------------------------------
export async function computePlayerStats() {
  const [rounds, games, users] = await Promise.all([
    pool.query(SQL_PLAYER_ROUNDS),
    pool.query(SQL_PLAYER_GAMES),
    pool.query(`select id, name, username, avatar_url as "avatarUrl" from users`),
  ]);

  const byId = new Map();
  for (const u of users.rows) {
    byId.set(u.id, {
      userId: u.id,
      name: u.name,
      username: u.username,
      avatarUrl: u.avatarUrl || null,
      gamesPlayed: 0, gamesWon: 0, gamesFinished: 0,
      roundsPlayed: 0, roundsWon: 0,
      hakemRounds: 0, hakemSuccess: 0,
      doublePos: 0, doubleNeg: 0,
      pointsFor: 0, pointsAgainst: 0,
    });
  }

  for (const r of rounds.rows) {
    const e = byId.get(r.user_id);
    if (!e) continue;
    e.roundsPlayed = r.rounds_played;
    e.roundsWon = r.rounds_won;
    e.hakemRounds = r.hakem_rounds;
    e.hakemSuccess = r.hakem_success;
    e.doublePos = r.double_pos;
    e.doubleNeg = r.double_neg;
    e.pointsFor = Number(r.points_for);
    e.pointsAgainst = Number(r.points_against);
  }
  for (const g of games.rows) {
    const e = byId.get(g.user_id);
    if (!e) continue;
    e.gamesPlayed = g.games_played;
    e.gamesWon = g.games_won;
    e.gamesFinished = g.games_finished;
  }

  // Nur wer tatsächlich gespielt hat, taucht in der Rangliste auf – sonst
  // stehen dort alle je registrierten Konten mit lauter Nullen.
  const out = [...byId.values()]
    .filter((e) => e.roundsPlayed > 0 || e.gamesPlayed > 0)
    .map((e) => {
      const xp = computeXp(e);
      const lvl = levelForXp(xp);
      const roundWinRate = e.roundsPlayed ? e.roundsWon / e.roundsPlayed : null;
      const gameWinRate = e.gamesFinished ? e.gamesWon / e.gamesFinished : null;
      return {
        ...e,
        xp,
        ...lvl,
        roundWinRate: roundWinRate === null ? null : r3(roundWinRate),
        gameWinRate: gameWinRate === null ? null : r3(gameWinRate),
        hakemSuccessRate: e.hakemRounds ? r3(e.hakemSuccess / e.hakemRounds) : null,
        avgPointsPerRound: e.roundsPlayed ? Math.round(e.pointsFor / e.roundsPlayed) : 0,
      };
    });

  out.sort((a, b) => b.xp - a.xp || b.gamesWon - a.gamesWon);
  return out;
}

export async function computePairStats() {
  const [rounds, games, users] = await Promise.all([
    pool.query(SQL_PAIR_ROUNDS),
    pool.query(SQL_PAIR_GAMES),
    pool.query(`select id, name, username from users`),
  ]);

  const uname = new Map(users.rows.map((u) => [u.id, u]));
  const map = new Map();
  const key = (a, b) => `${a}|${b}`;

  const ensure = (ua, ub) => {
    const k = key(ua, ub);
    if (!map.has(k)) {
      map.set(k, {
        userA: ua,
        userB: ub,
        nameA: uname.get(ua)?.username || uname.get(ua)?.name || "?",
        nameB: uname.get(ub)?.username || uname.get(ub)?.name || "?",
        gamesPlayed: 0, gamesWon: 0, gamesLost: 0,
        roundsPlayed: 0, roundsWon: 0, roundsLost: 0,
        gamesAsFire: 0, gamesAsStorm: 0,
        winsAsFire: 0, winsAsStorm: 0,
        pointsFor: 0, pointsAgainst: 0,
        lastTeam: null, lastPlayedAt: null,
      });
    }
    return map.get(k);
  };

  for (const r of rounds.rows) {
    const e = ensure(r.ua, r.ub);
    e.roundsPlayed = r.rounds_played;
    e.roundsWon = r.rounds_won;
    e.roundsLost = r.rounds_played - r.rounds_won;
    e.pointsFor = Number(r.points_for);
    e.pointsAgainst = Number(r.points_against);
  }
  for (const g of games.rows) {
    const e = ensure(g.ua, g.ub);
    e.gamesPlayed = g.games_played;
    e.gamesWon = g.games_won;
    e.gamesLost = g.games_played - g.games_won;
    e.gamesAsFire = g.games_as_fire;
    e.gamesAsStorm = g.games_as_storm;
    e.winsAsFire = g.wins_as_fire;
    e.winsAsStorm = g.wins_as_storm;
    e.lastTeam = g.last_team;
    e.lastPlayedAt = g.last_played_at;
  }

  const out = [...map.values()].map((e) => {
    const roundRate = e.roundsPlayed >= 12 ? e.roundsWon / e.roundsPlayed : 0.5;
    const p = smoothedRate(e.gamesWon, e.gamesPlayed, roundRate, 4);
    const ci = wilson(e.gamesWon, e.gamesPlayed);
    return {
      ...e,
      winRateGames: e.gamesPlayed ? r3(e.gamesWon / e.gamesPlayed) : null,
      winRateRounds: e.roundsPlayed ? r3(e.roundsWon / e.roundsPlayed) : null,
      // Prognose: "Wie wahrscheinlich gewinnt dieses Duo das nächste Spiel?"
      predictedWinProb: r3(p),
      ci95: { low: r3(ci.low), high: r3(ci.high) },
      confidence: confidenceLabel(e.gamesPlayed, e.roundsPlayed),
      pointsDiff: e.pointsFor - e.pointsAgainst,
    };
  });

  out.sort(
    (a, b) => b.predictedWinProb - a.predictedWinProb || b.gamesPlayed - a.gamesPlayed
  );
  return out;
}

// Direkter Vergleich: Duo A/B gegen Duo C/D
export function matchup(pairAB, pairCD) {
  const a = pairAB?.predictedWinProb ?? 0.5;
  const b = pairCD?.predictedWinProb ?? 0.5;
  const sum = a + b;
  const pA = sum > 0 ? a / sum : 0.5;
  return {
    pA: r3(pA),
    pB: r3(1 - pA),
    confidence: [pairAB?.confidence, pairCD?.confidence].includes("sehr niedrig")
      ? "sehr niedrig"
      : pairAB?.confidence || "sehr niedrig",
  };
}

// ---------------------------------------------------------------------------
// Cache-Tabellen aktualisieren (nach Spielende / auf Anforderung)
// ---------------------------------------------------------------------------
export async function persistStats() {
  const [players, pairs] = await Promise.all([computePlayerStats(), computePairStats()]);

  for (const p of players) {
    await pool.query(
      `insert into player_stats
        (user_id, games_played, games_won, rounds_played, rounds_won, hakem_rounds,
         hakem_success, double_pos, double_neg, points_for, points_against,
         xp, level, level_title, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now())
       on conflict (user_id) do update set
         games_played=excluded.games_played, games_won=excluded.games_won,
         rounds_played=excluded.rounds_played, rounds_won=excluded.rounds_won,
         hakem_rounds=excluded.hakem_rounds, hakem_success=excluded.hakem_success,
         double_pos=excluded.double_pos, double_neg=excluded.double_neg,
         points_for=excluded.points_for, points_against=excluded.points_against,
         xp=excluded.xp, level=excluded.level, level_title=excluded.level_title,
         updated_at=now()`,
      [
        p.userId, p.gamesPlayed, p.gamesWon, p.roundsPlayed, p.roundsWon,
        p.hakemRounds, p.hakemSuccess, p.doublePos, p.doubleNeg,
        p.pointsFor, p.pointsAgainst, p.xp, p.level, p.title,
      ]
    );
  }

  for (const e of pairs) {
    await pool.query(
      `insert into pair_stats
        (user_a, user_b, games_played, games_won, rounds_played, rounds_won,
         games_as_fire, games_as_storm, wins_as_fire, wins_as_storm,
         points_for, points_against, last_team, last_played_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now())
       on conflict (user_a, user_b) do update set
         games_played=excluded.games_played, games_won=excluded.games_won,
         rounds_played=excluded.rounds_played, rounds_won=excluded.rounds_won,
         games_as_fire=excluded.games_as_fire, games_as_storm=excluded.games_as_storm,
         wins_as_fire=excluded.wins_as_fire, wins_as_storm=excluded.wins_as_storm,
         points_for=excluded.points_for, points_against=excluded.points_against,
         last_team=excluded.last_team, last_played_at=excluded.last_played_at,
         updated_at=now()`,
      [
        e.userA, e.userB, e.gamesPlayed, e.gamesWon, e.roundsPlayed, e.roundsWon,
        e.gamesAsFire, e.gamesAsStorm, e.winsAsFire, e.winsAsStorm,
        e.pointsFor, e.pointsAgainst, e.lastTeam, e.lastPlayedAt,
      ]
    );
  }

  return { players, pairs };
}

// ---------------------------------------------------------------------------
// Express-Routen
// ---------------------------------------------------------------------------
export function registerStatsRoutes(app, requireAuth) {
  const guard = requireAuth || ((req, res, next) => next());

  app.get("/api/stats/levels", (req, res) => res.json({ levels: LEVELS }));

  app.get("/api/stats/players", guard, async (req, res) => {
    try {
      res.json({ players: await computePlayerStats() });
    } catch (e) {
      console.error("stats/players", e);
      res.status(500).json({ error: "stats failed" });
    }
  });

  app.get("/api/stats/pairs", guard, async (req, res) => {
    try {
      res.json({ pairs: await computePairStats() });
    } catch (e) {
      console.error("stats/pairs", e);
      res.status(500).json({ error: "stats failed" });
    }
  });

  // Alles in einem Aufruf – das nutzt der Client für den Statistik-Bericht.
  app.get("/api/stats/overview", guard, async (req, res) => {
    try {
      const [players, pairs] = await Promise.all([computePlayerStats(), computePairStats()]);
      res.json({ players, pairs, levels: LEVELS });
    } catch (e) {
      console.error("stats/overview", e);
      res.status(500).json({ error: "stats failed" });
    }
  });

  // Prognose für eine konkrete Paarung: ?a=<uuid>&b=<uuid>[&c=<uuid>&d=<uuid>]
  app.get("/api/stats/matchup", guard, async (req, res) => {
    try {
      const { a, b, c, d } = req.query;
      if (!a || !b) return res.status(400).json({ error: "a und b erforderlich" });
      const pairs = await computePairStats();
      const find = (x, y) =>
        pairs.find(
          (p) =>
            (p.userA === x && p.userB === y) || (p.userA === y && p.userB === x)
        ) || null;
      const ab = find(a, b);
      const cd = c && d ? find(c, d) : null;
      res.json({
        pair: ab,
        opponent: cd,
        prediction: cd ? matchup(ab, cd) : { pA: ab?.predictedWinProb ?? 0.5 },
      });
    } catch (e) {
      console.error("stats/matchup", e);
      res.status(500).json({ error: "stats failed" });
    }
  });

  app.post("/api/stats/rebuild", guard, async (req, res) => {
    try {
      const r = await persistStats();
      res.json({ ok: true, players: r.players.length, pairs: r.pairs.length });
    } catch (e) {
      console.error("stats/rebuild", e);
      res.status(500).json({ error: "rebuild failed" });
    }
  });
}
