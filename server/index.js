// backend/server.js
const { Server } = require("socket.io");
const http = require("http");

const server = http.createServer();
const io = new Server(server, {
  cors: { origin: "*" }
});

// --- Globale Variablen ---
let players = []; // [{id, name, team, passed}]
let hands = {};   // id -> Karten
let bottomCards = [];
let bids = {};    // id -> bid
let currentBid = 0;
let currentPlayerIndex = 0;
let biddingActive = false;

// === Dummy Deal Funktion ===
function deal() {
  // TODO: hier Karten austeilen
  // fürs Testen: nur IDs als "Karten"
  const allCards = Array.from({ length: 52 }, (_, i) => i + 1);
  hands = {};
  bottomCards = allCards.slice(48);
  players.forEach((p, idx) => {
    hands[p.id] = allCards.slice(idx * 12, idx * 12 + 12);
    io.to(p.id).emit("hand", hands[p.id]);
  });
  io.emit("bottomCards", bottomCards);
}

// === Check ob Bietrunde vorbei ===
function checkBiddingEnd() {
  const teamFire = players.filter(p => p.team === "Fire");
  const teamStorm = players.filter(p => p.team === "Storm");

  const firePassed = teamFire.every(p => p.passed);
  const stormPassed = teamStorm.every(p => p.passed);

  if (firePassed || stormPassed) {
    biddingActive = false;

    const winnerTeam = firePassed ? "Storm" : "Fire";
    const candidates = players.filter(p => p.team === winnerTeam);

    const teamBids = Object.entries(bids).filter(([id]) =>
      candidates.some(c => c.id === id)
    );

    if (teamBids.length === 0) {
      io.emit("biddingResult", { winner: null, bid: 0 });
      return true;
    }

    const [winnerId, highestBid] = teamBids.reduce((a, b) =>
      a[1] > b[1] ? a : b
    );

    const winnerPlayer = players.find(p => p.id === winnerId);
    io.emit("biddingResult", { winner: winnerPlayer, bid: highestBid });
    return true;
  }

  return false;
}

// === Socket.io Events ===
io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  socket.on("register", (name) => {
    console.log("Player gave a name: ", name);
    if (players.length >= 4) {
      
      socket.emit("lobbyFull", { msg: "Lobby voll (max. 4 Spieler)" });
      return;
    }

    const team = players.length % 2 === 0 ? "Fire" : "Storm";
    const player = { id: socket.id, name, team, passed: false };
    players.push(player);

    io.emit("playersUpdate", players);

    if (players.length === 4) {
      deal();
      bids = {};
      currentBid = 0;
      currentPlayerIndex = 0;
      biddingActive = true;

      io.to(players[currentPlayerIndex].id).emit("yourTurn", { currentBid });
    }
  });

  socket.on("makeBid", (bid) => {
    if (!biddingActive) return;
    const player = players.find(p => p.id === socket.id);
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
    io.to(next.id).emit("yourTurn", { currentBid });
  });

  socket.on("disconnect", () => {
    console.log("Player disconnected:", socket.id);
    players = players.filter(p => p.id !== socket.id);
    io.emit("playersUpdate", players);
  });
});

// === Server Start ===
const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
});
