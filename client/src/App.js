import React, { useEffect, useState, useRef } from "react";
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
  tableCard: {
    background: "#111",
    color: "white",
    border: "2px solid #f59e0b",
    padding: "8px 12px",
    borderRadius: 10,
    minWidth: 64,
    textAlign: "center",
    fontSize: 20,
    fontWeight: 800,
  },

  gridWrap: {
    display: "grid",
    gridTemplateColumns: "160px 400px 130px", // mehr Abstand links/rechts
    gridTemplateRows: "140px 240px 140px", // mehr Abstand oben/unten
    gap: 16,
    background: "#047857",
    borderRadius: 12,
    padding: 20,
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
    padding: 20,
    minWidth: 300,
    minHeight: 220,
    color: "white",
    textAlign: "center",
  },
  playerBoxBase: {
    borderRadius: 8,
    padding: 4,
    fontSize: 11,
    fontWeight: 500,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    width: 100,
    height: 70,
    boxShadow: "0 2px 6px rgba(0,0,0,.15)",
  },
  fire: { background: "#940f0fff", border: "2px solid #fca5a5" },
  storm: { background: "#0072feff", border: "2px solid #93c5fd" },
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
  infoBar: {
    maxWidth: 760,
    margin: "0 auto 12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
    background: "rgba(0,0,0,.12)",
    padding: "10px 16px",
    borderRadius: 10,
  },
  pill: {
    background: "rgba(0,0,0,.25)",
    border: "1px solid rgba(255,255,255,.2)",
    padding: "6px 10px",
    borderRadius: 8,
    fontWeight: 700,
    fontSize: 14,
  },
  bigCard: {
    background: "#111",
    color: "white",
    border: "2px solid #f59e0b",
    padding: "12px 16px",
    borderRadius: 10,
    minWidth: 70,
    textAlign: "center",
    fontSize: 22,
    fontWeight: 800,
  },
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
  const [scores, setScores] = useState({ Fire: 0, Storm: 0 });
  const [lastTrick, setLastTrick] = useState(null);
  const [trumpfSetter, setTrumpfSetter] = useState(null);
  const [currentTrick, setCurrentTrick] = useState([]); // {playerId, card}[]
  const trickTimer = React.useRef(null);

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

    socket.on("turnUpdate", ({ currentPlayer }) => {
      setCurrentPlayer(currentPlayer);
      setIsMyTurn(!!currentPlayer && currentPlayer.id === socket.id);
    });

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
      setTrumpfSetter(winner);
      setHand((h) => sortHand(h, trumpf));
    });
    socket.on("cardPlayed", ({ playerId, card }) => {
      if (trickTimer.current) {
        // ggf. altes Leeren abbrechen
        clearTimeout(trickTimer.current);
        trickTimer.current = null;
      }
      setCurrentTrick((prev) => [...prev, { playerId, card }].slice(-4));
    });
    socket.on("trickResult", ({ winner, cards, points }) => {
      // sicherstellen, dass die 4 Karten komplett sind
      setCurrentTrick(cards);
      setLastTrick({ winner, cards, points });
      // nach ~2s Tisch leeren
      if (trickTimer.current) clearTimeout(trickTimer.current);
      trickTimer.current = setTimeout(() => {
        setCurrentTrick([]);
      }, 2000);
    });
    socket.on("invalidAction", ({ msg }) => {
      alert(msg);
      // Falls jemand versehentlich deaktiviert hat, hier wieder aktivieren:
      setIsMyTurn(
        (cp) => cp || (currentPlayer && currentPlayer.id === socket.id)
      );
    });

    socket.on("roundEnd", ({ roundPoints, teamScores }) => {
      setScores(teamScores);
      alert(
        `Runde beendet!\nFire: ${roundPoints.Fire} | Storm: ${roundPoints.Storm}`
      );
      setLastTrick(null);
      setCurrentTrick([]);
    });

    socket.on("gameOver", ({ winner, teamScores }) => {
      setScores(teamScores);
      alert(
        `Spielende! Gewinner: Team ${winner}\nFire: ${teamScores.Fire}, Storm: ${teamScores.Storm}`
      );
    });
    return () => {
      socket.off();
      if (trickTimer.current) clearTimeout(trickTimer.current);
    };
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
        <div style={{ fontWeight: 900, fontSize: 12 }}>
          {p.name} {youLabel ? "(Du)" : ""}
        </div>
        <div style={{ fontSize: 12, opacity: 0.9 }}>Team {p.team}</div>
        {p.passed && (
          <div style={{ fontSize: 12, color: "#991b1b" }}>(Pass)</div>
        )}
        {/* Trumpf nur für den Richter */}
        {trumpf && trumpfSetter && trumpfSetter.id === p.id && (
          <div style={{ marginTop: 4, fontSize: 14 }}>
            Trumpf: <span style={{ fontWeight: 800 }}>{trumpf}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>Shelem — Lobby &amp; Bieten</h1>

      {/* Info-Bar (Gebot + Team-Punkte) */}
      <div style={styles.infoBar}>
        <div style={styles.pill}>Gebot: {currentBid}</div>
        <div style={styles.pill}>Fire: {scores.Fire}</div>
        <div style={styles.pill}>Storm: {scores.Storm}</div>
      </div>

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
      {me && !me.team && !randomTeams && (
        <div style={styles.card}>
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
        </div>
      )}
      {me && (!me.team || me.team === "Pending") && randomTeams && (
        <div style={styles.card}>
          <h3>Teams werden automatisch zugewiesen…</h3>
        </div>
      )}

      {/* Spielfeld */}
      {players.length === 4 && (
        <div
          style={{
            position: "relative",
            width: 600,
            height: 500,
            margin: "24px auto",
            background: "#047857",
            borderRadius: 12,
          }}
        >
          {/* Tisch in der Mitte: aktueller Stich (bis zu 4 Karten) */}
          <div
            style={{
              ...styles.tableCenter,
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
            }}
          >
            <div style={{ position: "relative", width: 220, height: 160 }}>
              {(() => {
                const posStyle = {
                  top: { top: 0, left: "50%", transform: "translate(-50%, 0)" },
                  right: {
                    top: "50%",
                    right: 0,
                    transform: "translate(0, -50%)",
                  },
                  bottom: {
                    bottom: 0,
                    left: "50%",
                    transform: "translate(-50%, 0)",
                  },
                  left: {
                    top: "50%",
                    left: 0,
                    transform: "translate(0, -50%)",
                  },
                };

                const getSide = (pid) => {
                  if (!seated[0] || !seated[1] || !seated[2] || !seated[3])
                    return null;
                  if (seated[0]?.id === pid) return "bottom";
                  if (seated[1]?.id === pid) return "right";
                  if (seated[2]?.id === pid) return "top";
                  if (seated[3]?.id === pid) return "left";
                  return null;
                };

                const bySide = {};
                currentTrick.forEach((t) => {
                  const side = getSide(t.playerId);
                  if (side && !bySide[side]) bySide[side] = t.card;
                });

                return (
                  <>
                    {bySide.top && (
                      <div style={{ position: "absolute", ...posStyle.top }}>
                        <div style={styles.tableCard}>{bySide.top}</div>
                      </div>
                    )}
                    {bySide.right && (
                      <div style={{ position: "absolute", ...posStyle.right }}>
                        <div style={styles.tableCard}>{bySide.right}</div>
                      </div>
                    )}
                    {bySide.bottom && (
                      <div style={{ position: "absolute", ...posStyle.bottom }}>
                        <div style={styles.tableCard}>{bySide.bottom}</div>
                      </div>
                    )}
                    {bySide.left && (
                      <div style={{ position: "absolute", ...posStyle.left }}>
                        <div style={styles.tableCard}>{bySide.left}</div>
                      </div>
                    )}

                    {currentTrick.length === 0 && (
                      <div
                        style={{
                          position: "absolute",
                          top: "50%",
                          left: "50%",
                          transform: "translate(-50%, -50%)",
                          opacity: 0.6,
                          fontSize: 12,
                        }}
                      >
                        Warte auf Karten…
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>

          {/* Spieler oben */}
          <div
            style={{
              position: "absolute",
              top: 10,
              left: "50%",
              transform: "translateX(-50%)",
            }}
          >
            <PlayerBox p={seated[2]} />
          </div>

          {/* Spieler unten */}
          <div
            style={{
              position: "absolute",
              bottom: 10,
              left: "50%",
              transform: "translateX(-50%)",
            }}
          >
            <PlayerBox p={seated[0]} youLabel />
          </div>

          {/* Spieler links */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: 10,
              transform: "translateY(-50%)",
            }}
          >
            <PlayerBox p={seated[3]} />
          </div>

          {/* Spieler rechts */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              right: 10,
              transform: "translateY(-50%)",
            }}
          >
            <PlayerBox p={seated[1]} />
          </div>
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
