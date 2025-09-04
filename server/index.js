// backend/server.js
const { Server } = require("socket.io");
const http = require("http");

const server = http.createServer();
const io = new Server(server, {
  cors: { origin: "*" },
});

// --- Globale Variablen ---
let players = []; // [{id, name, team, passed}]
let hands = {}; // id -> Karten
let bottomCards = [];
let bids = {}; // id -> bid
let currentBid = 0;
let currentPlayerIndex = 0;
let biddingActive = false;
let trumpf = null;
let winnerPlayerId = null;
let randomTeams = false;

// === Karten Deck ===
const suits = ["♠", "♥", "♦", "♣"];
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

// === Karten austeilen ===
function deal() {
  let deck = createDeck();
  deck = shuffle(deck);

  hands = {};
  bottomCards = deck.slice(48); // letzte 4 Karten als "Bottom Cards"

  players.forEach((p, idx) => {
    hands[p.id] = deck.slice(idx * 12, idx * 12 + 12);
    io.to(p.id).emit("hand", hands[p.id]);
  });

  io.emit("bottomCards", bottomCards);
}

// === Check ob Bietrunde vorbei ===
function checkBiddingEnd() {
  const teamFire = players.filter((p) => p.team === "Fire");
  const teamStorm = players.filter((p) => p.team === "Storm");

  const firePassed = teamFire.every((p) => p.passed);
  const stormPassed = teamStorm.every((p) => p.passed);

  if (firePassed || stormPassed) {
    biddingActive = false;

    const winnerTeam = firePassed ? "Storm" : "Fire";
    const candidates = players.filter((p) => p.team === winnerTeam);

    const teamBids = Object.entries(bids).filter(([id]) =>
      candidates.some((c) => c.id === id)
    );

    if (teamBids.length === 0) {
      io.emit("biddingResult", { winner: null, bid: 0 });
      return true;
    }

    const [winnerId, highestBid] = teamBids.reduce((a, b) =>
      a[1] > b[1] ? a : b
    );

    const winnerPlayer = players.find((p) => p.id === winnerId);
    winnerPlayerId = winnerId;

    io.emit("biddingResult", { winner: winnerPlayer, bid: highestBid });

    // Boden automatisch zu Hand hinzufügen
    io.to(winnerId).emit("showBottomCards",{bottomCards});
    return true;
  }

  return false;
}

// === Socket.io Events ===
io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  socket.on("register", (name) => {
  console.log("Player gave a name:", name);
  if (players.length >= 4) {
    socket.emit("lobbyFull", { msg: "Lobby voll (max. 4 Spieler)" });
    return;
  }

  const player = { id: socket.id, name, team: null, passed: false };

  // Falls Random-Teams aktiv: sofort Team zuweisen
  if (randomTeams) {
    const teams = ["Fire", "Storm"];
    let assignedTeam = teams[Math.floor(Math.random() * 2)];

    // prüfen ob Team voll
    let teamMembers = players.filter((p) => p.team === assignedTeam);
    if (teamMembers.length >= 2) {
      assignedTeam = assignedTeam === "Fire" ? "Storm" : "Fire";
    }
    player.team = assignedTeam;
  }

  players.push(player);
  io.emit("playersUpdate", players);

  // Wenn nach Join beide Teams voll sind → Spiel starten
  const fire = players.filter((p) => p.team === "Fire");
  const storm = players.filter((p) => p.team === "Storm");

  if (fire.length === 2 && storm.length === 2) {
    players.forEach((p) => (p.passed = false));
    deal();
    bids = {};
    currentBid = 0;
    currentPlayerIndex = 0;
    biddingActive = true;

    const next = players[currentPlayerIndex];
    io.to(next.id).emit("yourTurn", { currentBid, currentPlayer: next });
    io.emit("turnUpdate", { currentPlayer: next });
  }
});


socket.on("chooseTeam", (team) => {
  const player = players.find((p) => p.id === socket.id);
  if (!player) return;

  if (team === "Random") {
    // nur erster Spieler darf Random aktivieren
    if (players.length === 1) {
      randomTeams = true;
      io.emit("randomTeamsActivated");

      // Ersten Spieler direkt zufällig zuordnen
      const assigned = Math.random() < 0.5 ? "Fire" : "Storm";
      player.team = assigned;

      io.emit("playersUpdate", players);
    }
    return;
  }

  // wenn Random aktiv ist -> keine manuelle Auswahl mehr
  if (randomTeams) {
    const teams = ["Fire", "Storm"];
    let assignedTeam = teams[Math.floor(Math.random() * 2)];

    // prüfen ob Team voll
    let teamMembers = players.filter((p) => p.team === assignedTeam);
    if (teamMembers.length >= 2) {
      assignedTeam = assignedTeam === "Fire" ? "Storm" : "Fire";
    }
    player.team = assignedTeam;
    io.emit("playersUpdate", players);
  } else {
    // normale manuelle Auswahl
    const teamMembers = players.filter((p) => p.team === team);
    if (teamMembers.length >= 2) {
      socket.emit("teamFull", { msg: `Team ${team} is full` });
      return;
    }
    player.team = team;
    io.emit("playersUpdate", players);
  }

  

  // Startbedingung prüfen
  const fire = players.filter((p) => p.team === "Fire");
  const storm = players.filter((p) => p.team === "Storm");

  if (fire.length === 2 && storm.length === 2) {
    players.forEach((p) => (p.passed = false));
    deal();
    bids = {};
    currentBid = 0;
    currentPlayerIndex = 0;
    biddingActive = true;

    const next = players[currentPlayerIndex];
    io.to(next.id).emit("yourTurn", { currentBid, currentPlayer: next });
    io.emit("turnUpdate", { currentPlayer: next });
  }
});

  socket.on("makeBid", (bid) => {
    if (!biddingActive) return;
    const player = players.find((p) => p.id === socket.id);
    if (!player) return;

    if (bid === 0) {
      player.passed = true;
    } else {
      currentBid = bid;
      player.passed = false;
      bids[player.id] = bid;
    }

    io.emit("playersUpdate", players);

    if (checkBiddingEnd()) return;

    do {
      currentPlayerIndex = (currentPlayerIndex + 1) % 4;
    } while (players[currentPlayerIndex].passed);

    const next = players[currentPlayerIndex];
    io.to(next.id).emit("yourTurn", { currentBid, currentPlayer: next });
    io.emit("turnUpdate", { currentPlayer: next });
  });
  // Gewinner bestätigt Boden-Aufnahme
  socket.on("takeBottomCards", () => {
    if (socket.id !== winnerPlayerId) return;
    if (!hands[socket.id]) return;

    // Boden zu Hand hinzufügen
    hands[socket.id] = [...hands[socket.id], ...bottomCards];
    bottomCards = [];

    // neue Hand senden + Discard-Phase starten
    io.to(socket.id).emit("hand", hands[socket.id]);
    io.to(socket.id).emit("discardPhase", { hand: hands[socket.id] });
  });

  // Gewinner wirft 4 Karten ab
  socket.on("discardCards", (selected) => {
    if (socket.id !== winnerPlayerId) return;
    if (!hands[socket.id]) return;
    if (selected.length !== 4) return;

    hands[socket.id] = hands[socket.id].filter((c) => !selected.includes(c));
    io.to(socket.id).emit("hand", hands[socket.id]);

    io.to(socket.id).emit("chooseTrumpPhase");
  });

  // Gewinner wählt Trumpf
  socket.on("chooseTrump", (suit) => {
    if (socket.id !== winnerPlayerId) return;
    trumpf = suit;
    io.emit("trumpChosen", {
      trumpf,
      winner: players.find((p) => p.id === socket.id),
    });
  });

  // Disconnect Handler (richtig platziert!)
  socket.on("disconnect", () => {
    console.log("Player disconnected:", socket.id);
    players = players.filter((p) => p.id !== socket.id);
    io.emit("playersUpdate", players);
  });
});

// === Server Start ===
const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
});
