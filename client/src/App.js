import React, { useEffect, useState } from "react";
import { io } from "socket.io-client";

const socket = io("http://localhost:3001");

// --- einfache Styles ohne Tailwind ---
const styles = {
  page: {
    minHeight: "100vh",
    background: "#065f46", // grün
    padding: 16,
    color: "white",
    fontFamily:
      "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,Cantarell,'Fira Sans','Droid Sans','Helvetica Neue',sans-serif",
  },
  h1: {
    textAlign: "center",
    margin: "0 0 16px",
    fontSize: 28,
    fontWeight: 800,
  },
  card: {
    background: "white",
    color: "black",
    padding: 16,
    borderRadius: 8,
    marginTop: 16,
  },
  gridWrap: {
    display: "grid",
    gridTemplateColumns: "140px 140px 140px",
    gridTemplateRows: "120px 120px 120px",
    gap: 12,
    background: "#047857",
    borderRadius: 12,
    padding: 16,
    width: "max-content",
    margin: "24px auto 0",
  },
  tableCenter: {
    background: "#065f46",
    borderRadius: 12,
    border: "2px solid #10b981",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    color: "white",
    textAlign: "center",
  },
  playerBoxBase: {
    borderRadius: 10,
    padding: 10,
    textAlign: "center",
    fontSize: 14,
    fontWeight: 500,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    boxShadow: "0 2px 6px rgba(0,0,0,.15)",
  },
  fire: { background: "#fecaca", border: "2px solid #fca5a5" },
  storm: { background: "#bfdbfe", border: "2px solid #93c5fd" },
  me: { outline: "3px solid #f59e0b" },
  turn: { boxShadow: "0 0 0 4px rgba(251,191,36,.7) inset" },
  btn: {
    padding: "8px 12px",
    borderRadius: 6,
    border: "1px solid #e5e7eb",
    background: "#e5e7eb",
    cursor: "pointer",
  },
  btnRed: { background: "#fecaca" },
  btnBlue: { background: "#bfdbfe" },
  btnGreen: { background: "#bbf7d0" },
  rowWrap: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 },
  modalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
  },
  modal: { background: "white", padding: 20, borderRadius: 10, width: 360 },
};

function App() {
  const [hand, setHand] = useState([]);
  const [players, setPlayers] = useState([]);
  const [me, setMe] = useState(null);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [currentBid, setCurrentBid] = useState(0);
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [biddingWinner, setBiddingWinner] = useState(null);
  const [trumpf, setTrumpf] = useState(null);
  const [discardPhase, setDiscardPhase] = useState(false);
  const [selectedDiscard, setSelectedDiscard] = useState([]);
  const [randomTeams, setRandomTeams] = useState(false);
  const [showBottom, setShowBottom] = useState(false);
  const [bottomCards, setBottomCards] = useState([]);
  const [mustBid, setMustBid] = useState(false);

  useEffect(() => {
    socket.on("connect", () => {
      const name = prompt("Bitte gib deinen Namen ein:");
      if (name) socket.emit("register", name);
    });

    socket.on("invalidAction", ({ msg }) => alert(msg));

    socket.on("playersUpdate", (list) => {
      setPlayers(list);
      const myId = socket.id;
      const myself = list.find((p) => p.id === myId) || null;
      setMe(myself);
    });

    socket.on("randomTeamsActivated", () => setRandomTeams(true));

    const sortHand = (cards, tr) => {
      const suitOrder = ["♠", "♥", "♦", "♣"];
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
      return [...cards].sort((a, b) => {
        const [ra, sa] = [a.slice(0, -1), a.slice(-1)];
        const [rb, sb] = [b.slice(0, -1), b.slice(-1)];
        if (sa === tr && sb !== tr) return -1;
        if (sa !== tr && sb === tr) return 1;
        if (suitOrder.indexOf(sa) !== suitOrder.indexOf(sb))
          return suitOrder.indexOf(sa) - suitOrder.indexOf(sb);
        return rankOrder.indexOf(ra) - rankOrder.indexOf(rb);
      });
    };

    socket.on("hand", (cards) => setHand(sortHand(cards, trumpf)));
    socket.on("bottomCards", (cards) => console.log("Boden:", cards));

    socket.on("yourTurn", (data) => {
      setIsMyTurn(true);
      setCurrentBid(data.currentBid);
      setMustBid(!!data.mustBid);
      setCurrentPlayer(data.currentPlayer || null);
    });

    socket.on("turnUpdate", ({ currentPlayer }) =>
      setCurrentPlayer(currentPlayer)
    );

    socket.on("biddingResult", ({ winner, bid }) => {
      setBiddingWinner({ winner, bid });
      setIsMyTurn(false);
    });

    socket.on("showBottomCards", ({ bottomCards }) => {
      setBottomCards(bottomCards);
      setShowBottom(true);
    });

    socket.on("discardPhase", ({ hand }) => {
      setHand(sortHand(hand, trumpf));
      setDiscardPhase(true);
      setSelectedDiscard([]);
    });

    // Discard beendet

    socket.on("discardDone", () => {
      setDiscardPhase(false);
    });

    socket.on("trumpChosen", ({ trumpf, winner }) => {
      setTrumpf(trumpf);
      setHand((h) => sortHand(h, trumpf));
      alert(`${winner.name} hat ${trumpf} als Trumpf gesetzt (erste Karte)!`);
    });

    return () => socket.off();
  }, [trumpf]);

  const makeBid = (bid) => {
    socket.emit("makeBid", bid);
    setIsMyTurn(false);
  };

  const toggleDiscard = (card) => {
    setSelectedDiscard((prev) =>
      prev.includes(card)
        ? prev.filter((c) => c !== card)
        : prev.length < 4
        ? [...prev, card]
        : prev
    );
  };

  const confirmDiscard = () => {
    if (selectedDiscard.length === 4)
      socket.emit("discardCards", selectedDiscard);
    else alert("Bitte genau 4 Karten auswählen!");
  };

  const playCard = (card) => {
    socket.emit("playCard", card);
  };

  const getSeatingOrder = () => {
    if (!me || players.length !== 4) return [null, null, null, null];
    const myIndex = players.findIndex((p) => p.id === me.id);
    if (myIndex === -1) return [null, null, null, null];
    return [
      players[myIndex],
      players[(myIndex + 3) % 4],
      players[(myIndex + 2) % 4],
      players[(myIndex + 1) % 4],
    ];
  };

  const seated = getSeatingOrder();

  const PlayerBox = ({ p, youLabel }) => {
    if (!p) return <div />;
    const boxStyle = {
      ...styles.playerBoxBase,
      ...(p.team === "Fire" ? styles.fire : styles.storm),
      ...(currentPlayer && currentPlayer.id === p.id ? styles.turn : {}),
      ...(me && me.id === p.id ? styles.me : {}),
    };
    return (
      <div style={boxStyle}>
        <div style={{ fontWeight: 700 }}>
          {p.name} {youLabel ? "(Du)" : ""}
        </div>
        <div style={{ fontSize: 12, opacity: 0.9 }}>Team {p.team}</div>
        {p.passed ? (
          <div style={{ fontSize: 11, color: "#991b1b", marginTop: 3 }}>
            (Pass)
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>Shelem — Lobby &amp; Bieten</h1>

      {/* Popup Boden-Karten */}
      {showBottom && (
        <div style={styles.modalBackdrop}>
          <div style={styles.modal}>
            <h3 style={{ margin: 0, fontWeight: 800 }}>Boden-Karten</h3>
            <div style={{ ...styles.rowWrap, marginTop: 10 }}>
              {bottomCards.map((c) => (
                <span
                  key={c}
                  style={{
                    padding: "6px 10px",
                    border: "1px solid #f59e0b",
                    borderRadius: 6,
                    background: "#000",
                  }}
                >
                  {c}
                </span>
              ))}
            </div>
            <div style={{ marginTop: 12, textAlign: "right" }}>
              <button
                style={{ ...styles.btn, background: "#86efac" }}
                onClick={() => {
                  socket.emit("takeBottomCards");
                  setShowBottom(false);
                }}
              >
                Übernehmen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Team Auswahl */}
      {me && !me.team && (
        <div style={styles.card}>
          {!randomTeams ? (
            <>
              <h3 style={{ margin: 0 }}>Wähle dein Team:</h3>
              <div style={styles.rowWrap}>
                <button
                  style={{ ...styles.btn, ...styles.btnRed }}
                  onClick={() => socket.emit("chooseTeam", "Fire")}
                >
                  Team Fire
                </button>
                <button
                  style={{ ...styles.btn, ...styles.btnBlue }}
                  onClick={() => socket.emit("chooseTeam", "Storm")}
                >
                  Team Storm
                </button>
                {players.length === 1 && (
                  <button
                    style={{ ...styles.btn, ...styles.btnGreen }}
                    onClick={() => socket.emit("chooseTeam", "Random")}
                  >
                    Random Teams
                  </button>
                )}
              </div>
            </>
          ) : (
            <h3>Teams werden automatisch zugewiesen…</h3>
          )}
        </div>
      )}

      {/* Spielfeld */}
      {players.length === 4 && (
        <div style={styles.gridWrap}>
          <div />
          <PlayerBox p={seated[2]} />
          <div />
          <PlayerBox p={seated[1]} />
          <div style={styles.tableCenter}>
            {!biddingWinner ? (
              <div style={{ fontSize: 18, fontWeight: 800 }}>
                Gebot: {currentBid}
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>
                  Gebot Gewinner:
                </div>
                <div style={{ fontWeight: 800 }}>
                  {biddingWinner.winner ? biddingWinner.winner.name : "Keiner"}
                </div>
                <div style={{ fontSize: 12 }}>Gebot: {biddingWinner.bid}</div>
              </div>
            )}
            {trumpf && (
              <div
                style={{
                  marginTop: 8,
                  padding: "6px 10px",
                  background: "#7c3aed",
                  borderRadius: 8,
                }}
              >
                <div style={{ fontSize: 12 }}>Trumpf</div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{trumpf}</div>
              </div>
            )}
          </div>
          <PlayerBox p={seated[3]} />
          <div />
          <PlayerBox p={seated[0]} youLabel />
          <div />
        </div>
      )}

      {/* Discard Phase */}
      {discardPhase && (
        <div style={styles.card}>
          <h3>Wähle 4 Karten zum Abwerfen:</h3>
          <div style={styles.rowWrap}>
            {hand.map((card) => {
              const selected = selectedDiscard.includes(card);
              return (
                <button
                  key={card}
                  onClick={() => toggleDiscard(card)}
                  disabled={!selected && selectedDiscard.length >= 4}
                  style={{
                    ...styles.btn,
                    background: selected ? "#f87171" : "#f3f4f6",
                    color: selected ? "white" : "black",
                    opacity: !selected && selectedDiscard.length >= 4 ? 0.5 : 1,
                  }}
                >
                  {card}
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: 8 }}>
            <button
              style={{ ...styles.btn, background: "#22c55e", color: "white" }}
              onClick={confirmDiscard}
              disabled={selectedDiscard.length !== 4}
            >
              Abwerfen bestätigen
            </button>
          </div>
        </div>
      )}

      {/* Hand */}
      <div style={styles.card}>
        <h2>Deine Hand:</h2>
        <div style={styles.rowWrap}>
          {hand.map((card) => (
            <button
              key={card}
              onClick={() =>
                biddingWinner && isMyTurn && !discardPhase && playCard(card)
              }
              disabled={!biddingWinner || !isMyTurn || discardPhase}
              style={{
                ...styles.btn,
                background:
                  !biddingWinner || !isMyTurn || discardPhase
                    ? "#f3f4f6"
                    : "#e5e7eb",
                cursor:
                  !biddingWinner || !isMyTurn || discardPhase
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              {card}
            </button>
          ))}
        </div>
      </div>

      {/* Bieten */}
      {isMyTurn && me && !me.passed && !biddingWinner && (
        <div style={styles.card}>
          <h3>Dein Zug — aktuelles Gebot: {currentBid}</h3>
          <div style={styles.rowWrap}>
            {!mustBid && (
              <button style={styles.btn} onClick={() => makeBid(0)}>
                Pass
              </button>
            )}
            {[...Array(14).keys()]
              .map((i) => (i + 1) * 5 + 95)
              .filter((bid) => bid > currentBid)
              .map((bid) => (
                <button
                  key={bid}
                  style={{ ...styles.btn, background: "#bfdbfe" }}
                  onClick={() => makeBid(bid)}
                >
                  {bid}
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Status */}
      {!isMyTurn && !biddingWinner && currentPlayer && (
        <div style={{ textAlign: "center", marginTop: 16 }}>
          Aktuell am Zug: {currentPlayer.name} (Team {currentPlayer.team})
        </div>
      )}
    </div>
  );
}

export default App;
