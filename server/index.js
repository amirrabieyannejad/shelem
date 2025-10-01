// backend/server.js
const { Server } = require("socket.io");
const http = require("http");

const server = http.createServer();
const io = new Server(server, {
  cors: { origin: "*" },
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
let MAX_POINTS = 1165;

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

// === Sitzordnung festlegen ===
function assignSeats() {
  if (players.length !== 4) return;

  // Teams trennen
  const fireTeam = players.filter((p) => p.team === "Fire");
  const stormTeam = players.filter((p) => p.team === "Storm");

  // Sitzordnung: Fire-Storm-Fire-Storm (Teams sitzen sich gegenüber)
  players = [
    fireTeam[0], // Position 0
    stormTeam[0], // Position 1
    fireTeam[1], // Position 2 (gegenüber von Position 0)
    stormTeam[1], // Position 3 (gegenüber von Position 1)
  ];

  // Sitzpositionen zuweisen
  players.forEach((player, index) => {
    player.seatPosition = index;
  });

  console.log(
    "Sitzordnung festgelegt:",
    players.map((p) => `${p.name} (${p.team}) - Sitz ${p.seatPosition}`)
  );
}

// === Karten austeilen ===
function deal() {
  let deck = createDeck();
  deck = shuffle(deck);

  // neue Runde sauber starten
  roundPoints = { Fire: 0, Storm: 0 };
  tricksPlayed = 0;
  currentTrick = [];

  hands = {};

  bottomCards = deck.slice(48); // letzte 4 Karten als "Bottom Cards"

  players.forEach((p, idx) => {
    hands[p.id] = deck.slice(idx * 12, idx * 12 + 12);
    io.to(p.id).emit("hand", hands[p.id]);
  });

  io.emit("bottomCards", bottomCards);

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
  if (rank === "A") return 15;
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
function compareCards(cardA, cardB, leadSuit, trumpSuit) {
  const [rankA, suitA] = [cardA.slice(0, -1), cardA.slice(-1)];
  const [rankB, suitB] = [cardB.slice(0, -1), cardB.slice(-1)];

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
  // Auction- & Rundenstatus resetten
  players.forEach((p) => (p.passed = false));
  consecutivePasses = 0;
  forceBidPlayerId = null;
  bids = {};
  currentBid = 0;
  winnerPlayerId = null;
  trumpf = null;

  // Variante B: reihum weitergeben (empfohlen):
  currentPlayerIndex = (currentPlayerIndex + 3) % players.length;

  biddingActive = true;

  // Karten geben & RoundPoints auf 0 an alle senden
  deal(); // ruft io.emit("roundPointsUpdate", { roundPoints: {Fire:0,Storm:0} })

  // Ersten Bieter benachrichtigen
  const next = players[currentPlayerIndex];
  io.to(next.id).emit("yourTurn", { currentBid, currentPlayer: next });
  io.emit("turnUpdate", { currentPlayer: next });

  // UI kriegt "passed=false"-Reset mit
  io.emit("playersUpdate", players);
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

    const player = {
      id: socket.id,
      name,
      team: null,
      passed: false,
      seatPosition: null,
    };
    // Falls Random-Teams aktiv: sofort Team zuweisen
    if (randomTeams) {
      const fireCount = players.filter((p) => p.team === "Fire").length;
      const stormCount = players.filter((p) => p.team === "Storm").length;

      // Gleichmäßige Verteilung sicherstellen
      if (fireCount < 2 && (stormCount >= 2 || Math.random() < 0.5)) {
        player.team = "Fire";
      } else {
        player.team = "Storm";
      }
    }
    players.push(player);

    // Wenn nach Join beide Teams voll sind → Sitzordnung und Spiel starten
    const fire = players.filter((p) => p.team === "Fire");
    const storm = players.filter((p) => p.team === "Storm");

    if (fire.length === 2 && storm.length === 2) {
      assignSeats(); // Wichtig: Sitzordnung festlegen

      players.forEach((p) => (p.passed = false));
      consecutivePasses = 0;
      forceBidPlayerId = null;
      deal();
      bids = {};
      currentBid = 0;
      currentPlayerIndex = 0;
      biddingActive = true;

      const next = players[currentPlayerIndex];
      io.to(next.id).emit("yourTurn", { currentBid, currentPlayer: next });
      io.emit("turnUpdate", { currentPlayer: next });
    }

    io.emit("playersUpdate", players);
  });

  socket.on("chooseTeam", (team) => {
    const player = players.find((p) => p.id === socket.id);
    if (!player) return;

    if (team === "Random") {
      if (players.length === 1) {
        randomTeams = true;
        io.emit("randomTeamsActivated");

        // Erster Spiler kriegt direkt random Team
        const assigned = Math.random() < 0.5 ? "Fire" : "Storm";
        player.team = assigned;

        // alle anderen Spieler blockieren
        players.forEach((p) => {
          if (!p.team) {
            p.team = "Pending"; // Platzhalter, keine Buttons mehr
          }
        });

        io.emit("playersUpdate", players);
      }
      return;
    }

    if (randomTeams) {
      const fireCount = players.filter((p) => p.team === "Fire").length;
      const stormCount = players.filter((p) => p.team === "Storm").length;

      if (fireCount < 2 && (stormCount >= 2 || Math.random() < 0.5)) {
        player.team = "Fire";
      } else {
        player.team = "Storm";
      }
      io.emit("playersUpdate", players);
    } else {
      const teamMembers = players.filter((p) => p.team === team);
      if (teamMembers.length >= 2) {
        socket.emit("teamFull", { msg: `Team ${team} ist voll` });
        return;
      }
      player.team = team;
      io.emit("playersUpdate", players);
    }

    const fire = players.filter((p) => p.team === "Fire");
    const storm = players.filter((p) => p.team === "Storm");

    if (fire.length === 2 && storm.length === 2) {
      assignSeats(); // Wichtig: Sitzordnung festlegen

      players.forEach((p) => (p.passed = false));
      consecutivePasses = 0;
      forceBidPlayerId = null;
      deal();
      bids = {};
      currentBid = 0;
      currentPlayerIndex = 0;
      biddingActive = true;

      const next = players[currentPlayerIndex];
      io.to(next.id).emit("yourTurn", { currentBid, currentPlayer: next });
      io.emit("turnUpdate", { currentPlayer: next });

      io.emit("playersUpdate", players);
    }
  });

  socket.on("makeBid", (bid) => {
    if (!biddingActive) return;
    const player = players.find((p) => p.id === socket.id);
    if (!player) return;

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

    hands[socket.id] = [...hands[socket.id], ...bottomCards];
    bottomCards = [];

    io.to(socket.id).emit("hand", hands[socket.id]);
    io.to(socket.id).emit("discardPhase", { hand: hands[socket.id] });
  });

  socket.on("discardCards", (selected) => {
    if (socket.id !== winnerPlayerId) return;
    if (!hands[socket.id]) return;
    if (selected.length !== 4) return;

    hands[socket.id] = hands[socket.id].filter((c) => !selected.includes(c));
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

    if (!trumpf && player.id === winnerPlayerId) {
      trumpf = card.slice(-1);
      io.emit("trumpChosen", { trumpf, winner: player });
    }
    // Bedienpflicht prüfen
    if (currentTrick.length > 0) {
      const leadSuit = currentTrick[0].card.slice(-1);
      const hasLead = hands[socket.id].some((c) => c.slice(-1) === leadSuit);
      if (card.slice(-1) !== leadSuit && hasLead) {
        socket.emit("invalidAction", {
          msg: "Du musst die angespielte Farbe bedienen!",
        });
        return;
      }
    }

    // Karte entfernen
    hands[socket.id] = hands[socket.id].filter((c) => c !== card);
    io.to(socket.id).emit("hand", hands[socket.id]);

    // In Stich legen
    currentTrick.push({ playerId: socket.id, card });
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
          trumpf
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
      // Nächster Spieler gegen  Uhrzeigersinn
      currentPlayerIndex = (currentPlayerIndex + 3) % players.length;
      const next = players[currentPlayerIndex];
      io.to(next.id).emit("yourTurn", { currentBid, currentPlayer: next });
      io.emit("turnUpdate", { currentPlayer: next });
    }
  });

  // --- Rundenauswertung ---
  function endRound() {
    const fire = roundPoints.Fire;
    const storm = roundPoints.Storm;

    const bidder = players.find((p) => p.id === winnerPlayerId);
    const bidderTeam = bidder.team;
    const otherTeam = bidderTeam === "Fire" ? "Storm" : "Fire";
    const bid = bids[winnerPlayerId] || 0;

    if (roundPoints[bidderTeam] >= bid) {
      teamScores[bidderTeam] += roundPoints[bidderTeam];
      teamScores[otherTeam] += roundPoints[otherTeam];
    } else {
      teamScores[bidderTeam] -= bid;
      teamScores[otherTeam] += roundPoints[otherTeam];
    }

    io.emit("roundEnd", { roundPoints, teamScores });

    // Reset lokale Rundendaten
    tricksPlayed = 0;
    roundPoints = { Fire: 0, Storm: 0 };
    trumpf = null;
    hands = {};
    bottomCards = [];
    bids = {};
    winnerPlayerId = null;

    // Spielende?
    if (teamScores.Fire >= MAX_POINTS || teamScores.Storm >= MAX_POINTS) {
      const winner = teamScores.Fire >= MAX_POINTS ? "Fire" : "Storm";
      io.emit("gameOver", { winner, teamScores });
      return; // kein Neustart mehr
    }

    //  Sofort neue Runde starten
    startNewRound();
  }

  socket.on("disconnect", () => {
    console.log("Player disconnected:", socket.id);
    players = players.filter((p) => p.id !== socket.id);

    // Reset bei Disconnect
    if (players.length < 4) {
      biddingActive = false;
      trumpf = null;
      winnerPlayerId = null;
      currentBid = 0;
      consecutivePasses = 0;
      forceBidPlayerId = null;
      hands = {};
      bids = {};
    }

    io.emit("playersUpdate", players);
  });
});

// === Server Start ===
const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
});
