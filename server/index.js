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
  socket.on("getRoundsHistory", () => {
    socket.emit("roundsHistoryUpdate", { roundsHistory });
  });
});

// === Server Start ===
const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
});
