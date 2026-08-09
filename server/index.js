import "dotenv/config";
if (process.env.NODE_ENV !== "production") await import("dotenv/config");

import { pool, dbPing } from "./db.js";
import { Server } from "socket.io";
import http from "http";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import path from "path";
import multer from "multer";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JWT_SECRET = process.env.JWT_SECRET || "dev_change_me";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET","POST"] } });


// ---------- Globale Variablen (MUSS vor ensureActiveGame stehen) ----------
let gameId = null;
let persistQueued = false;

let players = [];          // [{ userId, socketId, name, ... }]
let hands = {};            // userId -> [cards]
let firstUserId = null;

let seats = { 1: null, 2: null, 3: null, 4: null };

let bottomCards = [];
let bids = {};             // userId -> bid
let currentBid = 0;
let currentPlayerIndex = 0;
let biddingActive = false;

let trumpf = null;
let winnerUserId = null;
let forceBidUserId = null;

let randomTeams = false;
let consecutivePasses = 0;
let includeJokers = false;
let showRoundPoints = true;
let currentBottomSize = 4;

let currentTrick = [];         // [{ userId, card }]
let trickLeaderUserId = null;
let tricksPlayed = 0;

let teamScores = { Fire: 0, Storm: 0 };
let roundPoints = { Fire: 0, Storm: 0 };
let roundBottomCards = [];
let roundDiscarded = [];

let trickHistory = [];
let roundsHistory = [];
let roundCounter = 0;

const VARIANTS = { UNDECIDED: "UNDECIDED", NORMAL: "NORMAL", FLIP: "FLIP" };
let roundVariant = VARIANTS.UNDECIDED;
let variantPending = false;

let gamePaused = false;
const disconnectTimers = new Map(); // userId -> Timeout

// ---------- Helpers ----------
function uid(socket) {
  return socket.user?.id || null;
}
function playerByUserId(userId) {
  return players.find((p) => p.userId === userId) || null;
}
function emitToUser(userId, event, payload) {
  const p = playerByUserId(userId);
  if (p?.socketId) io.to(p.socketId).emit(event, payload);
}
function isFirstPlayerSocket(socket) {
  const userId = uid(socket);
  return !!firstUserId && userId === firstUserId;
}

// ---------- DB Snapshot / Restore ----------
function dbSnapshot() {
  return {
    v: 1,
    players: players.map((p) => ({
      userId: p.userId,
      name: p.name,
      username: p.username,
      team: p.team,
      passed: p.passed,
      lastBid: p.lastBid,
      seatPosition: p.seatPosition,
    })),
    seats: {
      1: seats[1]?.userId || null,
      2: seats[2]?.userId || null,
      3: seats[3]?.userId || null,
      4: seats[4]?.userId || null,
    },
    hands,
    bottomCards,
    bids,
    currentBid,
    currentPlayerIndex,
    biddingActive,
    trumpf,
    winnerUserId,
    forceBidUserId,
    randomTeams,
    consecutivePasses,
    includeJokers,
    showRoundPoints,
    currentBottomSize,
    currentTrick,
    trickLeaderUserId,
    tricksPlayed,
    teamScores,
    roundPoints,
    roundBottomCards,
    roundDiscarded,
    trickHistory,
    roundsHistory,
    roundCounter,
    roundVariant,
    variantPending,
    firstUserId,
    gamePaused,
  };
}

function applyLoadedState(s) {
  if (!s) return;

  includeJokers = !!s.includeJokers;
  showRoundPoints = s.showRoundPoints ?? true;
  currentBottomSize = s.currentBottomSize ?? (includeJokers ? 6 : 4);

  players = (s.players || []).map((p) => ({
  ...p,
  socketId: null,
  id: null, // <- wichtig, sonst denkt UI evtl. das wäre noch gültig
}));


  seats = { 1: null, 2: null, 3: null, 4: null };
  const seatMap = s.seats || {};
  for (const pos of [1, 2, 3, 4]) {
    const u = seatMap[pos] || seatMap[String(pos)];
    if (!u) continue;
    const pl = players.find((x) => x.userId === u);
    if (pl) seats[pos] = pl;
  }

  hands = s.hands || {};
  bottomCards = s.bottomCards || [];
  bids = s.bids || {};
  currentBid = s.currentBid || 0;
  currentPlayerIndex = s.currentPlayerIndex || 0;
  biddingActive = !!s.biddingActive;
  trumpf = s.trumpf ?? null;
  winnerUserId = s.winnerUserId ?? null;
  forceBidUserId = s.forceBidUserId ?? null;

  randomTeams = !!s.randomTeams;
  consecutivePasses = s.consecutivePasses || 0;

  currentTrick = s.currentTrick || [];
  trickLeaderUserId = s.trickLeaderUserId ?? null;
  tricksPlayed = s.tricksPlayed || 0;

  teamScores = s.teamScores || { Fire: 0, Storm: 0 };
  roundPoints = s.roundPoints || { Fire: 0, Storm: 0 };
  roundBottomCards = s.roundBottomCards || [];
  roundDiscarded = s.roundDiscarded || [];

  trickHistory = s.trickHistory || [];
  roundsHistory = s.roundsHistory || [];
  roundCounter = s.roundCounter || 0;

  roundVariant = s.roundVariant || VARIANTS.UNDECIDED;
  variantPending = !!s.variantPending;

  firstUserId = s.firstUserId || null;
  gamePaused = !!s.gamePaused;
}

async function ensureActiveGame() {
  const r = await pool.query(
    `select id, current_state
       from games
      where status='active'
      order by updated_at desc
      limit 1`
  );

  if (r.rowCount) {
    gameId = r.rows[0].id;
    applyLoadedState(r.rows[0].current_state);
    console.log("Loaded game:", gameId);
    return;
  }

  gameId = randomUUID();
  await pool.query(
    `insert into games (id, status, first_user_id, include_jokers, show_round_points, current_bottom_size, current_state)
     values ($1,'active',null,$2,$3,$4,$5::jsonb)`,
    [gameId, includeJokers, showRoundPoints, currentBottomSize, dbSnapshot()]
  );
  console.log("Created new game:", gameId);
}

async function persistGameStateNow() {
  if (!gameId) return;
  await pool.query(
    `update games
        set current_state = $1::jsonb,
            first_user_id = coalesce(first_user_id, $2),
            include_jokers = $3,
            show_round_points = $4,
            current_bottom_size = $5,
            updated_at = now()
      where id = $6`,
    [dbSnapshot(), firstUserId, includeJokers, showRoundPoints, currentBottomSize, gameId]
  );
}

// ---------- Öffentlicher Client-Snapshot (Format bleibt wie vor der DB-Integration!) ----------
// WICHTIG: bewusst NICHT dbSnapshot() wiederverwenden - das Format dort ist fürs
// DB-Persistieren gedacht (userId-basiert, keine "id"/"currentPlayer"-Felder).
// App.js erwartet aber weiterhin: players[].id (=socket.id), currentPlayer (Objekt),
// winnerPlayerId, firstClientId, maxBid, maxPoints.
function stateSnapshot() {
  const cp = players[currentPlayerIndex];
  const winnerPlayer = playerByUserId(winnerUserId);
  const firstPlayer = playerByUserId(firstUserId);

  return {
    players: players.map((p) => ({
      id: p.socketId || null, // Frontend matched auf p.id === socket.id
      userId: p.userId,
      name: p.name,
      username: p.username,
      team: p.team,
      passed: p.passed,
      lastBid: p.lastBid,
      seatPosition: p.seatPosition,
    })),
    teamScores,
    roundPoints,
    currentBid,
    biddingActive,
    currentPlayer: cp ? { ...cp, id: cp.socketId || null } : null,
    randomTeams,
    trumpf,
    winnerPlayerId: winnerPlayer ? (winnerPlayer.socketId || winnerPlayer.userId) : null,
    roundVariant,
    tricksPlayed,
    includeJokers,
    currentBottomSize,
    showRoundPoints,
    maxBid: getMaxBid(),
    maxPoints: getMaxPoints(),
    // Fallback auf firstUserId, falls der erste Spieler nach einem Serverneustart
    // noch nicht neu verbunden ist (socketId dann noch null)
    firstClientId: firstPlayer ? (firstPlayer.socketId || firstPlayer.userId) : firstUserId,
  };
}

function persistGameState() {
  if (persistQueued) return;
  persistQueued = true;
  setTimeout(async () => {
    persistQueued = false;
    try { await persistGameStateNow(); }
    catch (e) { console.error("persistGameState error", e); }
  }, 50);
}

// ---------- game_players / rounds / tricks Persistenz ----------
async function persistGamePlayer(userId, seatPosition, team) {
  if (!gameId || !userId) return;
  try {
    // Falls vorher jemand anderes auf diesem Sitz stand, Sitz dort freigeben
    await pool.query(
      `update game_players set seat_position = null
        where game_id = $1 and seat_position = $2 and user_id <> $3`,
      [gameId, seatPosition, userId]
    );
    await pool.query(
      `insert into game_players (game_id, user_id, seat_position, team)
       values ($1, $2, $3, $4)
       on conflict (game_id, user_id)
       do update set seat_position = excluded.seat_position,
                     team = excluded.team,
                     left_at = null`,
      [gameId, userId, seatPosition, team]
    );
  } catch (e) {
    console.error("persistGamePlayer error", e);
  }
}

async function markGamePlayerLeft(userId) {
  if (!gameId || !userId) return;
  try {
    await pool.query(
      `update game_players set left_at = now() where game_id=$1 and user_id=$2`,
      [gameId, userId]
    );
  } catch (e) {
    console.error("markGamePlayerLeft error", e);
  }
}

async function persistRoundAndTricks(roundEntry) {
  if (!gameId) return;
  try {
    const r = await pool.query(
      `insert into rounds
        (game_id, round_no, bidder_user_id, bidder_team, bid, trumpf, round_variant,
         round_points, team_scores_after, rule_applied, delta_applied, bottom_cards, discarded)
       values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11::jsonb,$12::jsonb,$13::jsonb)
       returning id`,
      [
        gameId,
        roundEntry.round,
        roundEntry.bidderId,
        roundEntry.bidderTeam,
        roundEntry.bid,
        roundEntry.trumpf,
        roundEntry.variant,
        roundEntry.roundPoints,
        roundEntry.teamScoresAfter,
        roundEntry.ruleApplied,
        roundEntry.deltaApplied,
        roundEntry.bottomCards,
        roundEntry.discarded,
      ]
    );
    const roundId = r.rows[0].id;

    for (const t of roundEntry.tricks) {
      await pool.query(
        `insert into tricks (round_id, trick_no, lead_suit, trumpf, winner_user_id, winner_team, points, plays)
         values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
        [roundId, t.no, t.leadSuit, t.trumpf, t.winnerId, t.winnerTeam, t.points, t.plays]
      );
    }
  } catch (e) {
    console.error("persistRoundAndTricks error", e);
  }
}

function resetGameState() {
  // Hände/Bottom
  hands = {};
  bottomCards = [];
  bids = {};
  currentBid = 0;
  currentPlayerIndex = 0;
  biddingActive = false;
  trumpf = null;
  winnerUserId = null;
  forceBidUserId = null;
  consecutivePasses = 0;

  // Stich-Status
  currentTrick = [];
  trickLeaderUserId = null;
  tricksPlayed = 0;
  trickHistory = [];

  // Punkte/Zähler
  teamScores = { Fire: 0, Storm: 0 };
  roundPoints = { Fire: 0, Storm: 0 };
  roundsHistory = [];
  roundCounter = 0;

  // Varianten
  roundVariant = VARIANTS.UNDECIDED;
  variantPending = false;

  // Boden-Größe für nächste Runde (4 oder 6)
  currentBottomSize = includeJokers ? 6 : 4;

  // Seats/Players bleiben bewusst erhalten
}

// === Karten Deck ===
const suits = ["♠", "♥", "♣", "♦"];
const ranks = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
];

// === oben in index.js (unter createDeck / shuffle) ===
const SUIT_ORDER = ["♠", "♥", "♣", "♦"];
const RANK_ORDER = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
  "JOKER_BW", // Joker schwarz/weiß
  "JOKER", // Joker farbig
];

function sortCards(cards) {
  return [...cards].sort((a, b) => {
    const ka = sortKey(a);
    const kb = sortKey(b);

    const sDiff = SUIT_ORDER.indexOf(ka.suit) - SUIT_ORDER.indexOf(kb.suit);
    if (sDiff !== 0) return sDiff;
    return ka.rankIndex - kb.rankIndex;
  });
}

function sortKey(card) {
  // Joker speziell behandeln
  if (card === "JOKER_BW") {
    const isFlip = roundVariant === VARIANTS.FLIP;
    const suitForSort = isFlip ? "♠" : trumpf || "♠"; // im Normalfall neben Trumpf/♠
    return { suit: suitForSort, rankIndex: RANK_ORDER.indexOf("JOKER_BW") };
  }
  if (card === "JOKER") {
    const isFlip = roundVariant === VARIANTS.FLIP;
    const suitForSort = isFlip ? "♥" : trumpf || "♥"; // im Normalfall neben Trumpf/♥
    return { suit: suitForSort, rankIndex: RANK_ORDER.indexOf("JOKER") };
  }

  const suit = card.slice(-1);
  const rank = card.slice(0, -1);
  return { suit, rankIndex: RANK_ORDER.indexOf(rank) };
}

function createDeck() {
  const deck = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push(`${rank}${suit}`);
    }
  }

  if (includeJokers) {
    // Codes passen zu  Frontend: "JOKER" & "JOKER_BW"
    deck.push("JOKER_BW"); // schwarz-weiß (card_r07_c06.jpg)
    deck.push("JOKER"); // farbig     (card_r01_c01.jpg)
  }

  return deck;
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// === Sitzordnung festlegen ===
// === Sitzordnung festlegen (aus Sitz-Slots übernehmen) ===
function assignSeats() {
  if (!seatsFull()) return;
  orderPlayersBySeats();
  console.log(
    "Sitzordnung (1=unten, 2=rechts, 3=oben, 4=links):",
    players.map((p) => `${p.name} (${p.team}) @${p.seatPosition}`)
  );
}

function fillRandomTeamsNow() {
  // Liste freier Plätze je Team
  const freeFire = [1, 3].filter((s) => !seats[s]);
  const freeStorm = [2, 4].filter((s) => !seats[s]);

  // Spieler ohne finalen Platz/Team
  const pendings = players.filter((p) => !p.seatPosition);

  for (const p of pendings) {
    // balanciert verteilen
    let seat = null;
    const fireCnt = [seats[1], seats[3]].filter(Boolean).length;
    const stormCnt = [seats[2], seats[4]].filter(Boolean).length;

    if (fireCnt === stormCnt) {
      // zufällig eines der beiden Teams nehmen
      if (Math.random() < 0.5 && freeFire.length) seat = freeFire.shift();
      else if (freeStorm.length) seat = freeStorm.shift();
      else if (freeFire.length) seat = freeFire.shift();
    } else if (fireCnt < stormCnt) {
      if (freeFire.length) seat = freeFire.shift();
    } else if (freeStorm.length) {
      seat = freeStorm.shift();
    }

    if (seat) {
      p.team = SEAT_TEAMS[seat];
      p.seatPosition = seat;
      seats[seat] = p;
    }
  }

  broadcastSeats();
  io.emit("playersUpdate", players);
}

// === Karten austeilen ===
function deal() {
  let deck = createDeck();
  deck = shuffle(deck);
  roundVariant = VARIANTS.UNDECIDED;
  variantPending = false;

  // neue Runde sauber starten
  roundPoints = { Fire: 0, Storm: 0 };
  tricksPlayed = 0;
  currentTrick = [];
  trickHistory = [];
  hands = {};

  const cardsPerPlayer = 12;
  const totalPlayers = players.length;
  const cardsForHands = cardsPerPlayer * totalPlayers;

  currentBottomSize = deck.length - cardsForHands; // 4 oder 6 je nach Joker

  bottomCards = deck.slice(cardsForHands);
  roundBottomCards = bottomCards.slice();
  roundDiscarded = [];

  players.forEach((p, idx) => {
  const start = idx * cardsPerPlayer;
  const end = start + cardsPerPlayer;

  hands[p.userId] = sortCards(deck.slice(start, end));

  if (p.socketId) io.to(p.socketId).emit("hand", hands[p.userId]);
});

  io.emit("roundPointsUpdate", { roundPoints });
}

// === Check ob Bietrunde vorbei ===
// === Auktion beenden? (teamunabhängig) ===
function maybeEndAuction() {
  const active = players.filter((p) => !p.passed);
  const haveAnyBid = Object.keys(bids).length > 0;

  if (haveAnyBid && active.length === 1) {
    biddingActive = false;
    const [winnerId, highestBid] = Object.entries(bids).reduce((a, b) =>
      a[1] > b[1] ? a : b
    );

    winnerUserId = winnerId;
    const winnerPlayer = playerByUserId(winnerId);

    io.emit("biddingResult", { winner: winnerPlayer, bid: highestBid });
    emitToUser(winnerId, "showBottomCards", { bottomCards });

    persistGameState();
    return true;
  }

  if (consecutivePasses >= 3 && haveAnyBid) {
    biddingActive = false;
    const [winnerId, highestBid] = Object.entries(bids).reduce((a, b) =>
      a[1] > b[1] ? a : b
    );

    winnerUserId = winnerId;
    const winnerPlayer = playerByUserId(winnerId);

    io.emit("biddingResult", { winner: winnerPlayer, bid: highestBid });
    emitToUser(winnerId, "showBottomCards", { bottomCards });

    persistGameState();
    return true;
  }

  if (consecutivePasses >= 3 && !haveAnyBid) {
    const notPassed = players.find((p) => !p.passed);
    if (notPassed) {
      forceBidUserId = notPassed.userId;

      emitToUser(notPassed.userId, "yourTurn", {
        currentBid,
        currentPlayer: notPassed,
        mustBid: true,
      });
      io.emit("turnUpdate", { currentPlayer: notPassed });

      persistGameState();
      return true;
    }
  }

  return false;
}


function cardPoints(card) {
  // Joker zuerst
  if (card === "JOKER_BW") return 15; // schwarz/weiß
  if (card === "JOKER") return 20; // farbig

  const rank = card.slice(0, -1);
  if (rank === "A") return 10;
  if (rank === "10") return 10;
  if (rank === "5") return 5;
  return 0;
}

// Kartenrang zum Vergleichen im Stich
const rankOrder = RANK_ORDER;

function splitCard(card) {
  if (card === "JOKER_BW") {
    return { rank: "JOKER_BW", suit: "R" }; // eigenes „R“-Suit intern
  }
  if (card === "JOKER") {
    return { rank: "JOKER", suit: "R" };
  }
  return {
    rank: card.slice(0, -1),
    suit: card.slice(-1),
  };
}

// Für Bedienpflicht etc.
function cardSuitForPlay(card) {
  if (card === "JOKER_BW") {
    // Flip: wie eine ♠-Karte
    if (roundVariant === VARIANTS.FLIP) return "♠";
    // Normal: Joker gehört zur Trumpf-Farbe, solange es schon einen Trumpf gibt
    return trumpf || "R"; // vor Trumpf-Wahl bleibt er eigene „R“-Farbe
  }
  if (card === "JOKER") {
    // Flip: wie eine ♥-Karte
    if (roundVariant === VARIANTS.FLIP) return "♥";
    // Normal: Joker gehört zur Trumpf-Farbe, solange es schon einen Trumpf gibt
    return trumpf || "R";
  }
  // normale Karten: einfach ihre Suit
  return card.slice(-1);
}

/**
 * Liefert die "angespielte Farbe" des aktuellen Stiches.
 * – Normale Karte: einfach ihre Farbe
 * – Joker als erste Karte:
 *     NORMAL  -> Trumpf-Farbe (falls gewählt), sonst "R" = keine Pflicht
 *     FLIP    -> ♠ für JOKER_BW, ♥ für JOKER
 *     UNDECIDED -> "R" = keine Pflicht, bis Richter gewählt hat
 */
function getLeadSuit() {
  if (!currentTrick.length) return null;

  const first = currentTrick[0].card;

  // Joker als erste Karte
  if (first === "JOKER" || first === "JOKER_BW") {
    if (roundVariant === VARIANTS.NORMAL) {
      // Normal-Runde: Joker gehört zur Trumpf-Farbe, falls schon gesetzt
      return trumpf || "R"; // noch kein Trumpf -> keine Bedienpflicht
    }
    if (roundVariant === VARIANTS.FLIP) {
      // Flip: fester Suit
      return first === "JOKER_BW" ? "♠" : "♥";
    }
    // Variante noch unklar
    return "R";
  }

  // Normale Karte: Suit der Karte
  return first.slice(-1);
}

function compareCards(cardA, cardB, leadSuit, trumpSuit, isFlip = false) {
  const a = splitCard(cardA);
  const b = splitCard(cardB);
  const isJokerA = a.rank === "JOKER" || a.rank === "JOKER_BW";
  const isJokerB = b.rank === "JOKER" || b.rank === "JOKER_BW";

  if (isFlip) {
    // Flip: Kein Trumpf, kleine Karten sind höher, Joker sind am schwächsten.
    const suitA =
      a.rank === "JOKER_BW" ? "♠" : a.rank === "JOKER" ? "♥" : a.suit;
    const suitB =
      b.rank === "JOKER_BW" ? "♠" : b.rank === "JOKER" ? "♥" : b.suit;

    const aLed = suitA === leadSuit;
    const bLed = suitB === leadSuit;
    if (aLed && !bLed) return 1;
    if (!aLed && bLed) return -1;

    if (aLed && bLed) {
      const ia = RANK_ORDER.indexOf(a.rank);
      const ib = RANK_ORDER.indexOf(b.rank);
      if (ia === -1 || ib === -1) return 0;

      // 2 höchster, A danach ... Joker ganz hinten (niedrigste)
      const diff = ib - ia; // ia < ib → A stärker
      if (diff > 0) return 1;
      if (diff < 0) return -1;
      return 0;
    }
    return 0;
  }

  // Normal: Joker > Ass, farbiger Joker > s/w-Joker
  if (isJokerA || isJokerB) {
    if (isJokerA && isJokerB) {
      const ia = RANK_ORDER.indexOf(a.rank);
      const ib = RANK_ORDER.indexOf(b.rank);
      if (ia > ib) return 1; // "JOKER" schlägt "JOKER_BW"
      if (ia < ib) return -1;
      return 0;
    }
    return isJokerA ? 1 : -1;
  }

  const suitA = a.suit;
  const suitB = b.suit;

  // Trumpf
  if (suitA === trumpSuit && suitB !== trumpSuit) return 1;
  if (suitB === trumpSuit && suitA !== trumpSuit) return -1;

  if (suitA === trumpSuit && suitB === trumpSuit) {
    const ia = RANK_ORDER.indexOf(a.rank);
    const ib = RANK_ORDER.indexOf(b.rank);
    if (ia > ib) return 1;
    if (ia < ib) return -1;
    return 0;
  }

  // Angespielte Farbe
  if (suitA === leadSuit && suitB !== leadSuit) return 1;
  if (suitB === leadSuit && suitA !== leadSuit) return -1;

  if (suitA === leadSuit && suitB === leadSuit) {
    const ia = RANK_ORDER.indexOf(a.rank);
    const ib = RANK_ORDER.indexOf(b.rank);
    if (ia > ib) return 1;
    if (ia < ib) return -1;
    return 0;
  }

  return 0;
}

function startNewRound() {
  // Reset
  players.forEach((p) => {
    p.passed = false;
    p.lastBid = null;
  });
  consecutivePasses = 0;
  forceBidUserId = null;
  bids = {};
  currentBid = 0;
  winnerUserId = null;
  trumpf = null;

  // <-- wichtig: Reset sofort an alle Clients pushen
  io.emit("playersUpdate", players);

  // Startspieler rotiert gegen Uhrzeigersinn
  currentPlayerIndex = (currentPlayerIndex + 1) % players.length;
  biddingActive = true;

  deal(); // schickt auch roundPoints=0

  // ersten Bieter informieren
  const next = players[currentPlayerIndex];
  emitToUser(next.userId, "yourTurn", { currentBid, currentPlayer: next });
io.emit("turnUpdate", { currentPlayer: next });

}
// JWT im Handshake auswerten (optional, aber empfohlen)
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (token) {
      const p = jwt.verify(token, JWT_SECRET);
      socket.user = {
        id: p.sub,
        name: p.name,
        username: p.username,
        email: p.email,
      };
    }
  } catch (e) {
    // ungültiges Token → ohne user; Frontend darf dann nicht ins Spiel
  }
  next();
});
// === Socket.io Events ===
io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);
  socket.on("register", (payload) => {
  const userId = uid(socket);
  const payloadName = typeof payload === "string" ? payload : (payload?.name || "");
  const finalName = String(socket.user?.name || payloadName || "").trim();

  if (!userId || !finalName) {
    socket.emit("invalidAction", { msg: "Bitte zuerst anmelden." });
    return;
  }

  let existing = playerByUserId(userId);

  if (existing) {
    if (disconnectTimers.has(userId)) {
      clearTimeout(disconnectTimers.get(userId));
      disconnectTimers.delete(userId);
    }

    existing.socketId = socket.id;
    existing.id = socket.id;
    existing.name = finalName;
    if (socket.user?.username) existing.username = socket.user.username;

    if (existing.seatPosition) seats[existing.seatPosition] = existing;

    if (hands[userId]) io.to(socket.id).emit("hand", hands[userId]);
    if (winnerUserId === userId && bottomCards?.length) {
      io.to(socket.id).emit("showBottomCards", { bottomCards });
    }

    socket.emit("stateSync", stateSnapshot());
    socket.emit("roundsHistoryUpdate", { roundsHistory });
    io.emit("playersUpdate", players);

    persistGameState();
    maybeResumeGame();
    return;
  }

  if (players.length >= 4) {
    socket.emit("lobbyFull", { msg: "Lobby voll (max. 4 Spieler)" });
    return;
  }

  const player = {
    userId,
    socketId: socket.id,
    id: socket.id,
    name: finalName,
    username: socket.user?.username || null,
    team: null,
    passed: false,
    lastBid: null,
    seatPosition: null,
  };

  if (!firstUserId) firstUserId = userId;

  players.push(player);

  socket.emit("stateSync", stateSnapshot());
  socket.emit("roundsHistoryUpdate", { roundsHistory });
  players.forEach(p => { if (p.socketId) p.id = p.socketId; });
  io.emit("playersUpdate", players);

  persistGameState();
  maybeResumeGame();
});


  socket.on("chooseSeat", ({ seat }) => {
  const userId = uid(socket);
  const player = playerByUserId(userId);
  if (!player) return;

  if (Object.keys(hands).length || biddingActive) {
    socket.emit("invalidAction", { msg: "Sitzwechsel ist nur vor Rundenstart möglich." });
    return;
  }

  if (![1,2,3,4].includes(seat)) return;

  if (seats[seat] && seats[seat].userId !== userId) {
    socket.emit("invalidAction", { msg: "Dieser Platz ist bereits belegt." });
    return;
  }

  if (player.seatPosition && seats[player.seatPosition]?.userId === userId) {
    seats[player.seatPosition] = null;
  }

  seats[seat] = player;
  player.seatPosition = seat;
  player.team = SEAT_TEAMS[seat];

  persistGamePlayer(userId, seat, player.team);

  if (seatsFull()) orderPlayersBySeats();
  broadcastSeats();
  io.emit("playersUpdate", players);

  persistGameState();
});


  socket.on("leaveSeat", () => {
  const userId = uid(socket);
  const player = playerByUserId(userId);
  if (!player) return;

  if (Object.keys(hands).length || biddingActive) {
    socket.emit("invalidAction", { msg: "Sitz verlassen ist nur vor Rundenstart möglich." });
    return;
  }

  if (player.seatPosition && seats[player.seatPosition]?.userId === userId) {
    seats[player.seatPosition] = null;
  }

  player.seatPosition = null;
  player.team = null;

  markGamePlayerLeft(userId);

  broadcastSeats();
  io.emit("playersUpdate", players);
  persistGameState();
});


  socket.on("chooseTeam", (team) => {
    const player = playerByUserId(uid(socket));

    if (!player) return;

    if (team !== "Random") {
      socket.emit("invalidAction", {
        msg: "Teams werden über Sitzplätze gewählt. Bitte einen Platz (1..4) anklicken.",
      });
      return;
    }

    if (!seatsEmpty()) {
      socket.emit("invalidAction", {
        msg: "Random ist nur möglich, solange alle Plätze frei sind.",
      });
      return;
    }

    // nur vom serverseitig ersten Spieler
    if (!isFirstPlayerSocket(socket)) {
      socket.emit("invalidAction", {
        msg: "Nur der erste Spieler darf Random Teams starten.",
      });
      return;
    }

    fillRandomTeamsNow();
  });

  socket.on("startGame", () => {
    if (!isFirstPlayerSocket(socket)) {
      return;
    }
    // nur starten, wenn 4 Plätze belegt und noch keine Runde läuft
    if (!seatsFull()) {
      socket.emit("invalidAction", {
        msg: "Alle 4 Sitzplätze müssen belegt sein.",
      });
      return;
    }
    if (Object.keys(hands).length || biddingActive) {
      socket.emit("invalidAction", { msg: "Eine Runde läuft bereits." });
      return;
    }

    assignSeats(); // Sitzreihenfolge aus 1..4
    players.forEach((p) => {
      p.passed = false;
      p.lastBid = null;
    });
    consecutivePasses = 0;
    forceBidUserId = null;
    bids = {};
    currentBid = 0;
    currentPlayerIndex = 0; // Sitz 1 beginnt
    biddingActive = true;

    deal(); // teilt aus & sendet Hands/RoundPoints

    const next = players[currentPlayerIndex];
    emitToUser(next.userId, "yourTurn", { currentBid, currentPlayer: next });
io.emit("turnUpdate", { currentPlayer: next });

    io.emit("playersUpdate", players);
  });

  socket.on("setIncludeJokers", ({ value }) => {
    if (!isFirstPlayerSocket(socket)) {
      return;
    }
    // nur vor Rundenstart
    if (Object.keys(hands).length || biddingActive) {
      socket.emit("invalidAction", {
        msg: "Joker können nur vor Rundenstart geändert werden.",
      });
      return;
    }

    includeJokers = !!value;
    currentBottomSize = includeJokers ? 6 : 4;
    io.emit("stateSync", stateSnapshot());
  });
  socket.on("setShowRoundPoints", ({ value }) => {
    if (!isFirstPlayerSocket(socket)) {
      return;
    }

    // hier ist es egal, ob die Runde schon läuft – es ist nur eine Anzeige-Option
    showRoundPoints = !!value;
    io.emit("stateSync", stateSnapshot());
  });

  // Spiel hart zurücksetzen (Spieler/Seats bleiben)
  socket.on("resetGame", () => {
    if (!isFirstPlayerSocket(socket)) {
      return;
    }
    resetGameState();
    // allen sofort den neuen Grundzustand schicken
    io.emit("gameReset", stateSnapshot());
    io.emit("roundsHistoryUpdate", { roundsHistory });
    broadcastSeats(); // falls UI sich darauf verlässt
  });

  socket.on("setVariant", ({ variant }) => {
    // Nur der Startspieler (Richter) darf wählen
    if (uid(socket) !== winnerUserId) return;
    if (!variant) return;
    const leaderIdx = players.findIndex(p => p.userId === trickLeaderUserId);
if (leaderIdx === -1) return;
currentPlayerIndex = (leaderIdx + 1) % players.length;

    // Erlaubte Werte:
    const isSuitChoice = suits.includes(variant); // ["♠","♥","♣","♦"]
    const isFlipChoice = variant === "FLIP";
    const isNormalChoice = variant === "NORMAL";

    if (!isSuitChoice && !isFlipChoice && !isNormalChoice) return;

    variantPending = false;
    let justSetTrump = null;

    if (isFlipChoice) {
      // Flip: kein Trumpf
      roundVariant = VARIANTS.FLIP;
      trumpf = null;
    } else {
      // Alles andere ist eine Normal-Runde
      roundVariant = VARIANTS.NORMAL;

      if (isSuitChoice) {
        // Joker als erste Karte → Spieler wählt explizite Trumpf-Farbe
        trumpf = variant;
        justSetTrump = trumpf;
        io.emit("trumpChosen", {
          trumpf,
          winner: players.find((p) => p.userId === winnerUserId),
        });
      } else if (!trumpf && currentTrick[0]) {
        // "NORMAL" wie bisher: Trumpf = Farbe der ersten Karte,
        // aber nur wenn diese Karte kein Joker ist
        const firstCard = currentTrick[0].card;
        if (firstCard !== "JOKER" && firstCard !== "JOKER_BW") {
          justSetTrump = firstCard.slice(-1);
          trumpf = justSetTrump;
          io.emit("trumpChosen", {
            trumpf,
            winner: players.find((p) => p.userId === winnerUserId),
          });
        }
        // Falls doch Joker + "NORMAL" geschickt wird -> kein auto-Trumpf
      }
    }

    io.emit("variantChosen", { variant: roundVariant, trumpf: justSetTrump });

    // Falls genau 1 Karte liegt (wir hatten pausiert): jetzt weiterspielen lassen
   if (currentTrick.length === 1) {
  const leaderIdx = players.findIndex(p => p.userId === trickLeaderUserId);
  currentPlayerIndex = (leaderIdx + 1 + players.length) % players.length;
  const next = players[currentPlayerIndex];
  emitToUser(next.userId, "yourTurn", { currentBid, currentPlayer: next });
  io.emit("turnUpdate", { currentPlayer: next });
  persistGameState();
}

  });

  socket.on("makeBid", (bid) => {
  if (!biddingActive) return;

  const userId = uid(socket);
  const player = playerByUserId(userId);
  if (!player) return;

  const maxBid = getMaxBid();

  if (bid !== 0) {
    const minAllowed = Math.max(100, currentBid + 5);
    const isStepOk = bid % 5 === 0;
    if (!isStepOk || bid < minAllowed || bid > maxBid) {
      socket.emit("invalidAction", {
        msg: `Ungültiges Gebot. Erlaubt: mindestens ${minAllowed}, höchstens ${maxBid}, in 5er-Schritten.`,
      });

      emitToUser(userId, "yourTurn", {
        currentBid,
        currentPlayer: player,
        mustBid: forceBidUserId === userId,
      });
      io.emit("turnUpdate", { currentPlayer: player });
      return;
    }
  }

  if (forceBidUserId === userId && bid === 0) {
    emitToUser(userId, "yourTurn", {
      currentBid,
      currentPlayer: player,
      mustBid: true,
    });
    io.emit("turnUpdate", { currentPlayer: player });
    return;
  }

  if (bid === 0) {
    player.passed = true;
    player.lastBid = null;
    consecutivePasses++;
  } else {
    currentBid = bid;
    bids[userId] = bid;
    player.lastBid = bid;
    consecutivePasses = 0;
    forceBidUserId = null;

    if (currentBid >= maxBid) {
      biddingActive = false;
      winnerUserId = userId;
      io.emit("biddingResult", { winner: player, bid: currentBid });
      emitToUser(userId, "showBottomCards", { bottomCards });
      persistGameState();
      return;
    }
  }

  io.emit("playersUpdate", players);

  if (maybeEndAuction()) return;

  do {
    currentPlayerIndex = (currentPlayerIndex + 1) % players.length;
  } while (players[currentPlayerIndex].passed);

  const next = players[currentPlayerIndex];
  emitToUser(next.userId, "yourTurn", { currentBid, currentPlayer: next, mustBid: false });
  io.emit("turnUpdate", { currentPlayer: next });

  persistGameState();
});


socket.on("takeBottomCards", () => {
  const userId = uid(socket);
  const player = playerByUserId(userId);
  if (!player) return;

  if (userId !== winnerUserId) return;
  if (!hands[userId]) return;

  hands[userId] = sortCards([...hands[userId], ...bottomCards]);
  bottomCards = [];

  io.to(player.socketId).emit("hand", hands[userId]);
  io.to(player.socketId).emit("discardPhase", {
    hand: hands[userId],
    bottomSize: currentBottomSize,
  });

  persistGameState();
});


  socket.on("discardCards", (selected) => {
  const userId = uid(socket);
  const player = playerByUserId(userId);
  if (!player) return;

  if (userId !== winnerUserId) return;
  if (!hands[userId]) return;
  if (!Array.isArray(selected) || selected.length !== currentBottomSize) return;

  hands[userId] = sortCards(hands[userId].filter((c) => !selected.includes(c)));
  roundDiscarded = selected.slice();

  // Stich 0 Punkte (intern)
  let discardPoints = 5;
  selected.forEach((c) => (discardPoints += cardPoints(c)));

  const winner = playerByUserId(winnerUserId);
  if (winner) roundPoints[winner.team] += discardPoints;

  io.to(player.socketId).emit("hand", hands[userId]);
  io.to(player.socketId).emit("discardDone");

  trumpf = null;

  // Startspieler = winnerUserId
  currentPlayerIndex = players.findIndex((p) => p.userId === winnerUserId);
  const startPlayer = players[currentPlayerIndex];

  emitToUser(startPlayer.userId, "yourTurn", { currentBid, currentPlayer: startPlayer });
  io.emit("turnUpdate", { currentPlayer: startPlayer });

  persistGameState();
});


  // --- PlayCard Event erweitern ---
  socket.on("playCard", (card) => {
  const userId = uid(socket);
  const player = playerByUserId(userId);
  if (!player) return;

  if (!hands[userId]) return;
  if (!hands[userId].includes(card)) return;

  // Bedienpflicht
  if (currentTrick.length > 0) {
    const leadSuit = getLeadSuit();
    if (leadSuit !== "R") {
      const hasLead = hands[userId].some((c) => cardSuitForPlay(c) === leadSuit);
      if (cardSuitForPlay(card) !== leadSuit && hasLead) return;
    }
  }

  // Karte entfernen + Hand senden
  hands[userId] = hands[userId].filter((c) => c !== card);
  if (player.socketId) io.to(player.socketId).emit("hand", hands[userId]);

  // Trick aktualisieren (intern nur userId!)
  currentTrick.push({ userId, card });

  const isFirstInTrick = currentTrick.length === 1;
  if (isFirstInTrick) {
    trickLeaderUserId = userId;

    // Richter entscheidet Variante nach erster Karte
    if (userId === winnerUserId) {
      if (roundVariant === VARIANTS.UNDECIDED) {
        variantPending = true;

        const isJokerStart = card === "JOKER" || card === "JOKER_BW";
        emitToUser(userId, "askVariant", {
          options: isJokerStart ? ["♠", "♥", "♣", "♦", "FLIP"] : ["NORMAL", "FLIP"],
        });
      } else if (roundVariant === VARIANTS.NORMAL && !trumpf) {
        if (card !== "JOKER" && card !== "JOKER_BW") {
          trumpf = card.slice(-1);
          io.emit("trumpChosen", { trumpf, winner: player });
        }
      }
    }
  }

  // Für UI: sende beides (compat)
  io.emit("cardPlayed", { userId, playerId: player.socketId, card });

  // 4 Karten -> auswerten
  if (currentTrick.length === 4) {
    const leadSuit = getLeadSuit();

    let winner = currentTrick[0]; // {userId, card}
    for (let i = 1; i < 4; i++) {
      const cmp = compareCards(
        currentTrick[i].card,
        winner.card,
        leadSuit,
        trumpf,
        roundVariant === VARIANTS.FLIP
      );
      if (cmp > 0) winner = currentTrick[i];
    }

    let trickPoints = 5;
    currentTrick.forEach((c) => (trickPoints += cardPoints(c.card)));

    const winnerPlayer = playerByUserId(winner.userId);
    if (winnerPlayer) roundPoints[winnerPlayer.team] += trickPoints;

    // Für UI: cards auch mit playerId mitschicken
    const cardsForUi = currentTrick.map((x) => ({
      userId: x.userId,
      playerId: playerByUserId(x.userId)?.socketId || null,
      card: x.card,
    }));

    io.emit("trickResult", {
      winner: winnerPlayer,
      cards: cardsForUi,
      points: trickPoints,
      roundPoints,
    });
    io.emit("roundPointsUpdate", { roundPoints });

    tricksPlayed++;

    // History: sauber userId-basiert
    const plays = currentTrick.map(({ userId, card }) => {
      const pl = playerByUserId(userId);
      return { userId, name: pl?.name || "", team: pl?.team || "", card };
    });

    trickHistory.push({
      no: tricksPlayed,
      plays,
      leadSuit,
      trumpf,
      winnerId: winner.userId,
      winnerName: winnerPlayer?.name || "",
      winnerTeam: winnerPlayer?.team || "",
      points: trickPoints,
    });

    currentTrick = [];
    currentPlayerIndex = players.findIndex((p) => p.userId === winner.userId);

    if (tricksPlayed === 12) {
      endRound();
    } else {
      const next = players[currentPlayerIndex];
      emitToUser(next.userId, "yourTurn", { currentBid, currentPlayer: next });
      io.emit("turnUpdate", { currentPlayer: next });
    }

    persistGameState();
    return;
  }

  // <4 Karten: nächste Person dran (außer Variant pending nach erster Karte)
  if (!(currentTrick.length === 1 && variantPending)) {
    currentPlayerIndex = (currentPlayerIndex + 1) % players.length;
    const next = players[currentPlayerIndex];

    emitToUser(next.userId, "yourTurn", { currentBid, currentPlayer: next });
    io.emit("turnUpdate", { currentPlayer: next });
  }

  persistGameState();
});


  // --- Rundenauswertung ---
  function endRound() {
    const bidder = players.find((p) => p.userId === winnerUserId) || {};
    const DOUBLE_NEGATIVE_MIN = getDoubleNegativeMin();
    const bidderTeam = bidder.team;
    const otherTeam = bidderTeam === "Fire" ? "Storm" : "Fire";
    const bid = bids[winnerUserId] || 0;

    // Stiche zählen (für Doppel-Positiv)
    const fireTrickCount = trickHistory.filter(
      (t) => t.winnerTeam === "Fire"
    ).length;
    const stormTrickCount = trickHistory.filter(
      (t) => t.winnerTeam === "Storm"
    ).length;
    const bidderTrickCount =
      bidderTeam === "Fire" ? fireTrickCount : stormTrickCount;
    const otherTrickCount =
      otherTeam === "Fire" ? fireTrickCount : stormTrickCount;
    const shutout = otherTrickCount === 0; // Gegner 0 Stiche

    // Punkte dieser Runde je Team
    const bidderPts = roundPoints[bidderTeam] || 0;
    const otherPts = roundPoints[otherTeam] || 0;

    // Delta, was wir auf den Gesamtstand draufrechnen
    const delta = { Fire: 0, Storm: 0 };
    let ruleApplied = "normal"; // "doublePositive" | "doubleNegative" | "normal"

    if (shutout) {
      // Doppel-Positiv
      delta[bidderTeam] += 2 * bid;
      // anderes Team bekommt 0
      ruleApplied = "doublePositive";
    } else if (bidderPts < bid) {
      // Gebot verfehlt
      if (otherPts >= DOUBLE_NEGATIVE_MIN) {
        // Doppel-Negativ
        delta[bidderTeam] -= 2 * bid;
        delta[otherTeam] += otherPts; // Gegner behält seine erspielten Punkte
        ruleApplied = "doubleNegative";
      } else {
        // Normale Strafe
        delta[bidderTeam] -= bid;
        delta[otherTeam] += otherPts;
      }
    } else {
      // Gebot geschafft -> normale Rundensumme zählt
      delta[bidderTeam] += bidderPts;
      delta[otherTeam] += otherPts;
    }

    // Auf Gesamtpunktestand anwenden
    teamScores.Fire += delta.Fire;
    teamScores.Storm += delta.Storm;

    // Chronik-Eintrag
    roundCounter += 1;

    const roundEntry = {
      round: roundCounter,
      bidderId: winnerUserId || null,
      bidderName: bidder.name || null,
      bidderTeam: bidderTeam || null,
      bidderUsername: bidder.username || null,
      bid, // kommt von: const bid = bids[winnerUserId] || 0;
      trumpf: trumpf || null,
      variant: roundVariant,

      // Punkte & Verlauf
      roundPoints: { ...roundPoints },
      teamScoresAfter: { ...teamScores },
      tricks: trickHistory.map((t) => ({ ...t })),
      bottomCards: roundBottomCards.slice(),
      discarded: roundDiscarded.slice(),

      // Zusatzinfos
      fireTrickCount,
      stormTrickCount,
      ruleApplied,
      doubleNegativeThreshold: DOUBLE_NEGATIVE_MIN,
      deltaApplied: { ...delta },
    };
    roundsHistory.push(roundEntry);

    persistRoundAndTricks(roundEntry);

    // Sieger nach Stichpunkten
    const roundWinnerTeam =
      roundPoints.Fire === roundPoints.Storm
        ? null
        : roundPoints.Fire > roundPoints.Storm
        ? "Fire"
        : "Storm";

    const finalTrumpf = roundEntry.trumpf; // Trumpf der beendeten Runde merken
    const finalVariant = roundVariant; // (falls du ihn später brauchst)

    // direkt nach Rundenschluss HUD-Status resetten
    trumpf = null;
    roundVariant = VARIANTS.UNDECIDED;
    winnerUserId = null; // Krone/„Richter“ im HUD auch weg

    // Events an Clients
    io.emit("roundEnd", {
      roundPoints,
      teamScores,
      roundWinnerTeam,
      bidderName: roundEntry.bidderName,
      bidderTeam: roundEntry.bidderTeam,
      bid: roundEntry.bid,
      trumpf: finalTrumpf,
      tricks: roundEntry.tricks,
      bottomCards: roundEntry.bottomCards,
      discarded: roundEntry.discarded,
      ruleApplied,
      deltaApplied: roundEntry.deltaApplied,
      doubleNegativeThreshold: DOUBLE_NEGATIVE_MIN,
    });
    io.emit("roundsHistoryUpdate", { roundsHistory });

    biddingActive = true; // signalisiert „Runde aktiv/Übergang“
    io.emit("stateSync", stateSnapshot());
    // ► kurze Pause, damit 'trickResult' & Recap sichtbar bleiben
    setTimeout(() => {
      // Reset erst jetzt – oder direkt in startNewRound/deal kapseln
      tricksPlayed = 0;
      roundPoints = { Fire: 0, Storm: 0 };
      trumpf = null;
      hands = {};
      bottomCards = [];
      bids = {};
      winnerUserId = null;
      trickHistory = [];

      // Spielende?
      // Spielende?
      const maxPoints = getMaxPoints();
      if (teamScores.Fire >= maxPoints || teamScores.Storm >= maxPoints) {
        const winner = teamScores.Fire >= maxPoints ? "Fire" : "Storm";
        io.emit("gameOver", { winner, teamScores, maxPoints });
        return;
      }

      // Nächste Runde
      startNewRound();
    }, 1800); // 2s passt zu Client-Animation
  }
  socket.on("disconnect", () => {
  const leaving = players.find((p) => p.socketId === socket.id);
  if (!leaving) return;

  const userId = leaving.userId;

  if (disconnectTimers.has(userId)) return;

  disconnectTimers.set(
    userId,
    setTimeout(() => {
      // nach 15s wirklich entfernen
      const idx = players.findIndex((p) => p.userId === userId);
      if (idx !== -1) {
        const p = players[idx];
        if (p.seatPosition && seats[p.seatPosition]?.userId === userId) {
          seats[p.seatPosition] = null;
        }
        players.splice(idx, 1);
      }

      disconnectTimers.delete(userId);
      markGamePlayerLeft(userId);

      if (players.length < 4) {
        gamePaused = true;
        io.emit("gamePaused", { reason: "player_left" });
      }

      broadcastSeats();
      io.emit("playersUpdate", players);

      persistGameState();
    }, 15000)
  );

  io.emit("playerMaybeBackSoon", { userId, timeoutSec: 15 });
});


  function maybeResumeGame() {
    if (players.length === 4 && gamePaused) {
      gamePaused = false;
      io.emit("gameResumed");
    }
  }

  socket.on("getRoundsHistory", () => {
    socket.emit("roundsHistoryUpdate", { roundsHistory });
  });
  socket.on("requestState", () => {
  const userId = uid(socket);

  socket.emit("stateSync", stateSnapshot());
  socket.emit("roundsHistoryUpdate", { roundsHistory });

  if (userId && hands[userId]) {
    io.to(socket.id).emit("hand", hands[userId]);
  }

  const isHisTurn = players[currentPlayerIndex]?.userId === userId;
  if (biddingActive && isHisTurn) {
    io.to(socket.id).emit("yourTurn", {
      currentBid,
      currentPlayer: players[currentPlayerIndex],
      mustBid: forceBidUserId === userId,
    });
  }
});

});

// === Server Start ===
const PORT = process.env.PORT || 3001;
await dbPing();
await ensureActiveGame();
server.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
});