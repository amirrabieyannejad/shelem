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
    textAlign: "center",
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
  fire: { background: "#940f0fff", border: "2px solid #fca5a5" },
  storm: { background: "#0072feff", border: "2px solid #93c5fd" },
  me: { outline: "3px solid #f59e0b" },
  turn: { boxShadow: "0 0 0 4px rgba(251,191,36,.7) inset" },
  btnRed: { background: "#fecaca" },
  btnBlue: { background: "#bfdbfe" },
  btnGreen: { background: "#bbf7d0" },
  rowWrap: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 },
  centerRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
    justifyContent: "center", // ⬅️ zentrieren
  },
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
    maxWidth: "min(92vw, 900px)",
    margin: "0 auto 12px",
    display: "flex",
    flexWrap: "wrap", // erlaubt Umbruch auf kleinen Screens
    gap: 12,
    justifyContent: "center",
    alignItems: "center",
    background: "rgba(0,0,0,.12)",
    padding: "10px 12px",
    borderRadius: 10,
  },
  tableWrap: {
    position: "relative",
    width: "min(94vw, 720px)", // statt 600px
    height: "min(60vh, 520px)", // statt 500px
    margin: "clamp(8px, 3vh, 24px) auto",
    background: "#047857",
    borderRadius: 12,
  },
  tableCenter: {
    background: "#065f46",
    border: "2px solid #10b981",
    borderRadius: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    // passt sich an die tableWrap-Größe an
    width: "80%",
    height: "65%",
    color: "white",
    textAlign: "center",
  },
  playerBoxBase: {
    borderRadius: 10,
    padding: 6,
    fontSize: "clamp(10px, 2.6vw, 12px)",
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "clamp(80px, 18vw, 120px)", // responsive Breite
    height: "clamp(56px, 12vw, 84px)", // responsive Höhe
    boxShadow: "0 2px 6px rgba(0,0,0,.15)",
    textAlign: "center",
    flexDirection: "column",
    lineHeight: 1.1,
    gap: 2,
  },
  // optional: größere Touch-Ziele für Buttons
  btn: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid #e5e7eb",
    background: "#e5e7eb",
    cursor: "pointer",
    touchAction: "manipulation",
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
  const [lastTrick, setLastTrick] = useState(0);
  const [bottomCards, setBottomCards] = useState([]);
  const [mustBid, setMustBid] = useState(false);
  const [scores, setScores] = useState({ Fire: 0, Storm: 0 });
  const [trumpfSetter, setTrumpfSetter] = useState(null);
  const [currentTrick, setCurrentTrick] = useState([]); // {playerId, card}[]
  const trickTimer = useRef(null);
  const [roundPointsLive, setRoundPointsLive] = useState({ Fire: 0, Storm: 0 });

  function setTabTitle({ me, isMyTurn }) {
    if (!me) {
      document.title = "Shelem — verbunden…";
      return;
    }
    const team = me.team ? `Team ${me.team}` : "ohne Team";
    const turn = isMyTurn ? " ⏳(Am Zug)" : "";
    document.title = `${me.name} — ${team}${turn}`;
  }
  function setThemeColor(team) {
    const meta =
      document.querySelector('meta[name="theme-color"]') ||
      Object.assign(document.createElement("meta"), { name: "theme-color" });
    meta.content =
      team === "Fire" ? "#940f0f" : team === "Storm" ? "#0072fe" : "#065f46";
    if (!meta.parentNode) document.head.appendChild(meta);
  }

  useEffect(() => {
    socket.on("connect", () => {
      const name = prompt("Bitte gib deinen Namen ein:");
      if (name) socket.emit("register", name);
    });

    const onInvalidAction = ({ msg }) => alert(msg);
    socket.on("invalidAction", onInvalidAction);

    socket.on("playersUpdate", (list) => {
      setPlayers(list);
      const myId = socket.id;
      const myself = list.find((p) => p.id === myId) || null;
      setMe(myself);
      // Tab-Titel sofort updaten
      setTabTitle({ me: myself, isMyTurn });
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
    socket.on("trickResult", ({ winner, cards, points, roundPoints }) => {
      // sicherstellen, dass die 4 Karten komplett sind
      setCurrentTrick(cards);
      setLastTrick({ winner, cards, points });
      // Live-Rundenpunkte von Server Übernehmen
      if (roundPoints) setRoundPointsLive(roundPoints);

      // nach ~2s Tisch leeren
      if (trickTimer.current) clearTimeout(trickTimer.current);
      trickTimer.current = setTimeout(() => {
        setCurrentTrick([]);
      }, 1000);
    });

    socket.on("roundEnd", ({ roundPoints, teamScores }) => {
      setScores(teamScores);
      alert(
        `Runde beendet!\nFire: ${roundPoints.Fire} | Storm: ${roundPoints.Storm}`
      );

      // Lokale UI sofort "neutral" stellen
      setRoundPointsLive(roundPoints); // zeigt finalen Stand der Runde
      setBiddingWinner(null);
      setCurrentBid(0);
      setTrumpf(null);
      setLastTrick(null);
      setCurrentTrick([]);
      setIsMyTurn(false);
      setMustBid(false);
    });

    socket.on("roundPointsUpdate", ({ roundPoints }) => {
      setRoundPointsLive(roundPoints);
    });

    socket.on("gameOver", ({ winner, teamScores }) => {
      setScores(teamScores);
      alert(
        `Spielende! Gewinner: Team ${winner}\nFire: ${teamScores.Fire}, Storm: ${teamScores.Storm}`
      );
    });
    return () => {
      socket.off();
      socket.off("invalidAction", onInvalidAction);
      if (trickTimer.current) clearTimeout(trickTimer.current);
    };
  }, [trumpf]);
  useEffect(() => {
    setTabTitle({ me, isMyTurn });
  }, [me]);

  // Wenn sich der Zug ändert, Titel aktualisieren
  useEffect(() => {
    setTabTitle({ me, isMyTurn });
  }, [isMyTurn]);

  useEffect(() => {
    if (me?.team) setThemeColor(me.team);
  }, [me?.team]);

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
          <div style={{ fontSize: 12, color: "#ffffffff" }}>(Pass)</div>
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

  // Mini-Komponente für eine Karte
  // === Karte -> Dateipfad (0-basiges Mapping wie vorher) ===
  const POS = {
    // Joker
    JOKER: [0, 0], // farbig (row1,col1)
    JOKER_BW: [6, 5], // s/w   (row7,col6)

    // ♠ Spades
    "A♠": [0, 1],
    "2♠": [0, 2],
    "3♠": [0, 3],
    "4♠": [0, 4],
    "5♠": [0, 5],
    "6♠": [0, 6],
    "7♠": [0, 7],
    "8♠": [1, 0],
    "9♠": [1, 1],
    "10♠": [1, 2],
    "J♠": [1, 3],
    "Q♠": [1, 4],
    "K♠": [1, 5],

    // ♦ Diamonds
    "A♦": [1, 6],
    "2♦": [1, 7],
    "3♦": [2, 0],
    "4♦": [2, 1],
    "5♦": [2, 2],
    "6♦": [2, 3],
    "7♦": [2, 4],
    "8♦": [2, 5],
    "9♦": [2, 6],
    "10♦": [2, 7],
    "J♦": [3, 0],
    "Q♦": [3, 1],
    "K♦": [3, 2],

    // ♣ Clubs
    "K♣": [3, 3],
    "Q♣": [3, 4],
    "J♣": [3, 5],
    "10♣": [3, 6],
    "9♣": [3, 7],
    "8♣": [4, 0],
    "7♣": [4, 1],
    "6♣": [4, 2],
    "5♣": [4, 3],
    "4♣": [4, 4],
    "3♣": [4, 5],
    "2♣": [4, 6],
    "A♣": [4, 7],

    // ♥ Hearts
    "K♥": [5, 0],
    "Q♥": [5, 1],
    "J♥": [5, 2],
    "10♥": [5, 3],
    "9♥": [5, 4],
    "8♥": [5, 5],
    "7♥": [5, 6],
    "6♥": [5, 7],
    "5♥": [6, 0],
    "4♥": [6, 1],
    "3♥": [6, 2],
    "2♥": [6, 3],
    "A♥": [6, 4],
  };

  // Dateien liegen in /public/cards_jpg_clean/ mit Namen card_rXX_cYY.jpg
  const CARD_BASE = "/cards_png_round";

  function cardPathFor(code) {
    const pos =
      POS[code] ||
      (code === "JOKER" ? [0, 0] : code === "JOKER_BW" ? [6, 5] : null);
    if (!pos) return null;
    const [r0, c0] = pos; // 0-basiert -> 1-basiert
    const r = String(r0 + 1).padStart(2, "0");
    const c = String(c0 + 1).padStart(2, "0");
    return `${CARD_BASE}/card_r${r}_c${c}.png`;
  }

  function SpriteCard({ code, size = "md", style = {} }) {
    if (!code) return null;

    const src = cardPathFor(code);
    const width =
      size === "lg"
        ? "clamp(62px, 16vw, 96px)"
        : size === "sm"
        ? "clamp(44px, 10vw, 60px)"
        : "clamp(56px, 12vw, 80px)";

    if (!src) {
      // Fallback, falls ein Code nicht gemappt ist
      return (
        <div
          style={{
            width,
            aspectRatio: "63 / 88",
            display: "grid",
            placeItems: "center",
            background: "#fff",
            color: "#000",
            borderRadius: 10,
            border: "1px solid rgba(0,0,0,.15)",
            boxShadow: "0 4px 10px rgba(0,0,0,.25)",
            fontWeight: 700,
            ...style,
          }}
        >
          {code}
        </div>
      );
    }

    return (
      <img
        src={src}
        alt={code}
        draggable="false"
        style={{
          width,
          height: "auto",
          display: "block",
          borderRadius: 10,
          border: "1px solid rgba(0,0,0,.15)",
          boxShadow: "0 4px 10px rgba(0,0,0,.25)",
          userSelect: "none",
          ...style,
        }}
      />
    );
  }

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>Shelem — Lobby &amp; Bieten</h1>

      {/* Info-Bar (Gebot + Team-Punkte) */}
      <div style={styles.infoBar}>
        <div style={styles.pill}>Gebot: {currentBid}</div>

        {/* Live-Rundenpunkte */}
        <div style={styles.pill}>Runde Fire: {roundPointsLive.Fire}</div>
        <div style={styles.pill}>Runde Storm: {roundPointsLive.Storm}</div>

        {/* Gesamtpunkte (Spielstand kumuliert) */}
        <div style={styles.pill}>Gesamt Fire: {scores.Fire}</div>
        <div style={styles.pill}>Gesamt Storm: {scores.Storm}</div>
      </div>

      {/* Popup Boden-Karten */}
      {showBottom && (
        <div style={styles.modalBackdrop}>
          <div style={styles.modal}>
            <h3 style={{ margin: 0, fontWeight: 800 }}>Boden-Karten</h3>

            {/* Karten als Bilder im neuen Layout */}
            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                justifyContent: "center",
                alignItems: "center",
                marginTop: 12,
              }}
            >
              {bottomCards.map((c, i) => (
                <SpriteCard
                  key={`${c}-${i}`}
                  code={c}
                  size="lg"
                  style={{
                    boxShadow: "0 8px 18px rgba(0,0,0,.35)",
                    border: "1px solid rgba(0,0,0,.12)",
                  }}
                />
              ))}
            </div>

            <div style={{ marginTop: 16, textAlign: "right" }}>
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
          <div style={styles.centerRow}>
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
        <div style={styles.tableWrap}>
          <div
            style={{
              ...styles.tableCenter,
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
            }}
          >
            <div
              style={{
                position: "relative",
                width: "80%",
                height: "70%",
                left: "6%",
              }}
            >
              {(() => {
                const posStyle = {
                  top: {
                    top: "20%", // etwas oberhalb der Mitte
                    left: "50%",
                    transform: "translate(-50%, -60%)",
                  },
                  right: {
                    top: "50%",
                    right: "20%", // etwas nach innen
                    transform: "translate(60%, -50%)",
                  },
                  bottom: {
                    bottom: "20%", // etwas unterhalb der Mitte
                    left: "50%",
                    transform: "translate(-50%, 60%)",
                  },
                  left: {
                    top: "50%",
                    left: "20%", // etwas nach innen
                    transform: "translate(-60%, -50%)",
                  },
                };

                const getSide = (pid) => {
                  if (!seated[0]) return null;
                  if (seated[0]?.id === pid) return "bottom";
                  if (seated[1]?.id === pid) return "right";
                  if (seated[2]?.id === pid) return "top";
                  if (seated[3]?.id === pid) return "left";
                  return null;
                };
                const bySide = {};
                currentTrick.forEach((t) => {
                  const s = getSide(t.playerId);
                  if (s && !bySide[s]) bySide[s] = t.card;
                });
                return (
                  <>
                    {bySide.top && (
                      <div
                        style={{
                          position: "absolute",
                          zIndex: 3,
                          ...posStyle.top,
                        }}
                      >
                        <SpriteCard code={bySide.top} />
                      </div>
                    )}
                    {bySide.right && (
                      <div
                        style={{
                          position: "absolute",
                          zIndex: 3,
                          ...posStyle.right,
                        }}
                      >
                        <SpriteCard code={bySide.right} />
                      </div>
                    )}
                    {bySide.bottom && (
                      <div
                        style={{
                          position: "absolute",
                          zIndex: 3,
                          ...posStyle.bottom,
                        }}
                      >
                        <SpriteCard code={bySide.bottom} />
                      </div>
                    )}
                    {bySide.left && (
                      <div
                        style={{
                          position: "absolute",
                          zIndex: 3,
                          ...posStyle.left,
                        }}
                      >
                        <SpriteCard code={bySide.left} />
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

          {/* Spieler oben/unten/links/rechts mit Prozent-Abständen,
        damit es auch auf kleinen Screens passt */}
          <div
            style={{
              position: "absolute",
              top: "-1%",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 2,
            }}
          >
            <PlayerBox p={seated[2]} />
          </div>

          <div
            style={{
              position: "absolute",
              bottom: "-1%",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 2,
            }}
          >
            <PlayerBox p={seated[0]} youLabel />
          </div>

          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "-1%",
              transform: "translateY(-50%)",
              zIndex: 2,
            }}
          >
            <PlayerBox p={seated[3]} />
          </div>

          <div
            style={{
              position: "absolute",
              top: "50%",
              right: "-1%",
              transform: "translateY(-50%)",
              zIndex: 2,
            }}
          >
            <PlayerBox p={seated[1]} />
          </div>
        </div>
      )}

      {/* Discard-Hinweis + Bestätigen */}
      {discardPhase && (
        <div style={styles.card}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <h3 style={{ margin: 0 }}>
              Wähle 4 Karten zum Abwerfen (Tippen/Clicken){" "}
            </h3>
            <div style={{ fontWeight: 800 }}>
              Ausgewählt: {selectedDiscard.length} / 4
            </div>
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
      {/* Hand */}
      {/* Hand */}
      <div style={styles.card}>
        <h2>Deine Hand:</h2>

        {/* leichtes Overlap-Layout für ein Kartenband */}
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "flex-end",
            paddingBottom: 8,
            justifyContent: "center",
          }}
        >
          {hand.map((card) => {
            const isSelected = selectedDiscard.includes(card);
            const canSelectMore = selectedDiscard.length < 4;
            const inDiscard = discardPhase;

            // Click-Verhalten:
            // - in DiscardPhase: toggleDiscard
            // - sonst (normal): playCard, wenn erlaubt
            const clickable =
              inDiscard || (biddingWinner && isMyTurn && !discardPhase);
            const onClick = () => {
              if (inDiscard) {
                if (isSelected) {
                  toggleDiscard(card); // immer abwählbar
                } else if (canSelectMore) {
                  toggleDiscard(card); // nur bis 4
                }
              } else if (biddingWinner && isMyTurn) {
                playCard(card);
              }
            };

            // Stil der Karte/Schaltfläche
            const disabled =
              // im Abwurfmodus nur sperren, wenn schon 4 gewählt und diese Karte nicht gewählt ist
              (inDiscard && !isSelected && !canSelectMore) ||
              // im Spielmodus sperren, wenn nicht am Zug
              (!inDiscard && (!biddingWinner || !isMyTurn));

            return (
              <button
                key={card}
                onClick={onClick}
                disabled={disabled}
                aria-pressed={isSelected}
                title={
                  inDiscard
                    ? isSelected
                      ? "Abwurf entfernen"
                      : "Zum Abwurf auswählen"
                    : card
                }
                style={{
                  // Button-Hülle möglichst „unsichtbar“
                  padding: 0,
                  background: "transparent",
                  border: "none",
                  position: "relative",
                  cursor: disabled ? "not-allowed" : "pointer",
                  // für kleine Overlap-Optik kann man hier z.B. marginLeft: -12 setzen,
                  // wir lassen es neutral
                }}
              >
                <div
                  style={{
                    // der Wrapper bewegt die Karte nach oben, wenn ausgewählt
                    transform: isSelected
                      ? "translateY(-10px)"
                      : "translateY(0px)",
                    transition: "transform 140ms ease",
                    // optische Auswahl-Markierung
                    outline: isSelected ? "3px solid #ef4444" : "none",
                    borderRadius: 12,
                    // leichter „Hover“ (nur wenn klickbar)
                    filter: !disabled ? "brightness(1)" : "grayscale(0.2)",
                  }}
                >
                  <SpriteCard
                    code={card}
                    size="sm"
                    // extra Schlagschatten je nach Status
                    style={{
                      boxShadow: isSelected
                        ? "0 12px 24px rgba(0,0,0,.35)"
                        : "0 6px 14px rgba(0,0,0,.25)",
                    }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>

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
