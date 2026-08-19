// admin.js
// Geschützter Admin-Bereich. Alle Auswertungen werden LIVE aus den vorhandenen
// Spieldaten (games / game_players / rounds) berechnet - keine separaten,
// manuell gepflegten Zähler. Zugang nur über requireAdmin (username === 'admin').

import { pool } from "./db.js";
import { persistStats } from "./stats.js";

export function registerAdminRoutes(app, requireAdmin, deps = {}) {
  const { getGameSettings, setGameSettings } = deps;

  // ---- Übersicht (Kennzahlen fürs Dashboard) ----
  app.get("/api/admin/summary", requireAdmin, async (req, res) => {
    try {
      const [users, games, finished, active, players] = await Promise.all([
        pool.query(`select count(*)::int c from users`),
        pool.query(`select count(*)::int c from games`),
        pool.query(
          `select count(*)::int c from games where status='finished' or finished_at is not null`
        ),
        pool.query(`select count(*)::int c from games where status='active'`),
        pool.query(`select count(distinct user_id)::int c from game_players`),
      ]);
      res.json({
        userCount: users.rows[0].c,
        activePlayerCount: players.rows[0].c,
        gameCount: games.rows[0].c,
        finishedCount: finished.rows[0].c,
        activeCount: active.rows[0].c,
        settings: getGameSettings ? getGameSettings() : null,
      });
    } catch (e) {
      console.error("admin/summary", e);
      res.status(500).json({ error: "summary failed" });
    }
  });

  // ---- Spiel-Einstellungen lesen/schreiben ----
  app.get("/api/admin/settings", requireAdmin, (req, res) => {
    res.json(getGameSettings ? getGameSettings() : {});
  });

  app.put("/api/admin/settings", requireAdmin, async (req, res) => {
    try {
      const maxPointsNormal = Number(req.body?.maxPointsNormal);
      const maxPointsJokers = Number(req.body?.maxPointsJokers);
      if (
        (req.body?.maxPointsNormal != null &&
          (!Number.isFinite(maxPointsNormal) || maxPointsNormal <= 0)) ||
        (req.body?.maxPointsJokers != null &&
          (!Number.isFinite(maxPointsJokers) || maxPointsJokers <= 0))
      ) {
        return res.status(400).json({ error: "Werte müssen positive Zahlen sein" });
      }
      const updated = await setGameSettings({ maxPointsNormal, maxPointsJokers });
      res.json({ ok: true, settings: updated });
    } catch (e) {
      console.error("admin/settings PUT", e);
      res.status(500).json({ error: "save failed" });
    }
  });

  // ---- Statistiken zurücksetzen + aus Spieldaten NEU berechnen ----
  // Löscht die Cache-Tabellen vollständig (keine alten/verwaisten Werte)
  // und baut sie ausschließlich aus rounds/games/game_players neu auf.
  app.post("/api/admin/stats/reset", requireAdmin, async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("delete from player_stats");
      await client.query("delete from pair_stats");
      await client.query("commit");
    } catch (e) {
      await client.query("rollback").catch(() => {});
      client.release();
      console.error("admin/stats/reset delete", e);
      return res.status(500).json({ error: "reset failed" });
    }
    client.release();
    try {
      const r = await persistStats(); // rechnet frisch aus den Spieldaten
      res.json({ ok: true, players: r.players.length, pairs: r.pairs.length });
    } catch (e) {
      console.error("admin/stats/reset recompute", e);
      res.status(500).json({ error: "recompute failed" });
    }
  });

  // ---- Registrierte Spieler (Anzahl + Liste mit relevanten Infos) ----
  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const r = await pool.query(
        `select u.id, u.name, u.username, u.role, u.created_at as "createdAt",
                u.avatar_url as "avatarUrl",
                coalesce(gp.games, 0)::int as "gamesPlayed",
                ps.level, ps.level_title as "levelTitle"
           from users u
           left join (
             select user_id, count(distinct game_id) games
               from game_players group by user_id
           ) gp on gp.user_id = u.id
           left join player_stats ps on ps.user_id = u.id
          order by "gamesPlayed" desc, u.created_at asc`
      );
      res.json({ count: r.rows.length, users: r.rows });
    } catch (e) {
      console.error("admin/users", e);
      res.status(500).json({ error: "users failed" });
    }
  });

  // ---- Spiele pro Tag / Monat / Jahr (aus games.created_at) ----
  app.get("/api/admin/games/timeline", requireAdmin, async (req, res) => {
    const gran = String(req.query.granularity || "month");
    const cfg = {
      day: { fmt: "YYYY-MM-DD", trunc: "day", limit: 30 },
      month: { fmt: "YYYY-MM", trunc: "month", limit: 24 },
      year: { fmt: "YYYY", trunc: "year", limit: 20 },
    }[gran] || { fmt: "YYYY-MM", trunc: "month", limit: 24 };
    try {
      const r = await pool.query(
        `select to_char(date_trunc($1, created_at), $2) as period,
                count(*)::int as count
           from games
          group by date_trunc($1, created_at)
          order by date_trunc($1, created_at) desc
          limit $3`,
        [cfg.trunc, cfg.fmt, cfg.limit]
      );
      // aufsteigend zurückgeben (Chart liest links->rechts)
      res.json({ granularity: gran, data: r.rows.reverse() });
    } catch (e) {
      console.error("admin/games/timeline", e);
      res.status(500).json({ error: "timeline failed" });
    }
  });

  // ---- Aktivität: aktivste Spieler + Spiele pro Team ----
  app.get("/api/admin/activity", requireAdmin, async (req, res) => {
    try {
      const [players, teams] = await Promise.all([
        pool.query(
          `select u.id, u.username, u.name,
                  count(distinct gp.game_id)::int as games,
                  count(distinct case when g.winner_team = gp.team then gp.game_id end)::int as wins
             from game_players gp
             join users u on u.id = gp.user_id
             left join games g on g.id = gp.game_id
            group by u.id, u.username, u.name
            order by games desc, wins desc
            limit 50`
        ),
        pool.query(
          `select gp.team,
                  count(distinct gp.game_id)::int as games
             from game_players gp
            where gp.team is not null
            group by gp.team`
        ),
      ]);
      const teamMap = { Fire: 0, Storm: 0 };
      for (const t of teams.rows) teamMap[t.team] = t.games;
      res.json({ players: players.rows, teams: teamMap });
    } catch (e) {
      console.error("admin/activity", e);
      res.status(500).json({ error: "activity failed" });
    }
  });

  // ---- Spielzeiten: Verteilung nach Tageszeit (aus games.created_at) ----
  app.get("/api/admin/hours", requireAdmin, async (req, res) => {
    try {
      const r = await pool.query(
        `select extract(hour from created_at)::int as hour, count(*)::int as count
           from games group by hour order by hour`
      );
      // Buckets: Morgen 5-11, Mittag/Nachmittag 12-17, Abend 18-22, Nacht 23-4
      const buckets = {
        morning: { key: "morning", label: "صبح", range: "۵–۱۱", count: 0 },
        afternoon: { key: "afternoon", label: "ظهر/بعدازظهر", range: "۱۲–۱۷", count: 0 },
        evening: { key: "evening", label: "عصر/شب", range: "۱۸–۲۲", count: 0 },
        night: { key: "night", label: "شب/بامداد", range: "۲۳–۴", count: 0 },
      };
      const byHour = Array.from({ length: 24 }, () => 0);
      for (const row of r.rows) byHour[row.hour] = row.count;
      for (let h = 0; h < 24; h++) {
        const c = byHour[h];
        if (h >= 5 && h <= 11) buckets.morning.count += c;
        else if (h >= 12 && h <= 17) buckets.afternoon.count += c;
        else if (h >= 18 && h <= 22) buckets.evening.count += c;
        else buckets.night.count += c;
      }
      res.json({ buckets: Object.values(buckets), byHour });
    } catch (e) {
      console.error("admin/hours", e);
      res.status(500).json({ error: "hours failed" });
    }
  });
}
