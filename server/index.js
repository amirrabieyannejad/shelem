const { Server } = require("socket.io");
const http = require("http");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { randomUUID } = require("crypto");

// --- Express  HTTP  IO ---
const app = express();
app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
const upload = multer({ dest: path.join(__dirname, "uploads") });

const server = http.createServer(app);
const allowed = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim())
  : ["https://shelem-ruby.vercel.app", "https://shelem.onrender.com"];
app.use(cors({ origin: allowed, credentials: true }));
const io = new Server(server, { cors: { origin: allowed } });
// --- Simple user store (dev) ---
const USERS_FILE = path.join(__dirname, "users.json");
function loadUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
  } catch {
    return [];
  }
}
function saveUsers(list) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(list, null, 2));
}
let users = loadUsers();
const JWT_SECRET = process.env.JWT_SECRET || "dev_change_me";

// --- Helpers ---
const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  username: u.username,
  email: u.email,
  phone: u.phone || null,
  avatarUrl: u.avatarUrl || null,
  createdAt: u.createdAt,
});

// --- Auth API ---
app.post("/api/auth/register", async (req, res) => {
  const {
    name,
    username,
    email,
    password,
    phone = null,
    avatarUrl = null,
  } = req.body || {};
  if (!name || !username || !email || !password) {
    return res
      .status(400)
      .json({ error: "name, username, email, password sind erforderlich" });
  }
  const uname = String(username).trim().toLowerCase();
  const mail = String(email).trim().toLowerCase();
  if (users.find((u) => u.username === uname))
    return res.status(409).json({ error: "Benutzername belegt" });
  if (users.find((u) => u.email === mail))
    return res.status(409).json({ error: "E-Mail belegt" });
  if (String(password).length < 6)
    return res.status(400).json({ error: "Passwort min. 6 Zeichen" });

  const hash = await bcrypt.hash(String(password), 10);
  const user = {
    id: randomUUID(),
    name: String(name).trim(),
    username: uname,
    email: mail,
    passwordHash: hash,
    phone,
    avatarUrl,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    emailVerified: false, // später erweiterbar
    role: "player",
  };
  users.push(user);
  saveUsers(users);
  const token = jwt.sign(
    {
      sub: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
    },
    JWT_SECRET,
    { expiresIn: "30d" }
  );
  return res.json({ token, profile: publicUser(user) });
});

app.post("/api/auth/login", async (req, res) => {
  const { usernameOrEmail, password } = req.body || {};
  if (!usernameOrEmail || !password)
    return res
      .status(400)
      .json({ error: "usernameOrEmail & password erforderlich" });
  const key = String(usernameOrEmail).trim().toLowerCase();
  const user = users.find(
    (u) => u.username?.toLowerCase() === key || u.email?.toLowerCase() === key
  );
  if (!user) return res.status(401).json({ error: "Ungültige Zugangsdaten" });
  const ok = await bcrypt.compare(String(password), user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Ungültige Zugangsdaten" });
  const token = jwt.sign(
    {
      sub: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
    },
    JWT_SECRET,
    { expiresIn: "30d" }
  );
  return res.json({ token, profile: publicUser(user) });
});

// optional: Avatar-Upload (multipart/form-data, Feldname "avatar")
app.post("/api/upload-avatar", upload.single("avatar"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Keine Datei" });
  const url = `/uploads/${req.file.filename}`;
  return res.json({ url });
});

// Token prüfen / Profil holen
app.get("/api/me", (req, res) => {
  const hdr = req.headers.authorization || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
  try {
    const payload = token ? jwt.verify(token, JWT_SECRET) : null;
    if (!payload) return res.status(401).json({ error: "Unauthorized" });
    const user = users.find((u) => u.id === payload.sub);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    return res.json({ profile: publicUser(user) });
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
});

// --- Globale Variablen ---
let players = []; // [{id, name, team, passed, seatPosition}]
let hands = {}; // id -> Karten
let bottomCards = [];
let bids = {}; // id -> bid
let currentBid = 0;
let currentPlayerIndex = 0;
let biddingActive = false;
let trumpf = null;
let winnerPlayerId = null;
let randomTeams = false;
let consecutivePasses = 0;
let includeJokers = false; // Spiel mit/ohne Joker
let currentBottomSize = 4; // 4 ohne Joker, 6 mit Joker
// --- Neue globale Variablen für Stiche ---
let currentTrick = []; // [{playerId, card}]
let trickLeader = null; // Spieler, der die Farbe vorgibt
let tricksPlayed = 0;
let teamScores = { Fire: 0, Storm: 0 };
let roundPoints = { Fire: 0, Storm: 0 };
let roundBottomCards = [];
let roundDiscarded = [];
// Basis-Werte (ohne/mit Joker)
const MAX_BID_NORMAL = 165;
const MAX_BID_JOKERS = 200;

const MAX_POINTS_NORMAL = 1165;
const MAX_POINTS_JOKERS = 1600;

// Dynamische Helfer basierend auf includeJokers
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

let gamePaused = false;
// --- Sitzplätze (1..4) mit fixen Teams ---
const SEAT_TEAMS = { 1: "Fire", 2: "Storm", 3: "Fire", 4: "Storm" };
// null = frei, sonst direkt Player-Objekt (Referenz)
let seats = { 1: null, 2: null, 3: null, 4: null };
const disconnectTimers = new Map(); // clientId -> Timeout
function seatsEmpty() {
  return !seats[1] && !seats[2] && !seats[3] && !seats[4];
}
function seatsFull() {
  return !!seats[1] && !!seats[2] && !!seats[3] && !!seats[4];
}
// Hilfsfunktion: Reihenfolge aus Sitzen übernehmen (seatPosition NICHT überschreiben)
function orderPlayersBySeats() {
  players = [seats[1], seats[2], seats[3], seats[4]].filter(Boolean);
}
function broadcastSeats() {
  io.emit("seatsUpdate", {
    seats: {
      1: seats[1]?.name || null,
      2: seats[2]?.name || null,
      3: seats[3]?.name || null,
      4: seats[4]?.name || null,
    },
  });
}

function stateSnapshot() {
  return {
    players,
    teamScores,
    roundPoints,
    currentBid,
    biddingActive,
    currentPlayer: players[currentPlayerIndex] || null,
    randomTeams,
    trumpf,
    winnerPlayerId,
    roundVariant,
    tricksPlayed,
    includeJokers,
    currentBottomSize,
    maxBid: getMaxBid(),
    maxPoints: getMaxPoints(),
  };
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
  winnerPlayerId = null;
  forceBidPlayerId = null;
  consecutivePasses = 0;

  // Stich-Status
  currentTrick = [];
  trickLeader = null;
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

let trickHistory = []; // Stiche der aktuellen Runde (Array mit 12 Einträgen)
let roundsHistory = []; // Chronik aller Runden
let roundCounter = 0; // Rundenzähler

// Varianten-Flags
const VARIANTS = { UNDECIDED: "UNDECIDED", NORMAL: "NORMAL", FLIP: "FLIP" };
let roundVariant = VARIANTS.UNDECIDED;
let variantPending = false;

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
    hands[p.id] = sortCards(deck.slice(start, end));
    io.to(p.id).emit("hand", hands[p.id]);
  });

  io.emit("roundPointsUpdate", { roundPoints });
}

// === Check ob Bietrunde vorbei ===
// === Auktion beenden? (teamunabhängig) ===
function maybeEndAuction() {
  const active = players.filter((p) => !p.passed);
  const haveAnyBid = Object.keys(bids).length > 0;

  // b) Nur noch 1 aktiver Bieter übrig -> er gewinnt mit seinem höchsten Gebot
  if (haveAnyBid && active.length === 1) {
    biddingActive = false;
    const [winnerId, highestBid] = Object.entries(bids).reduce((a, b) =>
      a[1] > b[1] ? a : b
    );
    const winnerPlayer = players.find((p) => p.id === winnerId);
    winnerPlayerId = winnerId;
    io.emit("biddingResult", { winner: winnerPlayer, bid: highestBid });
    io.to(winnerId).emit("showBottomCards", { bottomCards });
    return true;
  }

  // a) Nach einem (positiven) Gebot kommen 3 Pässe in Folge
  if (consecutivePasses >= 3 && haveAnyBid) {
    biddingActive = false;
    const [winnerId, highestBid] = Object.entries(bids).reduce((a, b) =>
      a[1] > b[1] ? a : b
    );
    const winnerPlayer = players.find((p) => p.id === winnerId);
    winnerPlayerId = winnerId;
    io.emit("biddingResult", { winner: winnerPlayer, bid: highestBid });
    io.to(winnerId).emit("showBottomCards", { bottomCards });
    return true;
  }

  // Sonderfall: 3 Pässe und noch KEIN Gebot -> jemanden zwingen (wie gehabt)
  if (consecutivePasses >= 3 && !haveAnyBid) {
    const notPassed = players.find((p) => !p.passed);
    if (notPassed) {
      forceBidPlayerId = notPassed.id;
      io.to(notPassed.id).emit("yourTurn", {
        currentBid,
        currentPlayer: notPassed,
        mustBid: true,
      });
      io.emit("turnUpdate", { currentPlayer: notPassed });
      return true; // wir haben die Runde „angehalten“, next turn gesetzt
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
    // Im Flip gehört er zu ♠, sonst eigenes „R“
    return roundVariant === VARIANTS.FLIP ? "♠" : "R";
  }
  if (card === "JOKER") {
    // Im Flip gehört er zu ♥, sonst eigenes „R“
    return roundVariant === VARIANTS.FLIP ? "♥" : "R";
  }
  return card.slice(-1);
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
  forceBidPlayerId = null;
  bids = {};
  currentBid = 0;
  winnerPlayerId = null;
  trumpf = null;

  // <-- wichtig: Reset sofort an alle Clients pushen
  io.emit("playersUpdate", players);

  // Startspieler rotiert gegen Uhrzeigersinn
  currentPlayerIndex = (currentPlayerIndex + 1) % players.length;
  biddingActive = true;

  deal(); // schickt auch roundPoints=0

  // ersten Bieter informieren
  const next = players[currentPlayerIndex];
  io.to(next.id).emit("yourTurn", { currentBid, currentPlayer: next });
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
    const { name, clientId } =
      typeof payload === "string"
        ? { name: payload, clientId: null }
        : payload || {};
    // Bevorzugt die geprüften Werte aus JWT
    const authName = socket.user?.name || null;
    const authId = socket.user?.id || null;
    const finalName = (authName || name || "").trim();
    const finalClientId = authId || clientId || null;
    console.log("DEBUG register payload:", payload, socket.user);
    if (!finalName || !finalClientId) {
      socket.emit("invalidAction", { msg: "Bitte zuerst anmelden." });
      return;
    }
    console.log("Register:", finalName, "clientId:", finalClientId);

    // 1) Rebind: existiert schon ein Spieler mit gleicher clientId (bevorzugt) oder gleichem Namen?
    let existing =
      (finalClientId && players.find((p) => p.clientId === finalClientId)) ||
      (finalName && players.find((p) => p.name === finalName));

    if (existing) {
      const oldId = existing.id; // ★ bisherige Socket-ID merken
      // falls Grace-Timer aktiv: abbrechen
      if (existing.clientId && disconnectTimers.has(existing.clientId)) {
        clearTimeout(disconnectTimers.get(existing.clientId));
        disconnectTimers.delete(existing.clientId);
      }
      // socket.id aktualisieren, evtl. Namen updaten
      existing.id = socket.id;
      if (finalName) existing.name = finalName;
      if (socket.user?.username) existing.username = socket.user.username;
      if (finalClientId) existing.clientId = finalClientId;
      // Seats-Referenz sicherstellen
      if (existing.seatPosition) seats[existing.seatPosition] = existing;
      // ★ Hand auf neue Socket-ID migrieren
      if (hands[oldId]) {
        hands[socket.id] = hands[oldId];
        delete hands[oldId];
        // Hand sofort an den Spieler schicken, damit seatSelect NICHT erscheint
        io.to(socket.id).emit("hand", hands[socket.id]);
      }

      // ★ Gebotseinträge umziehen (falls in Auktion)
      if (bids[oldId] != null) {
        bids[socket.id] = bids[oldId];
        delete bids[oldId];
      }

      // ★ Falls er der Biet-Gewinner war: Status aktualisieren
      if (winnerPlayerId === oldId) {
        winnerPlayerId = socket.id;
        // falls Bottom-Cards noch beim Richter liegen, erneut schicken
        if (bottomCards && bottomCards.length) {
          io.to(socket.id).emit("showBottomCards", { bottomCards });
        }
      }

      // ★ Wenn er gerade am Zug ist, „yourTurn“ erneut senden
      if (biddingActive && players[currentPlayerIndex]?.id === socket.id) {
        io.to(socket.id).emit("yourTurn", {
          currentBid,
          currentPlayer: players[currentPlayerIndex],
          mustBid: forceBidPlayerId === socket.id,
        });
      }
      socket.emit("stateSync", stateSnapshot());
      socket.emit("roundsHistoryUpdate", { roundsHistory });
      io.emit("playersUpdate", players);
      maybeResumeGame();
      return;
    }

    // 2) Neuer Spieler (nur wenn Platz ist)
    if (players.length >= 4) {
      socket.emit("lobbyFull", { msg: "Lobby voll (max. 4 Spieler)" });
      return;
    }

    const player = {
      id: socket.id,
      clientId: finalClientId,
      name: finalName,
      username: socket.user?.username || null,
      team: null,
      passed: false,
      lastBid: null,
      seatPosition: null,
    };
    players.push(player);

    socket.emit("stateSync", stateSnapshot());
    socket.emit("roundsHistoryUpdate", { roundsHistory });
    io.emit("playersUpdate", players);
    maybeResumeGame();
  });
  socket.on("chooseSeat", ({ seat }) => {
    const player = players.find((p) => p.id === socket.id);
    if (!player) return;

    // während einer laufenden/ausgeteilten Runde blocken
    if (Object.keys(hands).length || biddingActive) {
      socket.emit("invalidAction", {
        msg: "Sitzwechsel ist nur vor Rundenstart möglich.",
      });
      return;
    }

    if (![1, 2, 3, 4].includes(seat)) return;
    if (seats[seat] && seats[seat].id !== socket.id) {
      socket.emit("invalidAction", { msg: "Dieser Platz ist bereits belegt." });
      return;
    }

    // alten Platz freigeben
    if (player.seatPosition && seats[player.seatPosition]?.id === player.id) {
      seats[player.seatPosition] = null;
    }

    // neuen Platz belegen
    seats[seat] = player;
    player.seatPosition = seat;
    player.team = SEAT_TEAMS[seat];

    if (seatsFull()) orderPlayersBySeats(); // nur wenn 4/4
    broadcastSeats();
    io.emit("playersUpdate", players);
  });

  socket.on("leaveSeat", () => {
    const player = players.find((p) => p.id === socket.id);
    if (!player) return;

    // nur vor Rundenstart erlaubt
    if (Object.keys(hands).length || biddingActive) {
      socket.emit("invalidAction", {
        msg: "Sitz verlassen ist nur vor Rundenstart möglich.",
      });
      return;
    }

    if (player.seatPosition && seats[player.seatPosition]?.id === player.id) {
      seats[player.seatPosition] = null;
    }
    player.seatPosition = null;
    player.team = null;

    broadcastSeats();
    io.emit("playersUpdate", players);
  });

  socket.on("chooseTeam", (team) => {
    const player = players.find((p) => p.id === socket.id);
    if (!player) return;

    // Wir unterstützen hier NUR noch Random, die manuelle Wahl passiert über chooseSeat
    if (team !== "Random") {
      socket.emit("invalidAction", {
        msg: "Teams werden über Sitzplätze gewählt. Bitte einen Platz (1..4) anklicken.",
      });
      return;
    }

    // Random nur, solange ALLE Plätze frei sind …
    if (!seatsEmpty()) {
      socket.emit("invalidAction", {
        msg: "Random ist nur möglich, solange alle Plätze frei sind.",
      });
      return;
    }

    // … und nur vom ersten beigetretenen Spieler
    const isFirst = players[0] && players[0].id === socket.id;
    if (!isFirst) {
      socket.emit("invalidAction", {
        msg: "Nur der erste Spieler darf Random Teams starten.",
      });
      return;
    }

    // → die gesamte Platz-/Teamverteilung + Autostart übernimmt diese Funktion
    fillRandomTeamsNow();
  });
  socket.on("startGame", () => {
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
    forceBidPlayerId = null;
    bids = {};
    currentBid = 0;
    currentPlayerIndex = 0; // Sitz 1 beginnt
    biddingActive = true;

    deal(); // teilt aus & sendet Hands/RoundPoints

    const next = players[currentPlayerIndex];
    io.to(next.id).emit("yourTurn", { currentBid, currentPlayer: next });
    io.emit("turnUpdate", { currentPlayer: next });
    io.emit("playersUpdate", players);
  });

  socket.on("setIncludeJokers", ({ value }) => {
    const isFirst = players[0] && players[0].id === socket.id;
    if (!isFirst) {
      socket.emit("invalidAction", {
        msg: "Nur der erste Spieler kann Joker an/aus schalten.",
      });
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

  // Spiel hart zurücksetzen (Spieler/Seats bleiben)
  socket.on("resetGame", () => {
    // Optional: nur der erste Spieler darf resetten
    // const isFirst = players[0] && players[0].id === socket.id;
    // if (!isFirst) {
    //   socket.emit("invalidAction", { msg: "Nur der erste Spieler darf Reset ausführen." });
    //   return;
    // }

    resetGameState();
    // allen sofort den neuen Grundzustand schicken
    io.emit("gameReset", stateSnapshot());
    io.emit("roundsHistoryUpdate", { roundsHistory });
    broadcastSeats(); // falls UI sich darauf verlässt
  });

   socket.on("setVariant", ({ variant }) => {
    // Nur der Startspieler (Richter) darf wählen
    if (socket.id !== winnerPlayerId) return;
    if (!variant) return;

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
          winner: players.find((p) => p.id === winnerPlayerId),
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
            winner: players.find((p) => p.id === winnerPlayerId),
          });
        }
        // Falls doch Joker + "NORMAL" geschickt wird -> kein auto-Trumpf
      }
    }

    io.emit("variantChosen", { variant: roundVariant, trumpf: justSetTrump });

    // Falls genau 1 Karte liegt (wir hatten pausiert): jetzt weiterspielen lassen
    if (currentTrick.length === 1) {
      currentPlayerIndex = (currentPlayerIndex + 1) % players.length;
      const next = players[currentPlayerIndex];
      io.to(next.id).emit("yourTurn", { currentBid, currentPlayer: next });
      io.emit("turnUpdate", { currentPlayer: next });
    }
  });


  socket.on("makeBid", (bid) => {
    if (!biddingActive) return;
    const player = players.find((p) => p.id === socket.id);
    if (!player) return;

    const maxBid = getMaxBid(); // <- NEU

    if (bid !== 0) {
      // Validierung gegen Manipulation
      const minAllowed = Math.max(100, currentBid + 5);
      const isStepOk = bid % 5 === 0;
      if (!isStepOk || bid < minAllowed || bid > maxBid) {
        socket.emit("invalidAction", {
          msg: `Ungültiges Gebot. Erlaubt: mindestens ${minAllowed}, höchstens ${maxBid}, in 5er-Schritten.`,
        });

        // Spieler bleibt am Zug:
        io.to(player.id).emit("yourTurn", {
          currentBid,
          currentPlayer: player,
          mustBid: forceBidPlayerId === player.id,
        });
        io.emit("turnUpdate", { currentPlayer: player });
        return;
      }
    }

    // Falls gezwungener Spieler Pass machen will → blocken
    if (forceBidPlayerId === player.id && bid === 0) {
      socket.emit("invalidAction", {
        msg: "Pass ist hier nicht erlaubt. Du musst bieten.",
      });
      io.to(player.id).emit("yourTurn", {
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
      bids[player.id] = bid;
      player.lastBid = bid;
      consecutivePasses = 0;
      forceBidPlayerId = null;
      // ✅ Sofortiger Zuschlag bei Maximalgebot
      if (currentBid >= maxBid) {
        biddingActive = false;
        winnerPlayerId = player.id;
        io.emit("biddingResult", { winner: player, bid: currentBid });
        io.to(player.id).emit("showBottomCards", { bottomCards });
        return; // keine weiteren Bieter fragen
      }
    }

    io.emit("playersUpdate", players);

    // Prüfen, ob die Auktion hier enden soll
    if (maybeEndAuction()) return;

    // Nächsten Spieler (gegen Uhrzeigersinn) suchen, der noch nicht gepasst hat
    do {
      currentPlayerIndex = (currentPlayerIndex + 1) % players.length;
    } while (players[currentPlayerIndex].passed);

    // Falls wir gerade jemanden zum Bieten zwingen müssen, wurde das in maybeEndAuction()
    // bereits behandelt (return). Ansonsten normal weitermachen:
    const next = players[currentPlayerIndex];
    io.to(next.id).emit("yourTurn", {
      currentBid,
      currentPlayer: next,
      mustBid: false,
    });
    io.emit("turnUpdate", { currentPlayer: next });
  });

  socket.on("takeBottomCards", () => {
    if (socket.id !== winnerPlayerId) return;
    if (!hands[socket.id]) return;

    hands[socket.id] = sortCards([...hands[socket.id], ...bottomCards]);
    bottomCards = [];

    io.to(socket.id).emit("hand", hands[socket.id]);
    io.to(socket.id).emit("discardPhase", {
      hand: hands[socket.id],
      bottomSize: currentBottomSize, // 4 oder 6
    });
  });

  socket.on("discardCards", (selected) => {
    if (socket.id !== winnerPlayerId) return;
    if (!hands[socket.id]) return;
    if (selected.length !== currentBottomSize) return; // 4 oder 6

    hands[socket.id] = sortCards(
      hands[socket.id].filter((c) => !selected.includes(c))
    );
    roundDiscarded = selected.slice();
    io.to(socket.id).emit("hand", hands[socket.id]);

    // NEU: Discard beendet
    io.to(socket.id).emit("discardDone");

    const player = players.find((p) => p.id === socket.id);
    trumpf = null;

    // jetzt wie bisher Startspieler setzen ...
    currentPlayerIndex = players.findIndex((p) => p.id === winnerPlayerId);
    const startPlayer = players[currentPlayerIndex];
    io.to(startPlayer.id).emit("yourTurn", {
      currentBid,
      currentPlayer: startPlayer,
    });
    io.emit("turnUpdate", { currentPlayer: startPlayer });
  });

  // --- PlayCard Event erweitern ---
  socket.on("playCard", (card) => {
    const player = players.find((p) => p.id === socket.id);
    if (!player || !hands[socket.id]) return;

    // Prüfen: Karte in Hand?
    if (!hands[socket.id].includes(card)) return;

    // Bedienpflicht prüfen (Joker + Flip berücksichtigen)
    if (currentTrick.length > 0) {
      const leadSuit = cardSuitForPlay(currentTrick[0].card);
      const hasLead = hands[socket.id].some(
        (c) => cardSuitForPlay(c) === leadSuit
      );
      if (cardSuitForPlay(card) !== leadSuit && hasLead) {
        return;
      }
    }

    // Karte entfernen
    hands[socket.id] = hands[socket.id].filter((c) => c !== card);
    io.to(socket.id).emit("hand", hands[socket.id]);

    // In Stich legen
    currentTrick.push({ playerId: socket.id, card });
    const isFirstInTrick = currentTrick.length === 1;
    if (isFirstInTrick) {
      trickLeader = socket.id;
      // Startspieler (Richter) entscheidet nach der ersten Karte die Variante
      if (player.id === winnerPlayerId) {
        if (roundVariant === VARIANTS.UNDECIDED) {
          variantPending = true;

          const isJokerStart = card === "JOKER" || card === "JOKER_BW";

          if (isJokerStart) {
            // Joker als erste Karte: direkt Trumpf-Farbe ODER Flip wählen
            io.to(player.id).emit("askVariant", {
              options: ["♠", "♥", "♣", "♦", "FLIP"],
            });
          } else {
            // normale Karte: Nur Normal/Flip entscheiden
            io.to(player.id).emit("askVariant", {
              options: ["NORMAL", "FLIP"],
            });
          }
        } else if (roundVariant === VARIANTS.NORMAL && !trumpf) {
          // Runde ist bereits NORMAL (z.B. vorkonfiguriert):
          // Trumpf = Farbe der ersten Karte – aber NICHT bei Joker
          if (card !== "JOKER" && card !== "JOKER_BW") {
            trumpf = card.slice(-1);
            io.emit("trumpChosen", { trumpf, winner: player });
          }
        }
      }
    }

    if (currentTrick.length === 1) {
      trickLeader = socket.id;
    }
    io.emit("cardPlayed", { playerId: socket.id, card });

    // Wenn 4 Karten → Stich auswerten
    if (currentTrick.length === 4) {
      const leadSuit = cardSuitForPlay(currentTrick[0].card);

      let winner = currentTrick[0];
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

      // Punkte berechnen
      let trickPoints = 5; // Grundpunkte für Stich
      currentTrick.forEach((c) => (trickPoints += cardPoints(c.card)));
      const winnerPlayer = players.find((p) => p.id === winner.playerId);
      roundPoints[winnerPlayer.team] += trickPoints;

      io.emit("trickResult", {
        winner: winnerPlayer,
        cards: currentTrick,
        points: trickPoints,
        roundPoints,
      });

      io.emit("roundPointsUpdate", { roundPoints });

      tricksPlayed++;

      // ... Winner/points bereits berechnet ...

      // Reihenfolge des Ausspielens für die History
      const plays = currentTrick.map(({ playerId, card }) => {
        const pl = players.find((p) => p.id === playerId);
        return { playerId, name: pl?.name || "", team: pl?.team || "", card };
      });

      trickHistory.push({
        no: tricksPlayed, // 1..12 korrekt
        plays,
        leadSuit, // angespielte Farbe
        trumpf, // aktueller Trumpf
        winnerId: winner.playerId,
        winnerName: winnerPlayer.name,
        winnerTeam: winnerPlayer.team,
        points: trickPoints,
      });
      currentTrick = [];
      currentPlayerIndex = players.findIndex((p) => p.id === winner.playerId);

      // Alle Stiche gespielt?
      if (tricksPlayed === 12) {
        endRound();
      } else {
        const next = players[currentPlayerIndex];
        io.to(next.id).emit("yourTurn", { currentBid, currentPlayer: next });
        io.emit("turnUpdate", { currentPlayer: next });
      }
    } else {
      if (currentTrick.length === 1 && variantPending) {
        // Solange die Wahl "Normal/Flip" offen ist, NICHT weitergeben
      } else {
        // Nächster Spieler gegen Uhrzeigersinn
        currentPlayerIndex = (currentPlayerIndex + 1) % players.length;
        const next = players[currentPlayerIndex];
        io.to(next.id).emit("yourTurn", { currentBid, currentPlayer: next });
        io.emit("turnUpdate", { currentPlayer: next });
      }
    }
  });

  // --- Rundenauswertung ---
  function endRound() {
    const bidder = players.find((p) => p.id === winnerPlayerId) || {};
    const DOUBLE_NEGATIVE_MIN = getDoubleNegativeMin();
    const bidderTeam = bidder.team;
    const otherTeam = bidderTeam === "Fire" ? "Storm" : "Fire";
    const bid = bids[winnerPlayerId] || 0;

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
      bidderId: winnerPlayerId || null,
      bidderName: bidder.name || null,
      bidderTeam: bidderTeam || null,
      bid, // kommt von: const bid = bids[winnerPlayerId] || 0;
      trumpf: trumpf || null,

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

    // Sieger nach Stichpunkten
    const roundWinnerTeam =
      roundPoints.Fire === roundPoints.Storm
        ? null
        : roundPoints.Fire > roundPoints.Storm
        ? "Fire"
        : "Storm";

    // Events an Clients
    io.emit("roundEnd", {
      roundPoints,
      teamScores,
      roundWinnerTeam,
      bidderName: roundEntry.bidderName,
      bidderTeam: roundEntry.bidderTeam,
      bid: roundEntry.bid,
      trumpf: roundEntry.trumpf,
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
      winnerPlayerId = null;
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
    console.log("Player disconnected:", socket.id);

    const leaving = players.find((p) => p.id === socket.id);
    if (!leaving) return;
    // Sitz NICHT sofort freigeben – Chance für Reconnect!
    const cid = leaving.clientId || leaving.name; // Fallback
    if (!cid) return;
    // Falls schon ein Timer läuft, nicht doppeln
    if (disconnectTimers.has(cid)) return;

    disconnectTimers.set(
      cid,
      setTimeout(() => {
        // nach 15s wirklich entfernen
        const idx = players.findIndex(
          (p) => p.clientId === cid || p.name === cid
        );
        if (idx !== -1) {
          const p = players[idx];
          if (p.seatPosition && seats[p.seatPosition]?.id === p.id) {
            seats[p.seatPosition] = null; // jetzt Platz freigeben
          }
          players.splice(idx, 1);
        }
        disconnectTimers.delete(cid);
        if (players.length < 4) {
          gamePaused = true;
          io.emit("gamePaused", { reason: "player_left" });
        }
        broadcastSeats();
        io.emit("playersUpdate", players);
      }, 15000)
    ); // 15 Sekunden

    // optional: Clients informieren, dass Reconnect-Fenster läuft
    io.emit("playerMaybeBackSoon", { clientId: cid, timeoutSec: 15 });
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
    socket.emit("stateSync", stateSnapshot());
    socket.emit("roundsHistoryUpdate", { roundsHistory });
    // ► Falls der Client das 'hand'-Event verpasst hatte:
    if (hands[socket.id]) {
      io.to(socket.id).emit("hand", hands[socket.id]);
    }
    // ► Safety: wenn er (wieder) am Zug ist, Turn erneut schicken
    const isHisTurn = players[currentPlayerIndex]?.id === socket.id;
    if (biddingActive && isHisTurn) {
      io.to(socket.id).emit("yourTurn", {
        currentBid,
        currentPlayer: players[currentPlayerIndex],
        mustBid: forceBidPlayerId === socket.id,
      });
    }
  });
});

// === Server Start ===
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
});
