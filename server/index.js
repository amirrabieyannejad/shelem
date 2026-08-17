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
import { runMigrations } from "./migrate.js";
import { estimateRoundWinProbability } from "./probability.js";
import { registerStatsRoutes, persistStats } from "./stats.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JWT_SECRET = process.env.JWT_SECRET || "dev_change_me";

const app = express();
app.use(express.json({ limit: "6mb" })); // Avatar kommt als base64 im PATCH /api/me mit
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
// WICHTIG: Render (und die meisten Hosting-Plattformen) haben ein FLÜCHTIGES
// Dateisystem - Dateien, die zur Laufzeit auf die Festplatte geschrieben
// werden (wie es "dest:"-basiertes multer bisher tat), gehen bei jedem
// Neustart/Redeploy/Idle-Sleep verloren. Genau das war der Bug: avatar_url
// zeigte auf eine Datei, die es serverseitig gar nicht mehr gab -> 404,
// kaputtes <img>. Fix: Bild direkt als base64 data-URL in der DB speichern
// (avatarSrc() im Client unterstützt data:-URLs bereits nativ), kein Datei-
// system-Zwischenspeicher mehr nötig.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1.2 * 1024 * 1024 }, // 1.2MB Original (~1.6MB als base64)
  fileFilter: (req, file, cb) => {
    if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.mimetype)) {
      return cb(new Error("Nur Bilddateien (png/jpg/webp/gif) erlaubt"));
    }
    cb(null, true);
  },
});

const server = http.createServer(app);

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim())
  : [
      "http://localhost:3000",
      "https://shelem-ruby.vercel.app",
      "https://shelem.onrender.com",
    ];
app.use(cors({ origin: allowedOrigins, credentials: true }));

const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ["GET", "POST"] },
  // Sicherheitsnetz: falls je ein Event versehentlich mehr Daten schickt als
  // das Standardlimit (1MB) erlaubt, soll die Verbindung nicht sofort
  // gekappt werden (sonst: sofortiger Reconnect -> Endlosschleife wie beim
  // base64-Avatar-Bug). Wir schicken selbst nichts Großes mehr über Sockets,
  // das hier ist nur ein Puffer für die Zukunft.
  maxHttpBufferSize: 3 * 1024 * 1024,
});

// ---------- Auth Helpers (DB-basiert) ----------
const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  username: u.username,
  email: u.email,
  phone: u.phone || null,
  avatarUrl: u.avatarUrl || null,
  createdAt: u.createdAt,
});

async function dbUserById(id) {
  const r = await pool.query(
    `select id, name, username, email, phone, avatar_url as "avatarUrl",
            created_at as "createdAt", password_hash as "passwordHash"
       from users where id = $1 limit 1`,
    [id]
  );
  return r.rows[0] || null;
}
async function dbUserByUsernameOrEmail(key) {
  const r = await pool.query(
    `select id, name, username, email, phone, avatar_url as "avatarUrl",
            created_at as "createdAt", password_hash as "passwordHash"
       from users where lower(username) = $1 or lower(email) = $1 limit 1`,
    [key]
  );
  return r.rows[0] || null;
}
async function dbUsernameExists(uname) {
  const r = await pool.query(`select 1 from users where lower(username) = $1 limit 1`, [uname]);
  return r.rowCount > 0;
}
async function dbEmailExists(mail) {
  const r = await pool.query(`select 1 from users where lower(email) = $1 limit 1`, [mail]);
  return r.rowCount > 0;
}

// ---------- Auth API ----------
app.post("/api/auth/register", async (req, res) => {
  const { name, username, email, password, phone = null, avatarUrl = null } = req.body || {};
  if (!name || !username || !email || !password) {
    return res.status(400).json({ error: "name, username, email, password sind erforderlich" });
  }
  const uname = String(username).trim().toLowerCase();
  const mail = String(email).trim().toLowerCase();
  if (String(password).length < 6) {
    return res.status(400).json({ error: "Passwort min. 6 Zeichen" });
  }
  try {
    if (await dbUsernameExists(uname)) {
      return res.status(409).json({ error: "Benutzername belegt" });
    }
    if (await dbEmailExists(mail)) {
      return res.status(409).json({ error: "E-Mail belegt" });
    }
    const hash = await bcrypt.hash(String(password), 10);
    const id = randomUUID();
    const r = await pool.query(
      `insert into users (id, name, username, email, password_hash, phone, avatar_url, role, email_verified)
       values ($1, $2, $3, $4, $5, $6, $7, 'player', false)
       returning id, name, username, email, phone, avatar_url as "avatarUrl", created_at as "createdAt"`,
      [id, String(name).trim(), uname, mail, hash, phone, avatarUrl]
    );
    const user = r.rows[0];
    const token = jwt.sign(
      { sub: user.id, name: user.name, username: user.username, email: user.email },
      JWT_SECRET,
      { expiresIn: "30d" }
    );
    return res.json({ token, profile: publicUser(user) });
  } catch (e) {
    if (e && e.code === "23505") {
      return res.status(409).json({ error: "Benutzername oder E-Mail belegt" });
    }
    console.error("register error", e);
    return res.status(500).json({ error: "Serverfehler" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { usernameOrEmail, password } = req.body || {};
  if (!usernameOrEmail || !password) {
    return res.status(400).json({ error: "usernameOrEmail & password erforderlich" });
  }
  const key = String(usernameOrEmail).trim().toLowerCase();
  try {
    const user = await dbUserByUsernameOrEmail(key);
    if (!user) return res.status(401).json({ error: "Ungültige Zugangsdaten" });
    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Ungültige Zugangsdaten" });
    const token = jwt.sign(
      { sub: user.id, name: user.name, username: user.username, email: user.email },
      JWT_SECRET,
      { expiresIn: "30d" }
    );
    return res.json({ token, profile: publicUser(user) });
  } catch (e) {
    console.error("login error", e);
    return res.status(500).json({ error: "Serverfehler" });
  }
});

app.post("/api/upload-avatar", (req, res) => {
  upload.single("avatar")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || "Upload fehlgeschlagen" });
    if (!req.file) return res.status(400).json({ error: "Keine Datei" });
    const base64 = req.file.buffer.toString("base64");
    const url = `data:${req.file.mimetype};base64,${base64}`;
    return res.json({ url });
  });
});

// Liefert das Avatarbild eines Users als echtes <img> (Content-Type image/*),
// NICHT als JSON/base64. Grund: die Sitzplätze am Tisch bekommen ihre Daten
// per Socket.IO-Broadcast (players[]) an ALLE Clients bei JEDER Änderung
// (Sitzwechsel, Bid, Disconnect, ...). Würde dort das base64-Bild jedes
// Spielers mitgeschickt, könnte das bei mehreren Spielern mit Foto pro
// Broadcast mehrere MB groß werden -> Socket.IO-Frame-Limit -> Verbindung
// bricht ab -> Reconnect-Schleife (genau der Bug, den wir gerade hatten).
// Lösung: players[].avatarUrl enthält nur noch die leichte Referenz-URL
// "/api/avatar/<userId>" - der Browser lädt das eigentliche Bild separat
// per normalem, cachebarem HTTP-GET, komplett am Socket vorbei.
app.get("/api/avatar/:userId", async (req, res) => {
  try {
    const u = await dbUserById(req.params.userId);
    const raw = u?.avatarUrl;
    if (!raw) return res.status(404).end();
    const m = /^data:([^;]+);base64,(.+)$/.exec(raw);
    if (!m) {
      // Alter, direkt gespeicherter Pfad/URL (Rückwärtskompatibilität) -
      // einfach dorthin weiterleiten.
      return res.redirect(raw);
    }
    const [, mime, base64] = m;
    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.end(Buffer.from(base64, "base64"));
  } catch (e) {
    return res.status(500).end();
  }
});

// Profil ändern: Anzeigename, E-Mail, Avatar und optional das Passwort.
// Der Benutzername (username) bleibt bewusst unveränderlich.
app.patch("/api/me", async (req, res) => {
  const hdr = req.headers.authorization || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
  let payload = null;
  try {
    payload = token ? jwt.verify(token, JWT_SECRET) : null;
  } catch {
    payload = null;
  }
  if (!payload) return res.status(401).json({ error: "Unauthorized" });

  const user = await dbUserById(payload.sub);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { name, email, avatarUrl, currentPassword, newPassword } = req.body || {};

  try {
    if (newPassword) {
      if (String(newPassword).length < 8)
        return res.status(400).json({ error: "رمز جدید حداقل ۸ نویسه" });
      const ok = await bcrypt.compare(String(currentPassword || ""), user.passwordHash);
      if (!ok) return res.status(400).json({ error: "رمز فعلی درست نیست" });
      const hash = await bcrypt.hash(String(newPassword), 10);
      await pool.query("update users set password_hash = $1 where id = $2", [hash, user.id]);
    }

    const nextName = name != null ? String(name).trim().slice(0, 40) : user.name;
    const nextMail = email != null ? String(email).trim().toLowerCase() : user.email;
    const nextAva = avatarUrl !== undefined ? avatarUrl : user.avatarUrl;

    const r = await pool.query(
      `update users set name = $1, email = $2, avatar_url = $3
         where id = $4
       returning id, name, username, email, phone, avatar_url as "avatarUrl",
                 created_at as "createdAt"`,
      [nextName, nextMail, nextAva, user.id]
    );
    return res.json({ profile: publicUser(r.rows[0]) });
  } catch (e) {
    console.error("patch /api/me", e);
    if (String(e.code) === "23505")
      return res.status(409).json({ error: "این ایمیل قبلاً ثبت شده" });
    return res.status(500).json({ error: "Serverfehler" });
  }
});

app.get("/api/me", async (req, res) => {
  const hdr = req.headers.authorization || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
  try {
    const payload = token ? jwt.verify(token, JWT_SECRET) : null;
    if (!payload) return res.status(401).json({ error: "Unauthorized" });
    const user = await dbUserById(payload.sub);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    return res.json({ profile: publicUser(user) });
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
});

// Auth-Middleware für die Statistik-Endpunkte (gleiche Logik wie /api/me)
async function requireAuth(req, res, next) {
  const hdr = req.headers.authorization || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
  try {
    const payload = token ? jwt.verify(token, JWT_SECRET) : null;
    if (!payload) return res.status(401).json({ error: "Unauthorized" });
    const user = await dbUserById(payload.sub);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

// /api/stats/players, /api/stats/pairs, /api/stats/overview, /api/stats/matchup
registerStatsRoutes(app, requireAuth);

// ---------- Globale Variablen (MUSS vor ensureActiveGame stehen) ----------

// =====================================================================
// Multi-Room Refactor: Der komplette Spiel-State + alle Handler leben
// jetzt pro Raum in dieser Closure. Die Spiel-Logik selbst ist unveraendert;
// nur "io.emit(...)" wurde zu "roomEmit(...)" (nur an diesen Raum) gemacht.
// =====================================================================
const rooms = new Map();          // roomId -> room
const socketRoom = new Map();     // socketId -> roomId

function createRoom(roomId, roomName = "Raum", restoreRow = null) {
  const roomEmit = (ev, p) => io.to(roomId).emit(ev, p);

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

// Kartenlage beim ersten Stich (nach Boden-Tausch/Abwurf). Basis für die
// Monte-Carlo-Schätzung "Wie wahrscheinlich war es, dass der Hakem sein Gebot
// erfüllt?" – wird am Rundenende ausgewertet und mit der Runde persistiert.
let roundStartSnapshot = null;

const VARIANTS = { UNDECIDED: "UNDECIDED", NORMAL: "NORMAL", FLIP: "FLIP" };
let roundVariant = VARIANTS.UNDECIDED;
let variantPending = false;

let gamePaused = false;
const disconnectTimers = new Map(); // userId -> Timeout

// bei den globalen Variablen ergänzen
let firstBidderIndex = 0;

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
    roundStartSnapshot,
    roundVariant,
    variantPending,
    firstUserId,
    gamePaused,
    firstBidderIndex,
    roomId,
    roomName,
  };
}

function applyLoadedState(s) {
  if (!s) return;

  includeJokers = !!s.includeJokers;
  showRoundPoints = s.showRoundPoints ?? true;
  currentBottomSize = s.currentBottomSize ?? (includeJokers ? 6 : 4);
  firstBidderIndex = s.firstBidderIndex || 0;
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
  roundStartSnapshot = s.roundStartSnapshot || null;

  roundVariant = s.roundVariant || VARIANTS.UNDECIDED;
  variantPending = !!s.variantPending;

  firstUserId = s.firstUserId || null;
  gamePaused = !!s.gamePaused;
  if (s.roomName) roomName = s.roomName;
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

  return {
    players: players.map((p) => ({
      id: p.socketId || null, // Frontend matched auf p.id === socket.id
      userId: p.userId,
      name: p.name,
      username: p.username,
      avatarUrl: p.avatarUrl || null,
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
    // WICHTIG: "wer ist dran / wer muss zwangsweise bieten" wurde bisher
    // ausschließlich über das einmalige "yourTurn"-Event kommuniziert - kam
    // dieses aus irgendeinem Grund nicht (korrupter Reconnect-Zustand,
    // verpasstes Event, zweiter Disconnect mittendrin) beim Client an, gab es
    // KEINE Möglichkeit, sich davon zu erholen: das Bieten-Popup blieb
    // dauerhaft weg und niemand konnte mehr bieten. Jetzt zusätzlich userId-
    // basiert (stabil, unabhängig von socket.id-Wechseln) im wiederholbaren
    // stateSync-Snapshot mitschicken, damit der Client sich JEDERZEIT (auch
    // rein aus einem Refresh/Reconnect heraus, ohne "yourTurn" abzuwarten)
    // selbst korrekt als "ich bin dran"/"ich muss zwingend bieten" erkennen
    // kann.
    currentPlayerUserId: cp ? cp.userId : null,
    forceBidUserId: forceBidUserId || null,
    randomTeams,
    trumpf,
    winnerPlayerId: winnerPlayer ? (winnerPlayer.socketId || winnerPlayer.userId) : null,
    roundVariant,
    tricksPlayed,
    includeJokers,
    currentBottomSize,
    showRoundPoints,
    // Bereits in diesem Stich gespielte Karten - ohne dieses Feld sieht der Tisch
    // nach einem Refresh mitten im Stich leer aus, weil "cardPlayed" nur einmalig
    // (live) gesendet wird und beim Reconnect nie wiederholt wird.
    currentTrick: currentTrick.map((c) => {
      const p = playerByUserId(c.userId);
      return { userId: c.userId, playerId: p?.socketId || null, card: c.card };
    }),
    maxBid: getMaxBid(),
    maxPoints: getMaxPoints(),
    // Fallback auf firstUserId, falls der erste Spieler nach einem Serverneustart
    // noch nicht neu verbunden ist (socketId dann noch null)
    firstClientId: firstUserId,
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

// ---------- Spielabschluss & neues Spiel ----------
// Ohne einen echten Abschluss liesse sich "gewonnene Spiele" nie auswerten:
// bisher wurde immer dieselbe games-Zeile weiterbenutzt, dadurch kollidierten
// nach einem "بازی جدید" auch die rounds (unique game_id/round_no) und gingen
// still verloren.
async function finishCurrentGame(winnerTeam, maxPoints) {
  if (!gameId) return;
  try {
    await pool.query(
      `update games
          set winner_team  = coalesce(winner_team, $1),
              final_scores = coalesce(final_scores, $2::jsonb),
              max_points   = coalesce(max_points, $3),
              finished_at  = coalesce(finished_at, now()),
              status       = case when coalesce(winner_team, $1) is not null
                                  then 'finished' else 'archived' end,
              updated_at   = now()
        where id = $4`,
      [winnerTeam || null, JSON.stringify(teamScores), maxPoints || null, gameId]
    );
  } catch (e) {
    console.error("finishCurrentGame error", e);
  }
}

async function startFreshGame() {
  try {
    const newId = randomUUID();
    await pool.query(
      `insert into games (id, status, first_user_id, include_jokers, show_round_points, current_bottom_size, current_state)
       values ($1,'active',$2,$3,$4,$5,$6::jsonb)`,
      [newId, firstUserId, includeJokers, showRoundPoints, currentBottomSize, dbSnapshot()]
    );
    gameId = newId;
    // Sitzplätze/Teams ins neue Spiel übernehmen
    for (const pos of [1, 2, 3, 4]) {
      const pl = seats[pos];
      if (pl?.userId) await persistGamePlayer(pl.userId, pos, pl.team);
    }
    console.log("Neues Spiel angelegt:", gameId);
  } catch (e) {
    console.error("startFreshGame error", e);
  }
}

// Nach Spielende: Ergebnis sichern, Lebenszeit-Statistik neu berechnen
async function finalizeGameAndStats(winnerTeam, maxPoints) {
  await finishCurrentGame(winnerTeam, maxPoints);
  try {
    await persistStats();
    io.emit("statsUpdated", { reason: "gameOver", winner: winnerTeam || null });
  } catch (e) {
    console.error("persistStats error", e);
  }
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

// Sitz/Team eines Users für das aktuelle Spiel aus der DB nachladen.
// Wird beim Reconnect gebraucht, wenn der Spieler zwischenzeitlich wegen
// Inaktivität (15s-Disconnect-Timer) komplett aus players[]/seats gelöscht wurde,
// damit er nicht faelschlich mit team:null (=> falsche Farbe im UI) neu einsteigt.
async function dbGamePlayerSeat(gId, userId) {
  if (!gId || !userId) return null;
  try {
    const r = await pool.query(
      `select seat_position as "seatPosition", team
         from game_players
        where game_id = $1 and user_id = $2
        limit 1`,
      [gId, userId]
    );
    return r.rows[0] || null;
  } catch (e) {
    console.error("dbGamePlayerSeat error", e);
    return null;
  }
}

async function persistRoundAndTricks(roundEntry) {
  if (!gameId) return;
  try {
    const r = await pool.query(
      `insert into rounds
        (game_id, round_no, bidder_user_id, bidder_team, bid, trumpf, round_variant,
         round_points, team_scores_after, rule_applied, delta_applied, bottom_cards, discarded,
         bid_success, round_winner_team, win_prob)
       values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11::jsonb,$12::jsonb,$13::jsonb,
               $14,$15,$16::jsonb)
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
        // WICHTIG: bottomCards/discarded sind JS-Arrays. Der pg-Treiber serialisiert
        // rohe Arrays als Postgres-Array-Literal ({"a","b"}), nicht als JSON - das
        // scheitert dann am ::jsonb-Cast ("invalid input syntax for type json").
        // Objekte (roundPoints, teamScoresAfter, deltaApplied) serialisiert pg
        // automatisch per JSON.stringify, Arrays müssen wir daher explizit stringifyen.
        JSON.stringify(roundEntry.bottomCards),
        JSON.stringify(roundEntry.discarded),
        roundEntry.bidSuccess ?? null,
        roundEntry.roundWinnerTeam ?? null,
        roundEntry.winProb ? JSON.stringify(roundEntry.winProb) : null,
      ]
    );
    const roundId = r.rows[0].id;

    for (const t of roundEntry.tricks) {
      await pool.query(
        `insert into tricks (round_id, trick_no, lead_suit, trumpf, winner_user_id, winner_team, points, plays)
         values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
        [roundId, t.no, t.leadSuit, t.trumpf, t.winnerId, t.winnerTeam, t.points, JSON.stringify(t.plays)]
      );
    }
  } catch (e) {
    console.error("persistRoundAndTricks error", e);
  }
}

// ---------- Gebot-/Punkte-Obergrenzen (mit/ohne Joker) ----------
const MAX_BID_NORMAL = 165;
const MAX_BID_JOKERS = 200;
const MAX_POINTS_NORMAL = 1165;
const MAX_POINTS_JOKERS = 1600;

function getMaxBid() {
  return includeJokers ? MAX_BID_JOKERS : MAX_BID_NORMAL;
}
function getMaxPoints() {
  return includeJokers ? MAX_POINTS_JOKERS : MAX_POINTS_NORMAL;
}
// Mindestens 80, oder die (aufgerundete) Hälfte des Maximalgebots
function getDoubleNegativeMin() {
  const mb = getMaxBid();
  return Math.max(80, Math.ceil(mb / 2));
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
  firstBidderIndex = 0;

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
  roundStartSnapshot = null;

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

// ---------- Sitzplätze (1..4) mit fixen Teams ----------
const SEAT_TEAMS = { 1: "Fire", 2: "Storm", 3: "Fire", 4: "Storm" };

function seatsEmpty() {
  return !seats[1] && !seats[2] && !seats[3] && !seats[4];
}
function seatsFull() {
  return !!seats[1] && !!seats[2] && !!seats[3] && !!seats[4];
}
// Entfernt "Geisterbesetzungen" aus seats[]: Referenzen auf Spieler, die
// nicht (mehr) in players[] stehen. seats[] und players[] sind zwei separate
// Server-Arrays, die sich in Edge-Cases (hakelige Reconnects, Race-Conditions
// beim register-Handler) desynchronisieren können - ein Platz gilt dann
// serverseitig als belegt, obwohl das Client-UI (das rein aus players[]
// abgeleitet wird) ihn als frei anzeigt, und niemand kann sich draufsetzen.
function pruneGhostSeats() {
  for (const s of [1, 2, 3, 4]) {
    if (seats[s] && !players.some((p) => p.userId === seats[s].userId)) {
      seats[s] = null;
    }
  }
}
// Reihenfolge aus Sitzen übernehmen (seatPosition NICHT überschreiben)
function orderPlayersBySeats() {
  players = [seats[1], seats[2], seats[3], seats[4]].filter(Boolean);
}
function broadcastSeats() {
  roomEmit("seatsUpdate", {
    seats: {
      1: seats[1]?.name || null,
      2: seats[2]?.name || null,
      3: seats[3]?.name || null,
      4: seats[4]?.name || null,
    },
  });
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
      // WICHTIG: bei manueller Sitzwahl (chooseSeat) wird der Sitz/Team in
      // game_players persistiert - bei Random-Teams fehlte das bisher komplett.
      // Ohne das hier landet der Spieler nach einem Reconnect (z.B. nach dem
      // 15s-Disconnect-Purge) mit team:null wieder in der Lobby und erscheint
      // faelschlich in der Default-Farbe (blau) statt seiner Teamfarbe.
      persistGamePlayer(p.userId, seat, p.team);
    }
  }

  broadcastSeats();
  roomEmit("playersUpdate", players);
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
  roundStartSnapshot = null;

  players.forEach((p, idx) => {
  const start = idx * cardsPerPlayer;
  const end = start + cardsPerPlayer;

  hands[p.userId] = sortCards(deck.slice(start, end));

  if (p.socketId) io.to(p.socketId).emit("hand", hands[p.userId]);
});

  roomEmit("roundPointsUpdate", { roundPoints });
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

    roomEmit("biddingResult", { winner: winnerPlayer, bid: highestBid });
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

    roomEmit("biddingResult", { winner: winnerPlayer, bid: highestBid });
    emitToUser(winnerId, "showBottomCards", { bottomCards });

    persistGameState();
    return true;
  }

  if (consecutivePasses >= 3 && !haveAnyBid) {
    const notPassed = players.find((p) => !p.passed);
    if (notPassed) {
      forceBidUserId = notPassed.userId;
      // WICHTIG: makeBid() bricht bei "if (maybeEndAuction()) return;" VOR der
      // eigentlichen Index-Weiterschaltung (do{currentPlayerIndex=...}while) ab.
      // Ohne dieses explizite Nachziehen blieb currentPlayerIndex auf dem zuletzt
      // passenden Spieler stehen, obwohl "notPassed" (hier) korrekt per yourTurn/
      // turnUpdate informiert wurde. Bei einem Reconnect/Refresh dieses zuletzt
      // passenden Spielers prüfen register/requestState aber players[currentPlayerIndex]
      // - fanden dort faelschlich wieder IHN und schickten ihm erneut "yourTurn",
      // obwohl er bereits gepasst hatte.
      currentPlayerIndex = players.findIndex((p) => p.userId === notPassed.userId);

      emitToUser(notPassed.userId, "yourTurn", {
        currentBid,
        currentPlayer: notPassed,
        mustBid: true,
      });
      roomEmit("turnUpdate", { currentPlayer: notPassed, currentBid });

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
  roomEmit("playersUpdate", players);

  // Startspieler rotiert gegen Uhrzeigersinn
  firstBidderIndex = (firstBidderIndex + 1) % players.length;
  currentPlayerIndex = firstBidderIndex;

  biddingActive = true;

  deal(); // schickt auch roundPoints=0

  // ersten Bieter informieren
  const next = players[currentPlayerIndex];
  emitToUser(next.userId, "yourTurn", { currentBid, currentPlayer: next });
roomEmit("turnUpdate", { currentPlayer: next, currentBid });

}
// === Socket.io Events ===
  // ===== Spieler betritt DIESEN Raum (registriert Spiel-Handler + Reconnect-Sync) =====
  function attachPlayer(socket) {
    socket.join(roomId);
    socketRoom.set(socket.id, roomId);
    socket.data.roomId = roomId;
    socket.data.spectator = false;
  console.log("Player connected:", socket.id);
  socket.on("register", async (payload) => {
  const userId = uid(socket);
  const payloadName = typeof payload === "string" ? payload : (payload?.name || "");
  const finalName = String(socket.user?.name || payloadName || "").trim();

  if (!userId || !finalName) {
    socket.emit("invalidAction", { msg: "Bitte zuerst anmelden." });
    return;
  }

  // avatarUrl wird bewusst NICHT vom Client übernommen (kann als base64
  // mehrere hundert KB groß sein und würde Socket.IOs maxHttpBufferSize
  // sprengen -> Verbindungsabbruch -> Reconnect-Schleife). Stattdessen holen
  // wir hier nur ab, OB ein Avatar existiert, und setzen players[].avatarUrl
  // auf die leichte Referenz-URL /api/avatar/<userId> (siehe Endpunkt oben).
  // undefined = DB-Abfrage fehlgeschlagen -> alten Wert unangetastet lassen.
  let freshAvatarRef;
  try {
    const dbUser = await dbUserById(userId);
    freshAvatarRef = dbUser?.avatarUrl ? `/api/avatar/${userId}` : null;
  } catch (e) {
    freshAvatarRef = undefined;
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
    existing.avatarUrl = freshAvatarRef !== undefined ? freshAvatarRef : existing.avatarUrl;

    if (existing.seatPosition) seats[existing.seatPosition] = existing;
  } else {
    if (players.length >= 4) {
      socket.emit("lobbyFull", { msg: "Lobby voll (max. 4 Spieler)" });
      return;
    }

    // Spieler war evtl. schon mal in DIESEM Spiel (Sitz/Team in game_players
    // gespeichert), wurde aber wegen des 15s-Disconnect-Timers komplett aus
    // players[]/seats entfernt (z. B. wenn alle über Nacht offline waren).
    // Ohne diesen Lookup würde er mit team:null neu einsteigen und im UI
    // faelschlich in der Default-Farbe (blau) statt seiner Team-Farbe erscheinen.
    const saved = await dbGamePlayerSeat(gameId, userId);
    console.log(
      `[reconnect] ${finalName} (userId=${userId}, game=${gameId}) -> game_players lookup:`,
      saved
    );

    // WICHTIG: Race-Guard. "register" ist async (wegen des await oben) - laeuft
    // fast zeitgleich ein ZWEITER "register" fuer denselben userId (z.B. weil
    // der Client beim Login/Reconnect zwei "connect"-Handler feuert), sah
    // dieser zweite Aufruf "existing" oben noch als null (der erste Aufruf
    // hatte zu diesem Zeitpunkt noch nicht gepusht) und legte den Spieler
    // dadurch ein ZWEITES Mal in players[] an. Ergebnis: zwei Eintraege mit
    // derselben userId, von denen nur einer einen Sitzplatz bekam - der
    // andere ueberschrieb kurz danach mit einem eigenen (evtl. abweichenden)
    // Broadcast den sichtbaren Zustand, wodurch z.B. ein gerade gezeigtes
    // Gebot-Badge gleich wieder verschwand. Fix: direkt nach dem await erneut
    // pruefen, ob der Spieler in der Zwischenzeit schon angelegt wurde - falls
    // ja, diesen bestehenden Eintrag einfach auffrischen statt zu duplizieren.
    const raceCheck = playerByUserId(userId);
    if (raceCheck) {
      existing = raceCheck;
      existing.socketId = socket.id;
      existing.id = socket.id;
      existing.name = finalName;
      if (socket.user?.username) existing.username = socket.user.username;
      existing.avatarUrl = freshAvatarRef !== undefined ? freshAvatarRef : existing.avatarUrl;
      if (existing.seatPosition) seats[existing.seatPosition] = existing;
    } else {

    existing = {
      userId,
      socketId: socket.id,
      id: socket.id,
      name: finalName,
      username: socket.user?.username || null,
      avatarUrl: freshAvatarRef ?? null,
      team: saved?.team || null,
      passed: false,
      // WICHTIG: bids{} lebt unabhängig von players[] weiter (wird erst bei
      // startNewRound()/endRound() geleert). Ohne diesen Rückgriff wurde ein
      // Spieler, der zwischenzeitlich wegen des 15s-Disconnect-Timers aus
      // players[] gepurged wurde, beim Reconnect hart mit lastBid:null neu
      // angelegt - sein zuvor abgegebenes Gebot verschwand dadurch aus der
      // Anzeige (grüne Zahl neben seinem Kreis), obwohl es serverseitig
      // (bids[userId]) weiterhin gültig war.
      lastBid: bids[userId] ?? null,
      seatPosition: null,
    };

    if (saved?.seatPosition && !seats[saved.seatPosition]) {
      seats[saved.seatPosition] = existing;
      existing.seatPosition = saved.seatPosition;
    }

    if (!firstUserId) firstUserId = userId;

    players.push(existing);

    // WICHTIG: Das Frontend bestimmt die Sitzreihenfolge am Tisch NICHT aus
    // seatPosition, sondern rein aus der Reihenfolge im players[]-Array
    // (getSeatingOrder() rotiert relativ zur eigenen Position im Array).
    // Ein simples push() hängt reconnectete Spieler ans Ende an und
    // zerstört damit die Sitzreihenfolge -> am Tisch sieht es danach so
    // aus, als wären Teams/Partner vertauscht (Partner sitzen sich normal
    // gegenüber, nach dem Anhängen sitzen sie plötzlich woanders), obwohl
    // seatPosition/team serverseitig unverändert korrekt sind. Deshalb nach
    // jedem Wiedereinstieg eines Spielers mit bekanntem Sitz die Reihenfolge
    // konsistent nach Sitzplatz sortieren - und currentPlayerIndex dabei
    // anhand der userId (nicht des Index!) neu verankern, damit "wer ist
    // dran" dabei nicht verrutscht.
    if (existing.seatPosition) {
      const turnUserId = players[currentPlayerIndex]?.userId ?? null;
      players.sort((a, b) => (a.seatPosition ?? 99) - (b.seatPosition ?? 99));
      if (turnUserId) {
        const relocated = players.findIndex((p) => p.userId === turnUserId);
        if (relocated !== -1) currentPlayerIndex = relocated;
      }
    }
    } // Ende race-guard "else" (echter Neuanlage-Zweig)
  }

  // WICHTIG: Sonderfall Zwangsgebot (forceBidUserId). War dieser Spieler der
  // EINZIGE, der noch nicht gepasst hatte, und wurde er zwischenzeitlich wegen
  // des 15s-Disconnect-Timers gepurged, gab es beim Purge KEINEN anderen noch
  // aktiven Spieler mehr, auf den currentPlayerIndex hätte umspringen können -
  // er blieb dadurch auf einem bereits gepassten Spieler stehen (siehe disconnect-
  // Handler weiter unten) und wurde beim Wiedereinstieg auch nicht korrigiert,
  // weil das Sortieren dort nur den ALTEN (falschen) currentPlayer erneut sucht.
  // Da forceBidUserId aber unverändert korrekt auf ihn zeigt, hier currentPlayerIndex
  // direkt auf ihn zurücksetzen, statt sich auf die Index-Verankerung oben zu
  // verlassen - sonst bekommt er sein Zwangsgebot-Popup nach dem Reconnect nie
  // wieder und das Spiel bleibt hängen (niemand kann mehr bieten).
  if (biddingActive && forceBidUserId === userId) {
    const meIdx = players.findIndex((p) => p.userId === userId);
    if (meIdx !== -1) currentPlayerIndex = meIdx;
  }

  // ---- Ab hier: EIN gemeinsamer Resync-Block für Reconnect UND neu erstellte
  // Spieler. Wichtig: ein "neuer" Spieler (oberer else-Zweig) kann trotzdem
  // mitten in einer laufenden Runde stecken (z.B. als Richter/Bieter), wenn er
  // zwischenzeitlich wegen des 15s-Disconnect-Timers aus players[] gelöscht
  // wurde. Lief dieser Resync bisher NUR im "existing"-Zweig, blieben bei
  // anderen, längst verbundenen Clients die alte (ungültige) socket.id dieses
  // Spielers als judge/winner hängen -> "(?)" statt Name im UI, falsche
  // Team-Zuordnung bei der Rundenpunkte-Anzeige, und er selbst bekam seine
  // Hand/Abwurf-Phase/"du bist dran" nicht zurück.
  if (hands[userId]) io.to(socket.id).emit("hand", hands[userId]);
  if (winnerUserId === userId && bottomCards?.length) {
    io.to(socket.id).emit("showBottomCards", { bottomCards });
  }
  // Richter hat Kartenberg bereits übernommen (bottomCards ist schon leer),
  // aber noch nicht abgeworfen -> Hand ist größer als die normalen 12 Karten.
  // Ohne diesen Re-Emit verliert der Client die Abwurf-Phase bei Reconnect/Refresh.
  if (winnerUserId === userId && hands[userId] && hands[userId].length > 12) {
    io.to(socket.id).emit("discardPhase", {
      hand: hands[userId],
      bottomSize: currentBottomSize,
    });
  }
  // Bietrunde ist vorbei (Richter steht fest), aber der einmalige "biddingResult"-
  // Event kommt sonst nie wieder -> Client zeigt Ziel/هدف dann als 0 an.
  // Die anderen, längst verbundenen Clients haben "winner.id" noch als die ALTE
  // (jetzt ungültige) socket.id von diesem Spieler gespeichert -> ihr judgeId-Vergleich
  // schlägt fehl, Krone/Ausblendung des eigenen Rundenpunkte-Feldes verschwinden fälschlich.
  // Vor Trickstart (kein trumpf) ist ein Broadcast an alle sicher. Läuft der Stich
  // schon, würde ein Broadcast bei ALLEN currentPlayer/isMyTurn fälschlich auf den
  // Bietgewinner zurücksetzen -> dann nur an den reconnectenden Client selbst schicken.
  if (winnerUserId && !biddingActive) {
    const winnerPlayer = playerByUserId(winnerUserId);
    if (winnerPlayer) {
      if (!trumpf) {
        roomEmit("biddingResult", { winner: winnerPlayer, bid: currentBid });
      } else {
        io.to(socket.id).emit("biddingResult", { winner: winnerPlayer, bid: currentBid });
      }
    }
  }
  // Gleiches Problem für den Trumpf-Richter (trumpChosen). judgeId im Frontend
  // bevorzugt trumpfSetter.id vor biddingWinner.winner.id - auch das muss also
  // mit der aktuellen socket.id aufgefrischt werden, sobald sich irgendjemand
  // neu verbindet (nicht nur der Richter selbst). trumpChosen rührt currentPlayer/
  // isMyTurn nicht an, daher ist ein Broadcast hier immer unbedenklich.
  if (trumpf && winnerUserId) {
    const winnerPlayer = playerByUserId(winnerUserId);
    if (winnerPlayer) {
      roomEmit("trumpChosen", { trumpf, winner: winnerPlayer });
    }
  }
  // "yourTurn" ist ebenfalls nur ein einmaliger Event. Ist gerade wirklich er
  // am Zug (Gebot ODER Stich spielen, aber Abwurf-Phase muss vorbei sein),
  // muss das nach Reconnect erneut geschickt werden - sonst bleibt der Client
  // hängen ("ich kann nicht mehr spielen"), obwohl der Server längst wartet.
  {
    const discardPending =
      winnerUserId && hands[winnerUserId] && hands[winnerUserId].length > 12;
    // WICHTIG: zusätzlich "|| forceBidUserId === userId" als Absicherung -
    // siehe Kommentar weiter oben zum Zwangsgebot-Sonderfall.
    const isHisTurn =
      players[currentPlayerIndex]?.userId === userId ||
      (biddingActive && forceBidUserId === userId);
    if (isHisTurn && biddingActive) {
      io.to(socket.id).emit("yourTurn", {
        currentBid,
        currentPlayer: players[currentPlayerIndex],
        mustBid: forceBidUserId === userId,
      });
    } else if (isHisTurn && !discardPending && winnerUserId) {
      io.to(socket.id).emit("yourTurn", {
        currentBid,
        currentPlayer: players[currentPlayerIndex],
      });
    }
  }

  // Geisterbesetzungen aufräumen (siehe pruneGhostSeats()) - läuft bei
  // jedem Connect/Register mit, damit sich ein blockierter Platz auch ohne
  // aktiven Klick von selbst wieder löst.
  pruneGhostSeats();

  socket.emit("stateSync", stateSnapshot());
  socket.emit("roundsHistoryUpdate", { roundsHistory });
  players.forEach(p => { if (p.socketId) p.id = p.socketId; });
  roomEmit("playersUpdate", players);
  broadcastSeats();

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

  // Selbstheilung gegen "Geisterbesetzungen" (siehe pruneGhostSeats()).
  pruneGhostSeats();

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
  roomEmit("playersUpdate", players);

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
  roomEmit("playersUpdate", players);
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
    firstBidderIndex = 0;
    biddingActive = true;

    deal(); // teilt aus & sendet Hands/RoundPoints

    const next = players[currentPlayerIndex];
    emitToUser(next.userId, "yourTurn", { currentBid, currentPlayer: next });
roomEmit("turnUpdate", { currentPlayer: next, currentBid });

    roomEmit("playersUpdate", players);
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
    roomEmit("stateSync", stateSnapshot());
  });
  socket.on("setShowRoundPoints", ({ value }) => {
    if (!isFirstPlayerSocket(socket)) {
      return;
    }

    // hier ist es egal, ob die Runde schon läuft – es ist nur eine Anzeige-Option
    showRoundPoints = !!value;
    roomEmit("stateSync", stateSnapshot());
  });

  // Spiel hart zurücksetzen (Spieler/Seats bleiben)
  socket.on("resetGame", async () => {
    if (!isFirstPlayerSocket(socket)) {
      return;
    }
    // Altes Spiel abschliessen (Sieger falls erreicht, sonst archivieren) und
    // eine NEUE games-Zeile anlegen. Sonst kollidieren die Runden des neuen
    // Spiels mit unique(game_id, round_no) und würden nicht gespeichert.
    const maxPoints = getMaxPoints();
    const reachedWinner =
      teamScores.Fire >= maxPoints ? "Fire"
      : teamScores.Storm >= maxPoints ? "Storm"
      : null;
    await finishCurrentGame(reachedWinner, maxPoints);

    resetGameState();
    await startFreshGame();

    // allen sofort den neuen Grundzustand schicken
    roomEmit("gameReset", stateSnapshot());
    roomEmit("roundsHistoryUpdate", { roundsHistory });
    broadcastSeats(); // falls UI sich darauf verlässt

    persistStats()
      .then(() => io.emit("statsUpdated", { reason: "resetGame" }))
      .catch((e) => console.error("persistStats error", e));
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
        roomEmit("trumpChosen", {
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
          roomEmit("trumpChosen", {
            trumpf,
            winner: players.find((p) => p.userId === winnerUserId),
          });
        }
        // Falls doch Joker + "NORMAL" geschickt wird -> kein auto-Trumpf
      }
    }

    roomEmit("variantChosen", { variant: roundVariant, trumpf: justSetTrump });

    // Falls genau 1 Karte liegt (wir hatten pausiert): jetzt weiterspielen lassen
   if (currentTrick.length === 1) {
  const leaderIdx = players.findIndex(p => p.userId === trickLeaderUserId);
  currentPlayerIndex = (leaderIdx + 1 + players.length) % players.length;
  const next = players[currentPlayerIndex];
  emitToUser(next.userId, "yourTurn", { currentBid, currentPlayer: next });
  roomEmit("turnUpdate", { currentPlayer: next, currentBid });
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
      roomEmit("turnUpdate", { currentPlayer: player, currentBid });
      return;
    }
  }

  if (forceBidUserId === userId && bid === 0) {
    emitToUser(userId, "yourTurn", {
      currentBid,
      currentPlayer: player,
      mustBid: true,
    });
    roomEmit("turnUpdate", { currentPlayer: player, currentBid });
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
      roomEmit("biddingResult", { winner: player, bid: currentBid });
      emitToUser(userId, "showBottomCards", { bottomCards });
      persistGameState();
      return;
    }
  }

  roomEmit("playersUpdate", players);

  if (maybeEndAuction()) return;

  do {
    currentPlayerIndex = (currentPlayerIndex + 1) % players.length;
  } while (players[currentPlayerIndex].passed);

  const next = players[currentPlayerIndex];
  emitToUser(next.userId, "yourTurn", { currentBid, currentPlayer: next, mustBid: false });
  roomEmit("turnUpdate", { currentPlayer: next, currentBid });

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

  // Kartenlage einfrieren: ab hier stehen alle vier Hände fest. Das ist die
  // Ausgangslage für die Gewinnwahrscheinlichkeit am Rundenende.
  roundStartSnapshot = {
    hands: Object.fromEntries(
      players.map((p) => [p.userId, [...(hands[p.userId] || [])]])
    ),
    order: players.map((p) => p.userId),
    teamOf: Object.fromEntries(players.map((p) => [p.userId, p.team])),
    bidderId: winnerUserId,
    bid: bids[winnerUserId] || 0,
    basePoints: { ...roundPoints },
    discarded: roundDiscarded.slice(),
    includeJokers,
  };

  trumpf = null;

  // Startspieler = winnerUserId
  currentPlayerIndex = players.findIndex((p) => p.userId === winnerUserId);
  const startPlayer = players[currentPlayerIndex];

  emitToUser(startPlayer.userId, "yourTurn", { currentBid, currentPlayer: startPlayer });
  roomEmit("turnUpdate", { currentPlayer: startPlayer, currentBid });

  persistGameState();
});


  // --- PlayCard Event erweitern ---
  socket.on("playCard", (card) => {
  const userId = uid(socket);
  const player = playerByUserId(userId);
  if (!player) return;

  if (!hands[userId]) return;
  if (!hands[userId].includes(card)) return;

  // WICHTIG: Es fehlte bisher jede Prüfung, ob dieser Spieler überhaupt am
  // Zug ist! Jeder Spieler konnte jederzeit eine Karte spielen (solange sie
  // in seiner Hand war und die Bedienpflicht erfüllte) - auch mehrfach
  // hintereinander. Ergebnis: zwei Karten desselben Sitzplatzes landeten im
  // selben Stich (sichtbar als zwei gestapelte Karten am Tisch). Auch
  // während variantPending (Richter entscheidet Normal/Flip/Trumpf nach der
  // ersten Karte) darf niemand spielen - der Index steht dann noch auf dem
  // gerade gezogenen Spieler.
  if (players[currentPlayerIndex]?.userId !== userId) {
    socket.emit("invalidAction", { msg: "Du bist gerade nicht am Zug." });
    return;
  }
  if (variantPending) return;

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
          roomEmit("trumpChosen", { trumpf, winner: player });
        }
      }
    }
  }

  // Für UI: sende beides (compat)
  roomEmit("cardPlayed", { userId, playerId: player.socketId, card });

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

    roomEmit("trickResult", {
      winner: winnerPlayer,
      cards: cardsForUi,
      points: trickPoints,
      roundPoints,
    });
    roomEmit("roundPointsUpdate", { roundPoints });

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
      roomEmit("turnUpdate", { currentPlayer: next, currentBid });
    }

    persistGameState();
    return;
  }

  // <4 Karten: nächste Person dran (außer Variant pending nach erster Karte)
  if (!(currentTrick.length === 1 && variantPending)) {
    currentPlayerIndex = (currentPlayerIndex + 1) % players.length;
    const next = players[currentPlayerIndex];

    emitToUser(next.userId, "yourTurn", { currentBid, currentPlayer: next });
    roomEmit("turnUpdate", { currentPlayer: next, currentBid });
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

    // Gebot erfüllt?
    const bidSuccess = shutout || bidderPts >= bid;

    // Sieger der Runde nach Stichpunkten
    const roundWinnerTeam =
      roundPoints.Fire === roundPoints.Storm
        ? null
        : roundPoints.Fire > roundPoints.Storm
        ? "Fire"
        : "Storm";

    // --- Gewinnwahrscheinlichkeit (Monte-Carlo) ---
    // Wichtig: VOR dem Zurücksetzen von trumpf/roundVariant auswerten.
    let winProb = null;
    try {
      if (roundStartSnapshot && roundStartSnapshot.bidderId === winnerUserId) {
        winProb = estimateRoundWinProbability({
          ...roundStartSnapshot,
          trumpSuit: trumpf,
          isFlip: roundVariant === VARIANTS.FLIP,
          doubleNegativeMin: DOUBLE_NEGATIVE_MIN,
          iterations: Number(process.env.WIN_PROB_ITERATIONS || 300),
          budgetMs: Number(process.env.WIN_PROB_BUDGET_MS || 400),
        });
      }
    } catch (e) {
      console.error("winProb error", e);
      winProb = null;
    }

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

      // Auswertung
      bidSuccess,
      roundWinnerTeam,
      winProb,
    };
    roundsHistory.push(roundEntry);

    persistRoundAndTricks(roundEntry);

    const finalTrumpf = roundEntry.trumpf; // Trumpf der beendeten Runde merken
    const finalVariant = roundVariant; // (falls du ihn später brauchst)

    // direkt nach Rundenschluss HUD-Status resetten
    trumpf = null;
    roundVariant = VARIANTS.UNDECIDED;
    winnerUserId = null; // Krone/„Richter“ im HUD auch weg

    // Events an Clients
    roomEmit("roundEnd", {
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
      bidSuccess,
      winProb,
    });
    roomEmit("roundsHistoryUpdate", { roundsHistory });

    biddingActive = true; // signalisiert „Runde aktiv/Übergang“
    roomEmit("stateSync", stateSnapshot());
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
        roomEmit("gameOver", { winner, teamScores, maxPoints });
        // Ergebnis festschreiben + lebenslange Statistik/Level neu berechnen
        finalizeGameAndStats(winner, maxPoints).catch((e) =>
          console.error("finalizeGameAndStats", e)
        );
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

        // WICHTIG: currentPlayerIndex ist ein roher Array-Index in players[].
        // Ohne diese Korrektur zeigt er nach dem splice() auf die FALSCHE
        // Person, weil alle nachfolgenden Spieler einen Index nach vorne
        // rücken (Bsp.: Saman ist an Index 2 dran, amir an Index 1 fällt
        // raus -> Index 2 zeigt danach auf shayan statt saman). Das führte
        // dazu, dass "wer ist dran" falsch erkannt wurde und der Gebot-
        // Dialog stattdessen bei einem neu eingeloggten Spieler auftauchte.
        if (players.length > 0) {
          if (idx < currentPlayerIndex) {
            currentPlayerIndex -= 1;
          } else if (idx === currentPlayerIndex) {
            // Genau der Spieler, der gerade dran war, ist rausgeflogen ->
            // Index bleibt (mit Wraparound) stehen und zeigt automatisch auf
            // den nächsten in der Reihenfolge. Den muss man dann aber auch
            // aktiv informieren, sonst wartet er nie auf sein "yourTurn".
            currentPlayerIndex = currentPlayerIndex % players.length;
            let next = players[currentPlayerIndex];
            // WICHTIG: "next" ist hier rein per Array-Index bestimmt und kann
            // bereits gepasst haben - z.B. wenn genau der Spieler gepurged
            // wird, der als letzter noch nicht gepasst hatte (Zwangsgebot-
            // Fall). Ohne diese Korrektur bekäme faelschlich ein bereits
            // gepasster Spieler "yourTurn", während der eigentlich aktive
            // Bieter (falls er zwischenzeitlich wieder verbindet) nie wieder
            // benachrichtigt wird - das Spiel blieb dann komplett hängen,
            // weil niemand mehr das Bieten-Popup bekam.
            if (next && biddingActive && next.passed) {
              const stillActive = players.find((p) => !p.passed);
              if (stillActive) {
                currentPlayerIndex = players.findIndex(
                  (p) => p.userId === stillActive.userId
                );
                next = stillActive;
                if (forceBidUserId && forceBidUserId === userId) {
                  forceBidUserId = stillActive.userId;
                }
              }
            }
            if (next && biddingActive) {
              emitToUser(next.userId, "yourTurn", {
                currentBid,
                currentPlayer: next,
                mustBid: forceBidUserId === next.userId,
              });
              roomEmit("turnUpdate", { currentPlayer: next, currentBid });
            } else if (next && winnerUserId) {
              emitToUser(next.userId, "yourTurn", { currentBid, currentPlayer: next });
              roomEmit("turnUpdate", { currentPlayer: next, currentBid });
            }
          }
        }
      }

      disconnectTimers.delete(userId);
      markGamePlayerLeft(userId);

      if (players.length < 4) {
        gamePaused = true;
        roomEmit("gamePaused", { reason: "player_left" });
      }

      broadcastSeats();
      roomEmit("playersUpdate", players);

      persistGameState();
    }, 15000)
  );

  roomEmit("playerMaybeBackSoon", { userId, timeoutSec: 15 });
});


  function maybeResumeGame() {
    if (players.length === 4 && gamePaused) {
      gamePaused = false;
      roomEmit("gameResumed");
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

  const isHisTurn =
    players[currentPlayerIndex]?.userId === userId ||
    (biddingActive && forceBidUserId === userId);
  if (biddingActive && isHisTurn) {
    io.to(socket.id).emit("yourTurn", {
      currentBid,
      currentPlayer: players[currentPlayerIndex]?.userId === userId
        ? players[currentPlayerIndex]
        : playerByUserId(userId),
      mustBid: forceBidUserId === userId,
    });
  }
});

  }

  // ===== Raum-/Zuschauer-/Verlassen-Logik =====
  const spectators = new Set();   // socketIds von Zuschauern
  let leaveVote = null;           // { initiator, initiatorTeam, agreed:Set, needed:[] }

  function inProgress() {
    return biddingActive || !!winnerUserId || tricksPlayed > 0 || (currentTrick && currentTrick.length > 0);
  }
  function seatedCount() {
    return [1, 2, 3, 4].filter((pos) => seats[pos]).length;
  }
  function isSeated(socket) {
    const u = uid(socket);
    return players.some((p) => p.userId === u && p.seatPosition);
  }
  function isEmpty() {
    return players.length === 0 && spectators.size === 0;
  }

  // Darf dieser Socket als aktiver SPIELER beitreten (statt nur zuschauen)?
  // - bereits bekannter Spieler dieses Spiels -> ja (Reconnect)
  // - hat einen gespeicherten Sitz in game_players -> ja (Wiedereinstieg)
  // - Spiel laeuft nicht und noch <4 Spieler -> ja (freier Platz)
  // sonst -> nein (Zuschauer)
  async function canJoinAsPlayer(socket) {
    const u = uid(socket);
    if (!u) return false;
    if (players.some((p) => p.userId === u)) return true;
    try {
      const saved = await dbGamePlayerSeat(gameId, u);
      if (saved && saved.seatPosition) return true;
    } catch {}
    if (!inProgress() && players.length < 4) return true;
    return false;
  }

  function attachSpectator(socket) {
    socket.join(roomId);
    socketRoom.set(socket.id, roomId);
    socket.data.roomId = roomId;
    socket.data.spectator = true;
    spectators.add(socket.id);
    // Zuschauer bekommt NUR den Tisch-Zustand - niemals ein "hand"-Event,
    // daher sieht er die Karten der Spieler grundsaetzlich nicht.
    socket.emit("spectatorMode", { roomId, roomName });
    socket.emit("stateSync", stateSnapshot());
    socket.emit("roundsHistoryUpdate", { roundsHistory });
    socket.emit("playersUpdate", players);
    broadcastSeats();
    socket.on("requestState", () => {
      socket.emit("stateSync", stateSnapshot());
      socket.emit("roundsHistoryUpdate", { roundsHistory });
    });
    socket.on("getRoundsHistory", () => {
      socket.emit("roundsHistoryUpdate", { roundsHistory });
    });
  }
  function detachSpectator(socket) {
    spectators.delete(socket.id);
    socket.leave(roomId);
    socketRoom.delete(socket.id);
  }

  // Spieler verlaesst den Raum sofort (nur wenn KEIN Spiel laeuft).
  function detachSocket(socket) {
    const u = uid(socket);
    if (disconnectTimers.has(u)) {
      clearTimeout(disconnectTimers.get(u));
      disconnectTimers.delete(u);
    }
    const idx = players.findIndex((p) => p.userId === u);
    if (idx !== -1) {
      const p = players[idx];
      if (p.seatPosition && seats[p.seatPosition]?.userId === u) {
        seats[p.seatPosition] = null;
      }
      players.splice(idx, 1);
      markGamePlayerLeft(u);
    }
    socket.leave(roomId);
    socketRoom.delete(socket.id);
    broadcastSeats();
    roomEmit("playersUpdate", players);
    persistGameState();
  }

  function meta() {
    return {
      id: roomId,
      name: roomName,
      players: players.map((p) => ({ name: p.name, seat: p.seatPosition || null, team: p.team || null, avatarUrl: p.avatarUrl || null })),
      playerCount: players.length,
      spectatorCount: spectators.size,
      inProgress: inProgress(),
      full: seatedCount() >= 4,
    };
  }

  // ---- Spiel mitten im Betrieb verlassen: alle muessen zustimmen ----
  function requestLeave(socket) {
    const u = uid(socket);
    const p = players.find((x) => x.userId === u);
    if (!p) return;
    if (leaveVote) {
      socket.emit("invalidAction", { msg: "Es laeuft bereits eine Abstimmung." });
      return;
    }
    const seated = players.filter((x) => x.seatPosition);
    leaveVote = {
      initiator: u,
      initiatorTeam: p.team || null,
      agreed: new Set([u]),
      needed: seated.map((x) => x.userId),
    };
    roomEmit("leaveVoteStarted", {
      initiator: { userId: u, name: p.name, team: p.team || null },
      agreed: leaveVote.agreed.size,
      needed: leaveVote.needed.length,
    });
    checkLeaveVote();
  }
  function respondLeave(socket, agree) {
    if (!leaveVote) return;
    const u = uid(socket);
    if (!leaveVote.needed.includes(u)) return;
    if (!agree) {
      roomEmit("leaveVoteCancelled", { by: u });
      leaveVote = null;
      return;
    }
    leaveVote.agreed.add(u);
    roomEmit("leaveVoteUpdate", {
      agreed: leaveVote.agreed.size,
      needed: leaveVote.needed.length,
    });
    checkLeaveVote();
  }
  function checkLeaveVote() {
    if (!leaveVote) return;
    const allAgreed = leaveVote.needed.every((id) => leaveVote.agreed.has(id));
    if (!allAgreed) return;
    // Spiel wird beendet: MINUSPUNKTE fuer das Team, das verlaesst.
    const leavingTeam = leaveVote.initiatorTeam || "Fire";
    const otherTeam = leavingTeam === "Fire" ? "Storm" : "Fire";
    const penalty = currentBid > 0 ? currentBid : getMaxBid();
    teamScores[leavingTeam] = (teamScores[leavingTeam] || 0) - penalty;
    const maxPoints = getMaxPoints();
    roomEmit("gameOver", {
      winner: otherTeam,
      teamScores,
      maxPoints,
      reason: "forfeit",
      leavingTeam,
      penalty,
    });
    finalizeGameAndStats(otherTeam, maxPoints).catch((e) =>
      console.error("forfeit finalize", e)
    );
    leaveVote = null;
    roomEmit("roomClosed", { reason: "forfeit", leavingTeam });
    destroyRoom(roomId);
  }

  async function initGame() {
    if (restoreRow) {
      gameId = restoreRow.id;
      applyLoadedState(restoreRow.current_state);
      if (restoreRow.current_state && restoreRow.current_state.roomName) {
        roomName = restoreRow.current_state.roomName;
      }
      console.log("Raum wiederhergestellt:", roomId, "game:", gameId);
      return;
    }
    gameId = randomUUID();
    await pool.query(
      `insert into games (id, status, first_user_id, include_jokers, show_round_points, current_bottom_size, current_state)
       values ($1,'active',null,$2,$3,$4,$5::jsonb)`,
      [gameId, includeJokers, showRoundPoints, currentBottomSize, dbSnapshot()]
    );
    console.log("Neuer Raum:", roomId, "game:", gameId);
  }

  return {
    id: roomId,
    get name() { return roomName; },
    attachPlayer,
    attachSpectator,
    detachSpectator,
    detachSocket,
    canJoinAsPlayer,
    initGame,
    meta,
    inProgress,
    seatedCount,
    isSeated,
    isEmpty,
    requestLeave,
    respondLeave,
  };
}

// ===== Lobby-Schicht (Raumverwaltung) =====
function roomListPayload() {
  return Array.from(rooms.values()).map((r) => r.meta());
}
function broadcastRoomList() {
  io.to("lobby").emit("roomList", roomListPayload());
}
function destroyRoom(rid) {
  rooms.delete(rid);
  broadcastRoomList();
}

// JWT im Handshake auswerten - EINMAL global (setzt socket.user vor allen Handlern)
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (token) {
      const p = jwt.verify(token, JWT_SECRET);
      socket.user = {
        id: p.sub,
        name: p.name,
        username: p.username,
        email: p.email,
        avatarUrl: null,
      };
      try {
        const u = await dbUserById(p.sub);
        if (u) {
          socket.user.avatarUrl = u.avatarUrl || null;
          socket.user.name = u.name || socket.user.name;
          socket.user.username = u.username || socket.user.username;
        }
      } catch (_) {
        /* DB kurz nicht erreichbar -> ohne Bild weiterspielen */
      }
    }
  } catch (e) {
    // ungültiges Token → ohne user; Frontend darf dann nicht ins Spiel
  }
  next();
});

io.on("connection", (socket) => {
  console.log("Socket verbunden:", socket.id);
  socket.join("lobby");
  socket.emit("roomList", roomListPayload());

  socket.on("listRooms", () => socket.emit("roomList", roomListPayload()));

  socket.on("createRoom", async (payload = {}) => {
    if (!socket.user?.id) {
      socket.emit("invalidAction", { msg: "Bitte zuerst anmelden." });
      return;
    }
    const rid = randomUUID();
    const rname = String((payload && payload.name) || "").trim() || `Raum ${rooms.size + 1}`;
    const room = createRoom(rid, rname, null);
    try { await room.initGame(); } catch (e) { console.error("initGame", e); }
    rooms.set(rid, room);
    socket.leave("lobby");
    room.attachPlayer(socket);
    socket.emit("roomJoined", { roomId: rid, roomName: rname, role: "player" });
    broadcastRoomList();
  });

  socket.on("joinRoom", async (payload = {}) => {
    if (!socket.user?.id) {
      socket.emit("invalidAction", { msg: "Bitte zuerst anmelden." });
      return;
    }
    const rid = payload && payload.roomId;
    const room = rooms.get(rid);
    if (!room) {
      socket.emit("invalidAction", { msg: "Raum existiert nicht mehr." });
      socket.emit("roomList", roomListPayload());
      return;
    }
    socket.leave("lobby");
    let asPlayer = false;
    try { asPlayer = await room.canJoinAsPlayer(socket); } catch {}
    if (asPlayer) {
      room.attachPlayer(socket);
      socket.emit("roomJoined", { roomId: rid, roomName: room.name, role: "player" });
    } else {
      room.attachSpectator(socket);
      socket.emit("roomJoined", { roomId: rid, roomName: room.name, role: "spectator" });
    }
    broadcastRoomList();
  });

  socket.on("exitRoom", () => {
    const rid = socketRoom.get(socket.id);
    const room = rooms.get(rid);
    if (!room) {
      socket.join("lobby");
      socket.emit("leftRoom");
      socket.emit("roomList", roomListPayload());
      return;
    }
    if (socket.data.spectator) {
      room.detachSpectator(socket);
      socket.join("lobby");
      socket.emit("leftRoom");
      broadcastRoomList();
      return;
    }
    // Aktiver Spieler + laufendes Spiel -> Abstimmung, sonst sofort raus.
    if (room.inProgress() && room.isSeated(socket)) {
      room.requestLeave(socket);
    } else {
      room.detachSocket(socket);
      socket.join("lobby");
      socket.emit("leftRoom");
      if (room.isEmpty()) destroyRoom(rid);
      broadcastRoomList();
    }
  });

  socket.on("leaveVoteResponse", (payload = {}) => {
    const room = rooms.get(socketRoom.get(socket.id));
    if (room) room.respondLeave(socket, !!(payload && payload.agree));
  });

  // Lobby-seitiges Aufraeumen bei echtem Verbindungsabbruch. Die Spiel-State-
  // Behandlung (15s-Timer, Pause) macht der raum-eigene disconnect-Handler,
  // der in attachPlayer registriert wurde.
  socket.on("disconnect", () => {
    const rid = socketRoom.get(socket.id);
    socketRoom.delete(socket.id);
    const room = rooms.get(rid);
    if (room && socket.data.spectator) room.detachSpectator(socket);
    broadcastRoomList();
  });
});

// === Server Start ===
const PORT = process.env.PORT || 3001;
await dbPing();

// Migrationen dürfen den Serverstart NICHT verhindern: schlägt hier etwas fehl,
// wäre sonst das ganze Spiel offline (Render würde in eine Crash-Schleife
// laufen). Lieber ohne Statistik-Schema starten und den Fehler laut loggen.
try {
  await runMigrations();
} catch (e) {
  console.error(
    "!!! Migrationen fehlgeschlagen – Server startet trotzdem. " +
      "Statistik-Endpunkte funktionieren erst nach einer erfolgreichen Migration:",
    e.message
  );
}

// Aktive Spiele beim Start als Raeume wiederherstellen
try {
  const active = await pool.query(
    `select id, current_state from games where status='active' order by updated_at desc`
  );
  for (const row of active.rows) {
    const st = row.current_state || {};
    const rid = st.roomId || row.id;
    const rname = st.roomName || "Raum";
    const room = createRoom(rid, rname, row);
    await room.initGame();
    rooms.set(rid, room);
  }
  console.log("Wiederhergestellte Raeume:", rooms.size);
} catch (e) {
  console.error("Raum-Restore fehlgeschlagen:", e.message);
}
server.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
});