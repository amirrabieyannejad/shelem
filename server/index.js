// backend/server.js

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
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
const upload = multer({ dest: path.join(__dirname, "uploads") });

const server = http.createServer(app);
const allowed = process.env.CORS_ORIGIN?.split(",") ?? ["*"];
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
  const user = users.find((u) => u.username === key || u.email === key);
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
let forceBidPlayerId = null;
// --- Neue globale Variablen für Stiche ---
let currentTrick = []; // [{playerId, card}]
let trickLeader = null; // Spieler, der die Farbe vorgibt
let tricksPlayed = 0;
let teamScores = { Fire: 0, Storm: 0 };
let roundPoints = { Fire: 0, Storm: 0 };
let MAX_BID = 165;
//let MAX_POINTS = 1165;
let MAX_POINTS = 300;

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

  // Seats/Players bleiben bewusst erhalten
}

// Mindestens 80, oder die (aufgerundete) Hälfte des Maximalgebots
const DOUBLE_NEGATIVE_MIN = Math.max(80, Math.ceil(MAX_BID / 2));

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
];

function sortCards(cards) {
  return [...cards].sort((a, b) => {
    const [ra, sa] = [a.slice(0, -1), a.slice(-1)];
    const [rb, sb] = [b.slice(0, -1), b.slice(-1)];
    const sDiff = SUIT_ORDER.indexOf(sa) - SUIT_ORDER.indexOf(sb);
    return sDiff !== 0
      ? sDiff
      : RANK_ORDER.indexOf(ra) - RANK_ORDER.indexOf(rb);
  });
}

function createDeck() {
  const deck = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push(`${rank}${suit}`);
    }
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

  bottomCards = deck.slice(48); // letzte 4 Karten als "Bottom Cards"

  players.forEach((p, idx) => {
    hands[p.id] = sortCards(deck.slice(idx * 12, idx * 12 + 12));
    io.to(p.id).emit("hand", hands[p.id]);
  });

  // einmalig 0:0 an alle schicken (für live-Anzeige)
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

// Hilfsfunktionen: Kartenwerte für Punkte
function cardPoints(card) {
  const rank = card.slice(0, -1);
  if (rank === "A") return 10;
  if (rank === "10") return 10;
  if (rank === "5") return 5;
  return 0;
}

// Kartenrang zum Vergleichen im Stich
const rankOrder = [
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
function compareCards(cardA, cardB, leadSuit, trumpSuit, isFlip = false) {
  const [rankA, suitA] = [cardA.slice(0, -1), cardA.slice(-1)];
  const [rankB, suitB] = [cardB.slice(0, -1), cardB.slice(-1)];

  if (isFlip) {
    // Kein Trumpf. Nur Karten der angespielten Farbe können gewinnen.
    const aLed = suitA === leadSuit;
    const bLed = suitB === leadSuit;
    if (aLed && !bLed) return 1;
    if (!aLed && bLed) return -1;
    if (aLed && bLed) {
      // 2 ist höchste, A niedrigste → kleinerer Index ist stärker
      const ia = rankOrder.indexOf(rankA);
      const ib = rankOrder.indexOf(rankB);
      return ib - ia; // positiv, wenn A stärker (ia < ib)
    }
    return 0;
  }

  // Normal (mit Trumpf)
  if (suitA === trumpSuit && suitB !== trumpSuit) return 1;
  if (suitB === trumpSuit && suitA !== trumpSuit) return -1;

  if (suitA === trumpSuit && suitB === trumpSuit) {
    return rankOrder.indexOf(rankA) - rankOrder.indexOf(rankB);
  }

  if (suitA === leadSuit && suitB !== leadSuit) return 1;
  if (suitB === leadSuit && suitA !== leadSuit) return -1;

  if (suitA === leadSuit && suitB === leadSuit) {
    return rankOrder.indexOf(rankA) - rankOrder.indexOf(rankB);
  }
  return 0;
}

function startNewRound() {
  // Reset
  players.forEach((p) => (p.passed = false));
  consecutivePasses = 0;
  forceBidPlayerId = null;
  bids = {};
  currentBid = 0;
  winnerPlayerId = null;
  trumpf = null;

  // <-- wichtig: Reset sofort an alle Clients pushen
  io.emit("playersUpdate", players);

  // Startspieler rotiert gegen Uhrzeigersinn
  currentPlayerIndex = (currentPlayerIndex + 3) % players.length;
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
      team: null,
      passed: false,
      seatPosition: null,
    };
    players.push(player);

    socket.emit("stateSync", stateSnapshot());
    socket.emit("roundsHistoryUpdate", { roundsHistory });
    io.emit("playersUpdate", players);
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
    players.forEach((p) => (p.passed = false));
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
    if (variant !== "NORMAL" && variant !== "FLIP") return;

    roundVariant = variant === "NORMAL" ? VARIANTS.NORMAL : VARIANTS.FLIP;
    variantPending = false;

    // Bei NORMAL: Trumpf = Farbe der ERSTEN Karte im aktuellen Stich
    let justSetTrump = null;
    if (roundVariant === VARIANTS.NORMAL && !trumpf && currentTrick[0]) {
      justSetTrump = currentTrick[0].card.slice(-1);
      trumpf = justSetTrump;
      io.emit("trumpChosen", {
        trumpf,
        winner: players.find((p) => p.id === winnerPlayerId),
      });
    }

    io.emit("variantChosen", { variant: roundVariant, trumpf: justSetTrump });

    // Falls genau 1 Karte liegt (wir hatten pausiert): jetzt weiterspielen lassen
    if (currentTrick.length === 1) {
      currentPlayerIndex = (currentPlayerIndex + 3) % players.length;
      const next = players[currentPlayerIndex];
      io.to(next.id).emit("yourTurn", { currentBid, currentPlayer: next });
      io.emit("turnUpdate", { currentPlayer: next });
    }
  });

  socket.on("makeBid", (bid) => {
    if (!biddingActive) return;
    const player = players.find((p) => p.id === socket.id);
    if (!player) return;
    if (bid !== 0) {
      // Validierung gegen Manipulation
      const minAllowed = Math.max(100, currentBid + 5);
      const isStepOk = bid % 5 === 0;
      if (!isStepOk || bid < minAllowed || bid > MAX_BID) {
        socket.emit("invalidAction", {
          msg: `Ungültiges Gebot. Erlaubt: mindestens ${minAllowed}, höchstens ${MAX_BID}, in 5er-Schritten.`,
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
      consecutivePasses++;
    } else {
      currentBid = bid;
      bids[player.id] = bid;
      consecutivePasses = 0;
      forceBidPlayerId = null;
      // ✅ Sofortiger Zuschlag bei Maximalgebot
      if (currentBid >= MAX_BID) {
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
      currentPlayerIndex = (currentPlayerIndex + 3) % players.length;
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
    io.to(socket.id).emit("discardPhase", { hand: hands[socket.id] });
  });

  socket.on("discardCards", (selected) => {
    if (socket.id !== winnerPlayerId) return;
    if (!hands[socket.id]) return;
    if (selected.length !== 4) return;

    hands[socket.id] = sortCards(
      hands[socket.id].filter((c) => !selected.includes(c))
    );
    io.to(socket.id).emit("hand", hands[socket.id]);

    // NEU: Discard-Phase ist vorbei
    io.to(socket.id).emit("discardDone");

    const player = players.find((p) => p.id === socket.id);
    trumpf = null;

    // Jetzt darf der Richter als erster spielen
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

    // Bedienpflicht prüfen
    if (currentTrick.length > 0) {
      const leadSuit = currentTrick[0].card.slice(-1);
      const hasLead = hands[socket.id].some((c) => c.slice(-1) === leadSuit);
      if (card.slice(-1) !== leadSuit && hasLead) {
        // Falsche Farbe gewählt, obwohl bedienbar → Anfrage ignorieren (keine Meldung)
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
          io.to(player.id).emit("askVariant", { options: ["NORMAL", "FLIP"] });
        } else if (roundVariant === VARIANTS.NORMAL && !trumpf) {
          // Falls Runde bereits auf NORMAL stand (z. B. spätere Anpassungen), setze Trumpf jetzt
          trumpf = card.slice(-1);
          io.emit("trumpChosen", { trumpf, winner: player });
        }
      }
    }

    if (currentTrick.length === 1) {
      trickLeader = socket.id;
    }
    io.emit("cardPlayed", { playerId: socket.id, card });

    // Wenn 4 Karten → Stich auswerten
    if (currentTrick.length === 4) {
      const leadSuit = currentTrick[0].card.slice(-1);

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
        currentPlayerIndex = (currentPlayerIndex + 3) % players.length;
        const next = players[currentPlayerIndex];
        io.to(next.id).emit("yourTurn", { currentBid, currentPlayer: next });
        io.emit("turnUpdate", { currentPlayer: next });
      }
    }
  });

  // --- Rundenauswertung ---
  function endRound() {
    const bidder = players.find((p) => p.id === winnerPlayerId) || {};
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
      bid,
      bidderId: winnerPlayerId,
      bidderName: bidder.name || "",
      bidderTeam,
      trumpf, // letzter bekannter Trumpf dieser Runde
      roundPoints: { ...roundPoints },
      teamScoresAfter: { ...teamScores },
      tricks: trickHistory.map((t) => ({ ...t })),
      fireTrickCount,
      stormTrickCount,
      ruleApplied, // <-- welche Regel wir angewendet haben
      doubleNegativeThreshold: DOUBLE_NEGATIVE_MIN,
      deltaApplied: { ...delta }, // <-- was addiert/abgezogen wurde
    };
    roundsHistory.push(roundEntry);
    // schickt den Sieger mit
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
      tricks: trickHistory,
      ruleApplied,
      deltaApplied: delta,
      doubleNegativeThreshold: DOUBLE_NEGATIVE_MIN,
    });
    io.emit("roundsHistoryUpdate", { roundsHistory });

    // Reset für nächste Runde
    tricksPlayed = 0;
    roundPoints = { Fire: 0, Storm: 0 };
    trumpf = null;
    hands = {};
    bottomCards = [];
    bids = {};
    winnerPlayerId = null;
    trickHistory = [];

    // Spielende?
    if (teamScores.Fire >= MAX_POINTS || teamScores.Storm >= MAX_POINTS) {
      const winner = teamScores.Fire >= MAX_POINTS ? "Fire" : "Storm";
      io.emit("gameOver", { winner, teamScores });
      return;
    }

    // Nächste Runde
    startNewRound();
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
