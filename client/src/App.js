import React, { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";
// CRA liest nur process.env.REACT_APP_*
const API_BASE = (
  process.env.REACT_APP_BACKEND_URL ||
  (window.location.hostname.endsWith("vercel.app")
    ? "https://shelem.onrender.com"
    : `http://${window.location.hostname}:3001`)
).trim();
const socket = io(API_BASE, { autoConnect: false });

// simple, crisp crown
const CrownIcon = ({ size = 40 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    aria-hidden
    style={{ display: "block" }}
    shapeRendering="geometricPrecision"
  >
    <defs>
      <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#FFE082" />
        <stop offset="100%" stopColor="#F59E0B" />
      </linearGradient>
    </defs>
    <path
      d="M8 50 L16 20 L28 34 L36 18 L48 34 L56 20 L64 50 Z"
      fill="url(#gold)"
      stroke="#A16207"
      strokeWidth="3"
      strokeLinejoin="round"
    />
    <rect
      x="13"
      y="45"
      width="44"
      height="15"
      rx="8"
      fill="url(#gold)"
      stroke="#A16207"
      strokeWidth="3"
    />
    {/* jewels */}
    <circle
      cx="16"
      cy="28"
      r="4"
      fill="#ef4444"
      stroke="#9f1239"
      strokeWidth="2"
    />
    <circle
      cx="36"
      cy="26"
      r="4"
      fill="#60a5fa"
      stroke="#1d4ed8"
      strokeWidth="2"
    />
    <circle
      cx="52"
      cy="28"
      r="4"
      fill="#22c55e"
      stroke="#166534"
      strokeWidth="2"
    />
  </svg>
);

// crisp suits
const SuitIcon = ({ suit = "♠", size = 32 }) => {
  const color = suit === "♦" || suit === "♥" ? "#ef4444" : "#111111";
  const stroke = suit === "♦" || suit === "♥" ? "#7f1d1d" : "#000000";
  const common = { fill: color, stroke, strokeWidth: 2 };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden
      style={{ display: "block" }}
      shapeRendering="geometricPrecision"
    >
      {suit === "♥" && (
        <>
          <path
            d="M32 54 C 28 46, 8 36, 8 22 C 8 14, 14 10, 20 10
                   C 25 10, 28 13, 32 18 C 36 13, 39 10, 44 10
                   C 50 10, 56 14, 56 22 C 56 36, 36 46, 32 54 Z"
            {...common}
          />
        </>
      )}
      {suit === "♦" && <path d="M32 6 L58 32 L32 58 L6 32 Z" {...common} />}
      {suit === "♠" && (
        <>
          <path
            d="M32 10 C 22 22, 8 28, 8 38 C 8 46, 14 52, 22 52
                   C 27 52, 31 49, 32 46 C 33 49, 37 52, 42 52
                   C 50 52, 56 46, 56 38 C 56 28, 42 22, 32 10 Z"
            {...common}
          />
          <rect x="28" y="48" width="8" height="12" rx="2" {...common} />
        </>
      )}
      {suit === "♣" && (
        <>
          <circle cx="22" cy="26" r="12" {...common} />
          <circle cx="42" cy="26" r="12" {...common} />
          <circle cx="32" cy="14" r="12" {...common} />
          <rect x="28" y="30" width="8" height="16" rx="2" {...common} />
        </>
      )}
    </svg>
  );
};

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
    justifyContent: "center",
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
  fire: { background: "#940f0fff", border: "2px solid #75ca7eff" },
  storm: { background: "#0072feff", border: "2px solid #75ca7eff" },
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
    position: "relative",
    borderRadius: "50%",
    width: "clamp(44px, 10vw, 80px)", // vorher: 62/16vw/104
    height: "clamp(44px, 10vw, 80px)",
    padding: 6, // vorher: 8
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 3, // vorher: 4
    textAlign: "center",
    lineHeight: 1.05,
    overflow: "visible",
    boxShadow: "0 4px 10px rgba(0,0,0,.2)",
    fontSize: "clamp(9px, 2.1vw, 11px)", // minimal kleiner
  },

  // Zug-Highlight bleibt als innerer Ring
  turn: { boxShadow: "inset 0 0 0 8px rgba(251, 240, 36, 1)" },

  // optional: größere Touch-Ziele für Buttons
  btn: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid #e5e7eb",
    background: "#e5e7eb",
    cursor: "pointer",
    touchAction: "manipulation",
    justifyContent: "center",
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
  // HUD: liegt als Grid über dem Tisch, fängt keine Klicks ab
  hudGrid: {
    position: "absolute",
    inset: 8, // kleiner Innenabstand
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    gridTemplateRows: "1fr auto 1fr",
    pointerEvents: "none", // Klicks gehen „durch“
    zIndex: 4,
  },
  hudPill: {
    background: "rgba(0,0,0,.25)",
    border: "1px solid rgba(255,255,255,.18)",
    padding: "6px 10px",
    borderRadius: 10,
    fontWeight: 800,
    fontSize: 13,
    color: "#fff",
    whiteSpace: "nowrap",
    boxShadow: "0 2px 6px rgba(0,0,0,.15)",
  },
  // Positionierungs-Helfer (im Grid platziert)
  hudTL: {
    gridColumn: "1",
    gridRow: "1",
    justifySelf: "start",
    alignSelf: "start",
  },
  hudTR: {
    gridColumn: "3",
    gridRow: "1",
    justifySelf: "end",
    alignSelf: "start",
  },
  hudBL: {
    gridColumn: "1",
    gridRow: "3",
    justifySelf: "start",
    alignSelf: "end",
  },
  hudBR: {
    gridColumn: "3",
    gridRow: "3",
    justifySelf: "end",
    alignSelf: "end",
  },
  hudLM: {
    gridColumn: "1",
    gridRow: "2",
    justifySelf: "start",
    alignSelf: "center",
  },
  hudRM: {
    gridColumn: "3",
    gridRow: "2",
    justifySelf: "end",
    alignSelf: "center",
  },
  hudButtonWrap: {
    gridColumn: "3",
    gridRow: "3",
    justifySelf: "end",
    alignSelf: "end",
    pointerEvents: "auto",
  },
  hudButton: {
    padding: "10px 10px",
    borderRadius: 20,
    border: "0px solid #dbeafe",
    background: "#dbeafe",
    fontWeight: 700,
    cursor: "pointer",
  },
  hudLTop: {
    gridColumn: "1",
    gridRow: "2",
    justifySelf: "start",
    alignSelf: "start",
    marginLeft: "4px",
    marginTop: "8px",
  },
  hudRTop: {
    gridColumn: "3",
    gridRow: "2",
    justifySelf: "end",
    alignSelf: "start",
    marginRight: "4px",
    marginTop: "8px",
  },
  hudRoundFire: {
    gridColumn: "1",
    gridRow: "2",
    justifySelf: "start",
    alignSelf: "center",
  },
  hudRoundStorm: {
    gridColumn: "3",
    gridRow: "2",
    justifySelf: "end",
    alignSelf: "center",
  },
};
// --- Simple Auth-Gate (Login / Register) ---
function AuthGate({ onAuthed }) {
  const [mode, setMode] = React.useState("login"); // 'login' | 'register'
  const [form, setForm] = React.useState({
    name: "",
    usernameOrEmail: "",
    username: "",
    email: "",
    password: "",
    phone: "",
    avatarUrl: "",
  });
  // Gleiche Basis wie oben, damit Login/Register in Dev & Prod funktioniert
  const host = API_BASE;

  const saveAuth = ({ token, profile }) => {
    localStorage.setItem("shelem_token", token);
    localStorage.setItem("shelem_profile", JSON.stringify(profile));
    onAuthed({ token, profile });
  };

  const login = async () => {
    const res = await fetch(`${host}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usernameOrEmail: form.usernameOrEmail,
        password: form.password,
      }),
    });
    const data = await res.json();
    if (!res.ok) return alert(data?.error || "Login fehlgeschlagen");
    saveAuth(data);
  };

  const register = async () => {
    const body = {
      name: form.name,
      username: form.username,
      email: form.email,
      password: form.password,
      phone: form.phone || undefined,
      avatarUrl: form.avatarUrl || undefined,
    };
    const res = await fetch(`${host}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return alert(data?.error || "Registrierung fehlgeschlagen");
    saveAuth(data); // Auto-Login
  };

  return (
    <div style={{ ...styles.card, maxWidth: 420, margin: "40px auto" }}>
      <h3 style={{ marginTop: 0, textAlign: "center" }}>
        {mode === "login" ? "ورود" : "ثبت نام"}
      </h3>
      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        <button
          style={styles.btn}
          onClick={() => setMode("login")}
          disabled={mode === "login"}
        >
          ورود
        </button>
        <button
          style={styles.btn}
          onClick={() => setMode("register")}
          disabled={mode === "register"}
        >
          ثبت نام
        </button>
      </div>
      {mode === "login" ? (
        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          <input
            placeholder="نام مستعار یا آدرس ایمیل"
            value={form.usernameOrEmail}
            onChange={(e) =>
              setForm((f) => ({ ...f, usernameOrEmail: e.target.value }))
            }
          />
          <input
            placeholder="رمز عبور"
            type="password"
            value={form.password}
            onChange={(e) =>
              setForm((f) => ({ ...f, password: e.target.value }))
            }
          />
          <button
            style={{ ...styles.btn, background: "#86efac", fontWeight: 800 }}
            onClick={login}
          >
            ورود
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          <input
            placeholder="نام"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <input
            placeholder="نام مستعار در بازی"
            value={form.username}
            onChange={(e) =>
              setForm((f) => ({ ...f, username: e.target.value }))
            }
          />
          <input
            placeholder="ایمیل"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
          <input
            placeholder="رمز عبور (حداقل 6 کاراکتر)"
            type="password"
            value={form.password}
            onChange={(e) =>
              setForm((f) => ({ ...f, password: e.target.value }))
            }
          />
          <input
            placeholder="موبایل (اختیاری)"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
          <input
            placeholder="آواتار (اختیاری)"
            value={form.avatarUrl}
            onChange={(e) =>
              setForm((f) => ({ ...f, avatarUrl: e.target.value }))
            }
          />
          <button
            style={{ ...styles.btn, background: "#86efac", fontWeight: 800 }}
            onClick={register}
          >
            ثبت نام
          </button>
        </div>
      )}
    </div>
  );
}

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
  const [showStats, setShowStats] = useState(false);
  const [showRecap, setShowRecap] = useState(false);
  const [variantModal, setVariantModal] = useState({
    open: false,
    trigger: null,
    options: [],
  });

  const anyModalOpen =
    showStats || showRecap || showBottom || variantModal.open;
  const [recap, setRecap] = useState(null);
  const [roundsHistory, setRoundsHistory] = useState([]);
  const [expandedRounds, setExpandedRounds] = useState({}); // round -> true/false
  const [myBid, setMyBid] = useState(100);
  const trickClearTimer = useRef(null);
  const nextTrickFresh = useRef(false);
  const [paused, setPaused] = useState(false);
  const [biddingActive, setBiddingActive] = useState(false);
  const CARD_RADIUS = 10; // Standard (Hand, Boden etc.)
  const CARD_RADIUS_PLAYED = 6; // Mitte + Stichliste (etwas eckiger)
  const [serverFlags, setServerFlags] = useState({
    tricksPlayed: 0,
    winnerId: null,
  });

  // --- Auth State ---
  const [auth, setAuth] = useState({
    token: localStorage.getItem("shelem_token"),
    profile: (() => {
      try {
        return JSON.parse(localStorage.getItem("shelem_profile") || "null");
      } catch {
        return null;
      }
    })(),
  });

  const handleLogout = () => {
    // Token/Profile aus dem Storage entfernen
    localStorage.removeItem("shelem_token");
    localStorage.removeItem("shelem_profile");

    // Auth-State leeren → zeigt wieder <AuthGate />
    setAuth({ token: null, profile: null });

    // Socket sauber trennen
    try {
      socket.disconnect();
    } catch (e) {
      console.warn("Socket disconnect error:", e);
    }
  };
  // Abgeleitete Flags
  const seatedCount = (players || []).filter((p) => p?.seatPosition).length;
  const seatsFullClient = seatedCount === 4;

  // Runde noch nicht gestartet = keine Hand verteilt & keine Auktion/Discard aktiv
  const canStart =
    seatsFullClient && !biddingActive && !hand.length && !discardPhase;
  // nur der erste (players[0]) darf "Random" sehen/auslösen
  const isFirstPlayer = !!me && players[0] && players[0].id === me.id;

  const anyChosen = players.some(
    (p) => p.team === "Fire" || p.team === "Storm"
  );
  const canStartRandom = !randomTeams && !anyChosen && isFirstPlayer;

  // responsive Kartengröße für den Tisch (63:88 Verhältnis)
  const trickAreaRef = useRef(null);
  const [cardSize, setCardSize] = useState({ w: 72, h: 100 });

  useEffect(() => {
    const el = trickAreaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const base = Math.min(width, height); // an Tisch-Mitte ausrichten
      const w = Math.round(Math.max(48, Math.min(110, base * 0.22))); // clamp
      const h = Math.round(w * (88 / 63));
      setCardSize({ w, h });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Varianten wie am Server
  const VARIANTS = { UNDECIDED: "UNDECIDED", NORMAL: "NORMAL", FLIP: "FLIP" };

  const [roundVariant, setRoundVariant] = useState(VARIANTS.UNDECIDED);

  const judgeId =
    (trumpfSetter && trumpfSetter.id) ||
    (biddingWinner && biddingWinner.winner && biddingWinner.winner.id) ||
    null;

  // Reihenfolge der Suit-Zeilen & Rangfolge innerhalb einer Suit
  const SUIT_ROWS = ["♠", "♥", "♣", "♦"];
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

  function setTabTitle({ me, isMyTurn }) {
    if (!me) {
      document.title = "Shelem — verbunden…";
      return;
    }
    const team = me.team ? `Team ${me.team}` : "ohne Team";
    const turn = isMyTurn ? " ⏳" : "";
    const label = me.username || me.name;
    document.title = `${turn} ${label} — ${team}`;
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
      // Token wurde vor connect gesetzt (socket.auth)
      const profRaw = localStorage.getItem("shelem_profile");
      const prof = profRaw ? JSON.parse(profRaw) : null;
      if (!prof) {
        alert("Nicht eingeloggt.");
        return;
      }
      // stabile ID & Name kommen vom Profil (server-side verifiziert)
      socket.emit("register", { clientId: prof.id, name: prof.name });
      socket.emit("getRoundsHistory");
      socket.emit("requestState");
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

    // feste Reihenfolge: ♠, ♥, ♣, ♦
    const sortHand = (cards) => {
      const suitOrder = ["♠", "♥", "♣", "♦"];
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
      ]; // wie bisher
      return [...cards].sort((a, b) => {
        const [ra, sa] = [a.slice(0, -1), a.slice(-1)];
        const [rb, sb] = [b.slice(0, -1), b.slice(-1)];
        if (suitOrder.indexOf(sa) !== suitOrder.indexOf(sb)) {
          return suitOrder.indexOf(sa) - suitOrder.indexOf(sb);
        }
        return rankOrder.indexOf(ra) - rankOrder.indexOf(rb);
      });
    };

    socket.on("askVariant", ({ options }) => {
      setVariantModal({ open: true, options: options || ["NORMAL", "FLIP"] });
    });

    socket.on("variantChosen", ({ variant, trumpf: t }) => {
      setVariantModal({ open: false, options: [] });
      setRoundVariant(variant); // <— Variante merken
      if (variant === VARIANTS.NORMAL && t) {
        setTrumpf(t);
      } else if (variant === VARIANTS.FLIP) {
        setTrumpf(null); // <— bei Flip KEIN Trumpf-Symbol
      }
      setHand((h) => sortHand(h)); // Hand neu sortieren
    });

    socket.on("hand", (cards) => setHand(sortHand(cards)));
    socket.on("bottomCards", (cards) => console.log("Boden:", cards));

    socket.on("yourTurn", (data) => {
      if (!biddingWinner) setBiddingActive(true);
      setIsMyTurn(true);
      setCurrentBid(data.currentBid);
      setMustBid(!!data.mustBid);
      setCurrentPlayer(data.currentPlayer || null);
      // Startwert für mein eigenes Gebot setzen
      setMyBid(Math.max(data.currentBid + 5, 100));
    });

    socket.on("turnUpdate", ({ currentPlayer }) => {
      // falls zu Beginn der Auktion nur turnUpdate kommt
      if (!biddingWinner) setBiddingActive(true);
      setCurrentPlayer(currentPlayer);
      setIsMyTurn(!!currentPlayer && currentPlayer.id === socket.id);
    });

    socket.on("biddingResult", ({ winner, bid }) => {
      // Gebot sofort überall sichtbar machen (HUD "هدف", etc.)
      setCurrentBid(bid);

      // Gewinner/Status der Auktion setzen
      setBiddingWinner({ winner, bid });
      setIsMyTurn(false);
      setBiddingActive(false);
    });

    socket.on("showBottomCards", ({ bottomCards }) => {
      setBottomCards(bottomCards);
      setShowBottom(true);
    });

    socket.on("discardPhase", ({ hand }) => {
      setHand(sortHand(hand));
      setDiscardPhase(true);
      setSelectedDiscard([]);
    });

    // Discard beendet

    socket.on("discardDone", () => {
      setDiscardPhase(false);
      setSelectedDiscard([]);
      setHand((h) => sortHand(h));
    });

    socket.on("trumpChosen", ({ trumpf, winner }) => {
      setTrumpf(trumpf);
      setTrumpfSetter(winner);
      setRoundVariant(VARIANTS.NORMAL);
      setHand((h) => sortHand(h));
    });
    socket.on("cardPlayed", ({ playerId, card }) => {
      setCurrentTrick((prev) => {
        // Falls der vorige Stich noch angezeigt wurde ODER wir explizit wissen,
        // dass dies die erste Karte des nächsten Stiches ist → frisch beginnen
        if (nextTrickFresh.current || prev.length >= 4) {
          nextTrickFresh.current = false;
          return [{ playerId, card }];
        }
        // normal anhängen
        return [...prev, { playerId, card }];
      });
    });
    socket.on("trickResult", ({ winner, cards, points, roundPoints }) => {
      // 4 Karten vom beendeten Stich kurz zeigen
      setCurrentTrick(cards);
      setLastTrick({ winner, cards, points });

      if (roundPoints) setRoundPointsLive(roundPoints);

      // vorhandenen Timer beenden
      if (trickClearTimer.current) clearTimeout(trickClearTimer.current);

      // Tisch automatisch leeren; parallel markieren wir,
      // dass die nächste eingehende Karte ein NEUER Stich ist
      nextTrickFresh.current = true;
      trickClearTimer.current = setTimeout(() => {
        setCurrentTrick([]);
      }, 800); // 0.8s Anzeige – nach Wunsch anpassen
    });

    socket.on("roundsHistoryUpdate", ({ roundsHistory }) => {
      setRoundsHistory(roundsHistory || []);
      const last =
        roundsHistory && roundsHistory.length
          ? roundsHistory[roundsHistory.length - 1].teamScoresAfter
          : null;
      if (last) setScores(last);
    });

    socket.on(
      "roundEnd",
      ({
        roundPoints,
        teamScores,
        roundWinnerTeam, // Sieger nach Stichpunkten
        ruleApplied, // "doublePositive" | "doubleNegative" | "normal"
        deltaApplied, // { Fire: +/-X, Storm: +/-Y }  <-- NEU nutzen!
        tricks,
        bottomCards,
        discarded,
        bidderName,
        bidderTeam,
        bid,
        trumpf,
      }) => {
        // Sicher kopieren, damit spätere Updates (neue Runde) die Anzeige nicht beeinflussen
        const rp = {
          Fire: roundPoints?.Fire ?? 0,
          Storm: roundPoints?.Storm ?? 0,
        };
        const after = {
          Fire: teamScores?.Fire ?? 0,
          Storm: teamScores?.Storm ?? 0,
        };
        const delta = {
          Fire: deltaApplied?.Fire ?? 0,
          Storm: deltaApplied?.Storm ?? 0,
        };

        // Anzeige-Helfer
        const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);
        const ruleTxt =
          ruleApplied === "doublePositive"
            ? "Doppel-Positiv"
            : ruleApplied === "doubleNegative"
            ? "Doppel-Negativ"
            : "Normal";

        // Sieger nach Abrechnung (wer hat netto mehr bekommen?)
        const winnerByDelta =
          delta.Fire === delta.Storm
            ? null
            : delta.Fire > delta.Storm
            ? "Fire"
            : "Storm";

        // Optional auch der Sieger nach Stichpunkten (wie bisher)
        const winnerByTricks =
          roundWinnerTeam ??
          (rp.Fire === rp.Storm ? null : rp.Fire > rp.Storm ? "Fire" : "Storm");

        // States aktualisieren (danach kann die neue Runde direkt 0:0 senden)
        setScores(after);
        setRoundPointsLive(rp);
        setBiddingWinner(null);
        setCurrentBid(0);
        setTrumpf(null);
        setTrumpfSetter(null);
        setLastTrick(null);
        setCurrentTrick([]);
        setIsMyTurn(false);
        setMustBid(false);
        setRoundVariant(VARIANTS.UNDECIDED);
        // Nur fertige Runden-Ansicht (Stiche, Boden, Abwurf)

        setRecap({
          tricks: tricks || [],
          bottomCards: bottomCards || [],
          discarded: discarded || [],
          bidderName: bidderName || "-",
          bidderTeam: bidderTeam || "?",
          bid: Number(bid || 0),
          trumpf: trumpf || null,
          ruleApplied: ruleApplied || "normal",
          roundPoints: {
            Fire: roundPoints?.Fire ?? 0,
            Storm: roundPoints?.Storm ?? 0,
          },
          teamScoresAfter: {
            Fire: teamScores?.Fire ?? 0,
            Storm: teamScores?.Storm ?? 0,
          },
        });
        setShowRecap(true);
      }
    );

    socket.on("roundPointsUpdate", ({ roundPoints }) => {
      setRoundPointsLive(roundPoints);
    });
    // Das Spiel pausieren/aktivieren
    socket.on("gamePaused", () => setPaused(true));
    socket.on("gameResumed", () => setPaused(false));

    socket.on("stateSync", (s) => {
      if (s?.teamScores) setScores(s.teamScores);
      if (s?.roundPoints) setRoundPointsLive(s.roundPoints);
      if (Array.isArray(s?.players)) setPlayers(s.players);
      if (s?.trumpf) setTrumpf(s.trumpf);
      if (s?.roundVariant) setRoundVariant(s.roundVariant); // <— vom Server übernehmen
      if (typeof s?.biddingActive === "boolean")
        setBiddingActive(s.biddingActive);
      if (typeof s?.tricksPlayed === "number" || s?.winnerPlayerId != null) {
        setServerFlags({
          tricksPlayed: s?.tricksPlayed || 0,
          winnerId: s?.winnerPlayerId || null,
        });
      }
    });

    socket.on("gameOver", ({ winner, teamScores }) => {
      setScores(teamScores);
      alert(
        `Spielende! Gewinner: Team ${winner}\nFire: ${teamScores.Fire}, Storm: ${teamScores.Storm}`
      );
    });
    socket.on("gameReset", (s) => {
      // Zustand aus dem Snapshot
      setPlayers(s.players || []);
      setScores(s.teamScores || { Fire: 0, Storm: 0 });
      setRoundPointsLive(s.roundPoints || { Fire: 0, Storm: 0 });
      setCurrentBid(s.currentBid || 0);
      setTrumpf(s.trumpf || null);
      setRandomTeams(!!s.randomTeams);
      setCurrentPlayer(s.currentPlayer || null);

      //  Variante aus dem Snapshot übernehmen/auf Startwert setzen
      setRoundVariant(s?.roundVariant || VARIANTS.UNDECIDED);

      // Server-Flags auf Reset-Zustand setzen
      setServerFlags({
        tricksPlayed: s?.tricksPlayed || 0,
        winnerId: s?.winnerPlayerId || null,
      });

      // WICHTIG: Auktion/“Runde läuft”-Flag zurücksetzen, sonst bleibt die UI ‘aktiv’
      if (typeof s.biddingActive === "boolean")
        setBiddingActive(s.biddingActive);
      else setBiddingActive(false);

      // rein UI-lokale Felder leeren
      setHand([]);
      setIsMyTurn(false);
      setBiddingWinner(null);
      setDiscardPhase(false);
      setSelectedDiscard([]);
      setShowBottom(false);
      setBottomCards([]);
      setMustBid(false);
      setLastTrick(0);
      setCurrentTrick([]); // falls du diesen State hast
      setTrumpfSetter(null); // falls vorhanden
      // sicherheitshalber Variant-Modal schließen
      setVariantModal({ open: false, options: [] });
    });

    return () => {
      socket.off();
      socket.off("invalidAction", onInvalidAction);
      if (trickTimer.current) clearTimeout(trickTimer.current);
    };
  }, []); // Events nur einmal registrieren

  // Wenn Auth vorhanden → Socket mit Token verbinden
  useEffect(() => {
    if (!auth?.token) return;

    // Token zuerst setzen
    socket.auth = { token: auth.token };

    // sauberen Connect erzwingen
    socket.disconnect();
    socket.connect();

    // Registrierung nur, wenn verbunden
    socket.once("connect", () => {
      try {
        const profRaw = localStorage.getItem("shelem_profile");
        const prof = profRaw ? JSON.parse(profRaw) : null;
        if (prof?.id && prof?.name) {
          socket.emit("register", { clientId: prof.id, name: prof.name });
          socket.emit("getRoundsHistory");
          socket.emit("requestState");
        }
      } catch {}
    });
  }, [auth?.token]);

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
      players[myIndex], // unten (Sitz 1, falls ich dort sitze)
      players[(myIndex + 1) % 4], // rechts
      players[(myIndex + 2) % 4], // oben
      players[(myIndex + 3) % 4], // links
    ];
  };

  const seated = getSeatingOrder();

  // --- PlayerBox (zeigt Krone oben außen, Trumpf unten außen oder "Flip"-Badge)
  const PlayerBox = ({ p, youLabel }) => {
    if (!p) return <div />;

    // ACHTUNG: diese Props/States müssen in App() existieren:
    // - styles.playerBoxBase (mit overflow:"visible")
    // - currentPlayer (für Zug-Highlight)
    // - judgeId (id des Richters; aus trumpfSetter oder biddingWinner)
    // - trumpf (z.B. "♠" | "♥" | "♣" | "♦" oder null)
    // - roundVariant (VARIANTS.NORMAL | VARIANTS.FLIP | VARIANTS.UNDECIDED)

    const boxStyle = {
      ...styles.playerBoxBase,
      ...(p.team === "Fire" ? styles.fire : styles.storm),
      ...(currentPlayer && currentPlayer.id === p.id ? styles.turn : {}),
    };

    const isJudge = judgeId === p.id;

    return (
      <div style={boxStyle}>
        {/* 👑 oben außen */}
        {isJudge && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: "50%",
              transform: "translate(-50%, -82%)",
              pointerEvents: "none",
              zIndex: 40,
              filter: "drop-shadow(0 2px 6px rgba(0,0,0,.35))",
            }}
            aria-hidden
          >
            <CrownIcon size={44} />
          </div>
        )}

        {/* Trumpf unten außen NUR bei NORMAL + gesetztem trumpf */}
        {isJudge && roundVariant === VARIANTS.NORMAL && trumpf && (
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: "50%",
              transform: "translate(-50%, 66%)",
              pointerEvents: "none",
              zIndex: 40,
              filter: "drop-shadow(0 2px 6px rgba(0,0,0,.35))",
            }}
            aria-hidden
            title={`Trumpf ${trumpf}`}
          >
            <SuitIcon suit={trumpf} size={36} />
          </div>
        )}

        {/* Bei FLIP: Badge unten außen */}
        {isJudge && roundVariant === VARIANTS.FLIP && (
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: "50%",
              transform: "translate(-50%, 66%)",
              pointerEvents: "none",
              zIndex: 40,
              background: "#111",
              color: "#fff",
              padding: "4px 10px",
              borderRadius: 999,
              fontWeight: 900,
              fontSize: 12,
              boxShadow: "0 2px 6px rgba(0,0,0,.25)",
              border: "1px solid rgba(255,255,255,.25)",
            }}
            aria-hidden
            title="Flip"
          >
            نرس
          </div>
        )}

        {/* Name + (Du) */}
        <div style={{ fontWeight: 900, fontSize: 12 }}>
          {p.username || p.name}
        </div>

        {/* Bietindikatoren nur während Auktion */}
        {biddingActive &&
          !biddingWinner &&
          (p.passed ? (
            <div
              style={{
                position: "absolute",
                top: "-10px",
                right: "-10px",
                background: "#ef4444",
                color: "#fff",
                fontWeight: 900,
                fontSize: 11,
                padding: "2px 6px",
                borderRadius: 8,
                boxShadow: "0 2px 6px rgba(0,0,0,.25)",
              }}
              title="Pass"
            >
              پاس
            </div>
          ) : p.lastBid ? (
            <div
              style={{
                position: "absolute",
                top: "-10px",
                right: "-10px",
                background: "#22c55e",
                color: "#052e12",
                fontWeight: 900,
                fontSize: 11,
                padding: "2px 6px",
                borderRadius: 8,
                boxShadow: "0 2px 6px rgba(0,0,0,.25)",
              }}
              title="Letztes Gebot"
            >
              {p.lastBid}
            </div>
          ) : null)}
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

  // Dateien liegen in /public/cards_png_clean/ mit Namen card_rXX_cYY.png
  const CARD_BASE = "/cards_jpg_clean";

  function cardPathFor(code) {
    const pos =
      POS[code] ||
      (code === "JOKER" ? [0, 0] : code === "JOKER_BW" ? [6, 5] : null);
    if (!pos) return null;
    const [r0, c0] = pos; // 0-basiert -> 1-basiert
    const r = String(r0 + 1).padStart(2, "0");
    const c = String(c0 + 1).padStart(2, "0");
    return `${CARD_BASE}/card_r${r}_c${c}.jpg`;
  }

  // Fallback: Punktewert einer Karte (wie Server)
  function cardPointsClient(card) {
    const rank = card.slice(0, -1);
    if (rank === "A") return 10;
    if (rank === "10") return 10;
    if (rank === "5") return 5;
    return 0;
  }

  function TrickRow({ t }) {
    const win = t.winnerTeam; // "Fire" | "Storm" | undefined
    const isFire = win === "Fire";
    const isStorm = win === "Storm";

    // Anspiel-Farbe (falls sie mal fehlt, nimm die erste Karte)
    const leadSuit =
      t.leadSuit || (t.plays && t.plays[0] ? t.plays[0].card.slice(-1) : "");

    // Punkte (falls t.points fehlt, lokal berechnen)
    const computedPoints =
      5 + (t.plays || []).reduce((sum, p) => sum + cardPointsClient(p.card), 0);
    const pts = Number.isFinite(t.points) ? t.points : computedPoints;

    const rowStyle = {
      display: "grid",
      gridTemplateColumns: "auto 1fr auto",
      alignItems: "center",
      gap: 8,
      padding: "8px 10px",
      background: isFire ? "#ffe4e6" : isStorm ? "#eff6ff" : "#ffffff",
      borderRadius: 10,
      border: isFire
        ? "1px solid #fecaca"
        : isStorm
        ? "1px solid #bfdbfe"
        : "1px solid #e5e7eb",
    };

    const leftStyle = {
      display: "flex",
      alignItems: "center",
      gap: 8,
      fontWeight: 800,
      fontSize: 12,
      color: "#000000",
      whiteSpace: "nowrap",
    };

    const suitBadge = {
      padding: "2px 8px",
      borderRadius: 9999,
      fontWeight: 800,
      fontSize: 12,
      background: "#e5e7eb",
      color: "#111",
      lineHeight: 1,
    };

    const pointsBadge = {
      padding: "4px 10px",
      borderRadius: 9999,
      fontWeight: 900,
      fontSize: 12,
      textAlign: "center",
      minWidth: 56,
      whiteSpace: "nowrap",
      background: isFire ? "#ef4444" : isStorm ? "#3b82f6" : "#111827",
      color: "#fff",
    };

    return (
      <div style={rowStyle}>
        {/* links: Stich + angespielte Farbe */}
        <div style={leftStyle}>
          <span>{t.no} دست</span>
          <span style={suitBadge}>{leadSuit || "?"}</span>
        </div>

        {/* mitte: ausgespielte Karten (Reihenfolge) */}
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "flex-start",
          }}
        >
          {(t.plays || []).map((p, i) => (
            <div key={i} title={`#${i + 1} · ${p.name} (${p.team})`}>
              <SpriteCard
                code={p.card}
                size="xxs"
                radius={CARD_RADIUS_PLAYED}
              />
            </div>
          ))}
        </div>

        {/* rechts: Punkte deutlich sichtbar */}
        <div style={pointsBadge}>+{pts}</div>
      </div>
    );
  }

  function SpriteCard({ code, size = "md", style = {}, radius = CARD_RADIUS }) {
    if (!code) return null;

    const src = cardPathFor(code);
    const width =
      size === "lg"
        ? "clamp(62px, 16vw, 96px)"
        : size === "md"
        ? "clamp(56px, 12vw, 80px)"
        : size === "sm"
        ? "clamp(44px, 10vw, 60px)"
        : size === "xs"
        ? "clamp(32px, 7vw, 40px)" // deutlich kleiner
        : /* xxs */ "clamp(26px, 6vw, 32px)";
    if (!src) {
      // Fallback, falls ein Code nicht gemappt ist
      return (
        <img
          src={src}
          alt={code}
          draggable="false"
          style={{
            width,
            height: "auto",
            display: "block",
            borderRadius: radius,
            border: "1px solid rgba(0,0,0,.15)",
            boxShadow: "0 4px 10px rgba(0,0,0,.25)",
            userSelect: "none",
            ...style,
          }}
        />
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
  // === Sitzplatzauswahl vorbereiten ===
  // sichtbar bis das Spiel wirklich startet (keine Hand, keine Auktion, keine Discard-Phase)
  const roundActiveServer =
    biddingActive || serverFlags.tricksPlayed > 0 || !!serverFlags.winnerId;
  const roundNotStarted = !discardPhase && !hand.length && !roundActiveServer;

  const seatSelect = roundNotStarted
    ? (() => {
        const seatMap = { 1: null, 2: null, 3: null, 4: null };
        players.forEach((p) => {
          if (p.seatPosition) seatMap[p.seatPosition] = p;
        });
        const seatsAllFilled =
          !!seatMap[1] && !!seatMap[2] && !!seatMap[3] && !!seatMap[4];
        const mySeat = me?.seatPosition || null;

        const seatsAllEmpty =
          !seatMap[1] && !seatMap[2] && !seatMap[3] && !seatMap[4];
        // erster Spieler in der Liste?
        const isFirstPlayer = players[0]?.id === me?.id;
        const SEAT_TEAMS = { 1: "آتش", 2: "طوفان", 3: "آتش", 4: "طوفان" };
        const seatLabel = (i) => `(${i}) تیم ${SEAT_TEAMS[i]}`;
        const seatStyle = (i) => ({
          flex: "1 1 220px",
          minWidth: 220,
          borderRadius: 12,
          padding: 12,
          border: "2px solid #e5e7eb",
          background: SEAT_TEAMS[i] === "آتش" ? "#ffe4e6" : "#eff6ff",
        });

        const seatButtonStyle = (disabled) => ({
          ...styles.btn,
          background: disabled ? "#e5e7eb" : "#dcfce7",
          cursor: disabled ? "not-allowed" : "pointer",
          width: "100%",
          fontWeight: 800,
        });

        return (
          <div style={styles.card}>
            <h3 style={{ margin: 0 }}>انتخاب تیم</h3>

            {/* Random nur für ersten Spieler und nur wenn alle Plätze leer */}
            {isFirstPlayer && seatsAllEmpty && (
              <div style={{ marginTop: 8, textAlign: "center" }}>
                <button
                  style={{ ...styles.btn, ...styles.btnGreen }}
                  onClick={() => socket.emit("chooseTeam", "Random")}
                  title="Zufällig und balanciert auf freie Plätze verteilen"
                >
                  انتخاب تیم تصادفی
                </button>
              </div>
            )}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
                marginTop: 12,
              }}
            >
              {[1, 2, 3, 4].map((i) => {
                const occupant = seatMap[i];
                const mine = mySeat === i;
                const occupiedByOther = occupant && occupant.id !== me?.id;
                return (
                  <div key={i} style={seatStyle(i)}>
                    <div style={{ fontWeight: 900, fontSize: 14 }}>
                      {seatLabel(i)}
                    </div>
                    <div
                      style={{
                        marginTop: 6,
                        padding: "10px 12px",
                        borderRadius: 10,
                        background: "#fff",
                        border: "1px solid #e5e7eb",
                        minHeight: 42,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 800,
                      }}
                    >
                      {occupant ? occupant.name : "— آزاد —"}
                    </div>

                    <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                      {/* Hauptbutton: auf freien Platz setzen / wechseln */}
                      <button
                        style={seatButtonStyle(occupiedByOther)}
                        disabled={occupiedByOther}
                        onClick={() => socket.emit("chooseSeat", { seat: i })}
                        title={
                          occupiedByOther
                            ? "Platz ist belegt."
                            : "اینجا بنشین / تغییر مکان"
                        }
                      >
                        {occupiedByOther
                          ? "Belegt"
                          : mine
                          ? "اینجا نشسته ام"
                          : "اینجا بنشین"}
                      </button>

                      {/* Zusatz: nur wenn du hier sitzt → Platz freigeben */}
                      {mine && (
                        <button
                          style={{
                            ...styles.btn,
                            background: "#fde68a",
                            fontWeight: 800,
                          }}
                          onClick={() => socket.emit("leaveSeat")}
                          title="Diesen Platz freigeben"
                        >
                          آزاد کردن مکان
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Manuelles Starten: sichtbar für alle, sobald 4/4 sitzen */}
            {seatsAllFilled && (
              <div style={{ marginTop: 12 }}>
                <button
                  style={{
                    ...styles.btn,
                    background: "#86efac",
                    fontWeight: 900,
                  }}
                  onClick={() => socket.emit("startGame")}
                  title="Spiel starten"
                >
                  شروع بازی
                </button>

                <div style={{ marginTop: 6, fontSize: 12, color: "#111" }}>
                  ناخدا⚓ : بادبان ها را بکشید
                </div>
              </div>
            )}
          </div>
        );
      })()
    : null;

  return (
    <div style={styles.page}>
      {!auth?.token ? (
        <AuthGate onAuthed={setAuth} />
      ) : (
        <>
          {/* 🔽 NEUE TOP-BAR MIT LOGOUT OBEN RECHTS */}
          <div
            style={{
              maxWidth: "min(92vw, 900px)",
              margin: "0 auto 8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 0,
            }}
          >
            <div style={{ fontSize: 14 }}>
              👤 {auth.profile?.username || auth.profile?.name || "?"}
            </div>
            <button
              onClick={handleLogout}
              title="خروج از حساب"
              style={{
                ...styles.btn,
                padding: "6px 10px",
                borderRadius: 999,
                fontWeight: 800,
              }}
            >
              ⎋ خروج
            </button>
          </div>
          ){/* Popup Boden-Karten */}
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
                    برگ های زمین را دیدم
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* Recap der beendeten Runde */}
          {showRecap && recap && (
            <div style={styles.modalBackdrop}>
              <div
                style={{
                  ...styles.modal,
                  width: 820,
                  maxWidth: "95vw",
                  maxHeight: "85vh",
                  overflow: "auto",
                }}
              >
                <div style={{ textAlign: "right", marginTop: 16 }}>
                  <button
                    style={styles.btn}
                    onClick={() => setShowRecap(false)}
                  >
                    بستن
                  </button>
                </div>
                <h3 style={{ margin: 0, fontWeight: 800, textAlign: "center" }}>
                  Runden-Recap
                </h3>
                {/* META wie in Statistik */}
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontWeight: 800 }}>
                    {`Runde ${roundsHistory.length} `}
                    {recap.trumpf ? `· Trumpf: ${recap.trumpf}` : ""}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      flexWrap: "wrap",
                      alignItems: "center",
                      marginTop: 6,
                    }}
                  >
                    <span className="pill" style={styles.pill}>
                      حاکم: {recap.bidderName} ({recap.bidderTeam})
                    </span>
                    <span className="pill" style={styles.pill}>
                      هدف {recap.bid}
                    </span>

                    <span className="pill" style={styles.pill}>
                      امتیاز این دست آتش: {recap.roundPoints.Fire}
                    </span>
                    <span className="pill" style={styles.pill}>
                      امتیاز این دست طوفان: {recap.roundPoints.Storm}
                    </span>

                    {recap.ruleApplied === "doublePositive" && (
                      <span className="pill" style={styles.pill}>
                        دوبل 🤓 (+{recap.bid * 2})
                      </span>
                    )}
                    {recap.ruleApplied === "doubleNegative" && (
                      <span className="pill" style={styles.pill}>
                        دوبل منفی (−{recap.bid * 2})
                      </span>
                    )}

                    <span className="pill" style={styles.pill}>
                      امتیاز کل آتش: {recap.teamScoresAfter.Fire}
                    </span>
                    <span className="pill" style={styles.pill}>
                      امتیاز کل طوفان: {recap.teamScoresAfter.Storm}
                    </span>
                  </div>
                </div>

                {/* Boden- und Abwurfkarten klar getrennt mit Titeln links */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "120px 1fr",
                    rowGap: 12,
                    columnGap: 12,
                    marginTop: 16,
                    alignItems: "start",
                  }}
                >
                  {/* Boden-Karten */}
                  <div
                    style={{
                      fontWeight: 900,
                      fontSize: 15,
                      color: "#111",
                      textAlign: "left",
                      paddingTop: 6,
                    }}
                  >
                    📤 زمین
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 0,
                      flexWrap: "wrap",
                      background: "rgba(0,0,0,.05)",
                      padding: 4,
                      borderRadius: 10,
                      minHeight: 70,
                    }}
                  >
                    {recap.bottomCards.length === 0 && (
                      <div style={{ opacity: 0.5 }}>Keine Karten</div>
                    )}
                    {recap.bottomCards.map((c, i) => (
                      <div key={`b-${i}`} title={`Bodenkarte ${i + 1}`}>
                        <SpriteCard code={c} size="sm" />
                      </div>
                    ))}
                  </div>

                  {/* Abgeworfene Karten */}
                  <div
                    style={{
                      fontWeight: 900,
                      fontSize: 15,
                      color: "#111",
                      textAlign: "left",
                      paddingTop: 6,
                    }}
                  >
                    🗑️ خوابانده
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 0,
                      flexWrap: "wrap",
                      background: "rgba(0,0,0,.05)",
                      padding: 4,
                      borderRadius: 10,
                      minHeight: 70,
                    }}
                  >
                    {recap.discarded.length === 0 && (
                      <div style={{ opacity: 0.5 }}>Keine Karten</div>
                    )}
                    {recap.discarded.map((c, i) => (
                      <div key={`d-${i}`} title={`Abwurfkarte ${i + 1}`}>
                        <SpriteCard code={c} size="sm" />
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ marginTop: 16 }}>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>Stiche</div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {recap.tricks.map((t) => (
                      <TrickRow key={t.no} t={t} />
                    ))}
                  </div>
                </div>

                <div style={{ textAlign: "right", marginTop: 16 }}>
                  <button
                    style={styles.btn}
                    onClick={() => setShowRecap(false)}
                  >
                    بستن
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* Team Auswahl */}
          {seatSelect}
          {/* Spielfeld */}
          {players.length === 4 && (
            <div style={styles.tableWrap}>
              {/* HUD Gesamt- und Rundenpunkte */}
              <div style={styles.hudGrid}>
                <div style={{ ...styles.hudTL }}>
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 6 }}
                  >
                    <span style={styles.hudPill}>
                      امتیاز کل آتش: {scores.Fire}
                    </span>
                    <span style={styles.hudPill}>
                      امتیاز دست آتش: {roundPointsLive.Fire}
                    </span>
                  </div>
                </div>

                <div style={{ ...styles.hudTR }}>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      alignItems: "flex-end",
                    }}
                  >
                    <span style={styles.hudPill}>
                      امتیاز کل طوفان: {scores.Storm}
                    </span>
                    <span style={styles.hudPill}>
                      امتیاز دست طوفان: {roundPointsLive.Storm}
                    </span>
                  </div>
                </div>

                <div style={styles.hudBL}>
                  <span style={styles.hudPill}>هدف: {currentBid}</span>
                </div>

                <div style={styles.hudButtonWrap}>
                  <button
                    style={styles.hudButton}
                    onClick={() => setShowStats(true)}
                  >
                    آمار
                  </button>
                  <button
                    style={{
                      ...styles.btn,
                      marginLeft: 8,
                      background: "#fca5a5",
                      fontWeight: 900,
                    }}
                    onClick={() => socket.emit("resetGame")}
                    title="Spiel komplett zurücksetzen (ohne Spieler zu entfernen)"
                  >
                    بازی جدید
                  </button>
                </div>
              </div>
              {/* Karten-Mitte */}
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
                  ref={trickAreaRef}
                  style={{ position: "relative", width: "80%", height: "70%" }}
                >
                  {(() => {
                    const order = currentTrick || [];

                    // Sitz-Index relativ zu dir: 0=unten (du), 1=rechts, 2=oben, 3=links
                    const id2seat = new Map(
                      seated.filter(Boolean).map((p, i) => [p.id, i])
                    );

                    // ~1/3 Überlappung: Versatz pro Sitz (keine Rotation)
                    const O = 0.33;
                    const slots = [
                      { dx: 0, dy: cardSize.h * O }, // unten (du)
                      { dx: cardSize.w * O, dy: 0 }, // rechts
                      { dx: 0, dy: -cardSize.h * O }, // oben
                      { dx: -cardSize.w * O, dy: 0 }, // links
                    ];

                    return (
                      <>
                        {order.map((t, i) => {
                          const seat = id2seat.get(t.playerId) ?? 0;
                          const { dx, dy } = slots[seat];
                          return (
                            <div
                              key={`${t.playerId}-${t.card}-${i}`}
                              style={{
                                position: "absolute",
                                left: "50%",
                                top: "50%",
                                transform: "translate(-50%, -50%)",
                                zIndex: 100 + i, // später gespielt liegt OBEN
                              }}
                              title={`#${i + 1} gespielt`}
                            >
                              <div
                                style={{
                                  transform: `translate(${dx}px, ${dy}px)`,
                                }}
                              >
                                <SpriteCard
                                  code={t.card}
                                  // Größe direkt setzen → wirklich responsive
                                  radius={CARD_RADIUS_PLAYED}
                                  style={{
                                    width: `${cardSize.w}px`,
                                    height: "auto",
                                    boxShadow: "0 6px 14px rgba(0,0,0,.25)",
                                    border: "1px solid rgba(0,0,0,.15)",
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })}

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
                            در انتظار کارت ها
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
                  zIndex: 30,
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
                  zIndex: 30,
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
                  zIndex: 30,
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
                  zIndex: 30,
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
                <h4 style={{ margin: 0 }}>چهار برگ انتخاب کن </h4>
                <div style={{ fontWeight: 400 }}>
                  برگ های انتخاب شده: {selectedDiscard.length} / 4
                </div>
              </div>
              <div style={{ marginTop: 8 }}>
                <button
                  style={{
                    ...styles.btn,
                    background: "#22c55e",
                    color: "white",
                  }}
                  onClick={confirmDiscard}
                  disabled={selectedDiscard.length !== 4}
                >
                  شروع بازی
                </button>
              </div>
            </div>
          )}
          {variantModal.open && (
            <div style={styles.modalBackdrop}>
              <div style={styles.modal}>
                <h3 style={{ margin: 0, fontWeight: 800, textAlign: "center" }}>
                  Runde: Normal oder Flip?
                </h3>
                <p style={{ textAlign: "center", marginTop: 8 }}>
                  Entscheidung nach der ersten Karte des Startspielers.
                </p>
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    justifyContent: "center",
                    marginTop: 16,
                  }}
                >
                  <button
                    style={{
                      ...styles.btn,
                      background: "#dbeafe",
                      fontWeight: 800,
                    }}
                    onClick={() =>
                      socket.emit("setVariant", { variant: "NORMAL" })
                    }
                  >
                    معمولی
                  </button>
                  <button
                    style={{
                      ...styles.btn,
                      background: "#fde68a",
                      fontWeight: 800,
                    }}
                    onClick={() =>
                      socket.emit("setVariant", { variant: "FLIP" })
                    }
                  >
                    نرس
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* Bieten */}
          {isMyTurn && !biddingWinner && !anyModalOpen && (
            <div style={styles.modalBackdrop}>
              <div style={styles.modal}>
                <h3
                  style={{
                    margin: 0,
                    fontWeight: 800,
                    color: "#000000",
                    textAlign: "center",
                  }}
                >
                  امتیاز پیشنهادی شما{" "}
                </h3>
                <p
                  style={{
                    color: "#000000",
                    textAlign: "center",
                  }}
                >
                  آخرین امتیاز پیشنهاد شده: {currentBid}
                </p>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 20,
                    margin: "20px 0",
                  }}
                >
                  <button
                    style={{ ...styles.btn, fontSize: 24 }}
                    onClick={() => {
                      const minAllowed = Math.max(100, currentBid + 5);
                      setMyBid((prev) => Math.max(prev - 5, minAllowed));
                    }}
                    disabled={myBid <= Math.max(100, currentBid + 5)}
                  >
                    –
                  </button>

                  <div
                    style={{
                      fontSize: 36,
                      fontWeight: 900,
                      minWidth: 80,
                      textAlign: "center",
                      color: "black",
                    }}
                  >
                    {myBid || 100}
                  </div>

                  <button
                    style={{ ...styles.btn, fontSize: 24 }}
                    onClick={() => setMyBid((prev) => Math.min(prev + 5, 165))}
                    disabled={myBid >= 165}
                  >
                    +
                  </button>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginTop: 20,
                  }}
                >
                  <button
                    style={{
                      ...styles.btn,
                      background: "#fbbf24",
                      color: "#000",
                      padding: "16px 60px",
                      fontWeight: 800,
                      fontSize: 15,
                    }}
                    onClick={() => makeBid(0)}
                    disabled={mustBid}
                  >
                    پاس
                  </button>
                  <button
                    style={{
                      ...styles.btn,
                      background: "#22c55e",
                      color: "#000000ff",
                      padding: "16px 60px",
                      fontWeight: 800,
                      fontSize: 15,
                    }}
                    onClick={() => makeBid(myBid)}
                  >
                    تایید
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* Hand */}
          <div style={styles.card}>
            {/* leichtes Overlap-Layout für ein Kartenband */}
            <div
              style={{
                display: "flex",
                gap: 0,
                flexWrap: "wrap",
                alignItems: "flex-end",
                paddingBottom: "8px 16px",
                justifyContent: "center",
                overflow: "visible",
              }}
            >
              {hand.map((card, idx) => {
                const isSelected = selectedDiscard.includes(card);
                const canSelectMore = selectedDiscard.length < 4;
                const inDiscard = discardPhase;
                const showSelected = inDiscard && isSelected;

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
                      overflow: "visible",
                      marginLeft: idx ? "-12px" : "0px",
                      zIndex: isSelected ? 1000 + idx : idx,
                      cursor: disabled ? "not-allowed" : "pointer",
                      // für kleine Overlap-Optik kann man hier z.B. marginLeft: -12 setzen,
                      // wir lassen es neutral
                    }}
                  >
                    <div
                      style={{
                        // der Wrapper bewegt die Karte nach oben, wenn ausgewählt
                        transform: showSelected
                          ? "translateY(-8px)"
                          : "translateY(0px)",
                        transition: "transform 140ms ease",
                        // keine rote Outline mehr
                        filter: !disabled ? "brightness(1)" : "grayscale(0.2)",
                      }}
                    >
                      <SpriteCard
                        code={card}
                        size="sm"
                        style={{
                          // dezenter Auswahl-Effekt nur über Schatten
                          boxShadow: showSelected
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
          {showStats && (
            <div style={styles.modalBackdrop}>
              <div
                style={{
                  ...styles.modal,
                  width: 800,
                  maxWidth: "95vw",
                  maxHeight: "85vh",
                  overflow: "auto",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <h3 style={{ margin: 0, fontWeight: 800 }}>Statistik</h3>
                  <button
                    className="close"
                    style={styles.btn}
                    onClick={() => setShowStats(false)}
                  >
                    بستن
                  </button>
                </div>

                {!roundsHistory || roundsHistory.length === 0 ? (
                  <div style={{ marginTop: 12 }}>
                    Noch keine Rundendaten vorhanden.
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                    {roundsHistory.map((r) => {
                      const isOpen = !!expandedRounds[r.round];
                      return (
                        <div
                          key={r.round}
                          style={{
                            border: "1px solid #e5e7eb",
                            borderRadius: 10,
                            background: "#fafafa",
                          }}
                        >
                          {/* Kopfzeile einer Runde */}
                          <button
                            onClick={() =>
                              setExpandedRounds((prev) => ({
                                ...prev,
                                [r.round]: !prev[r.round],
                              }))
                            }
                            style={{
                              display: "flex",
                              width: "100%",
                              textAlign: "left",
                              justifyContent: "space-between",
                              gap: 10,
                              alignItems: "center",
                              padding: 10,
                              background: "transparent",
                              border: "none",
                              cursor: "pointer",
                              borderBottom: isOpen
                                ? "1px solid #e5e7eb"
                                : "none",
                              borderRadius: "10px 10px 0 0",
                            }}
                            title="Details ein-/ausklappen"
                          >
                            <div style={{ fontWeight: 800 }}>
                              Runde {r.round}
                              {r.trumpf ? ` · Trumpf: ${r.trumpf}` : ""}
                            </div>
                            <div
                              style={{
                                display: "flex",
                                gap: 10,
                                flexWrap: "wrap",
                                alignItems: "center",
                              }}
                            >
                              <span className="pill" style={styles.pill}>
                                حاکم: {r.bidderName || "-"} (
                                {r.bidderTeam || "?"})
                              </span>
                              <span className="pill" style={styles.pill}>
                                هدف: {r.bid || 0}
                              </span>
                              <span className="pill" style={styles.pill}>
                                امتیاز دست آتش: {r.roundPoints?.Fire ?? 0}
                              </span>
                              <span className="pill" style={styles.pill}>
                                امتیاز دست طوفان: {r.roundPoints?.Storm ?? 0}
                              </span>
                              {r.ruleApplied === "doublePositive" && (
                                <span className="pill" style={styles.pill}>
                                  🤓دوبل مثبت 🥸 (+{r.bid * 2})
                                </span>
                              )}
                              {r.ruleApplied === "doubleNegative" && (
                                <span className="pill" style={styles.pill}>
                                  دوبل منفی (−{r.bid * 2})
                                </span>
                              )}

                              <span className="pill" style={styles.pill}>
                                امتیاز کل آتش: {r.teamScoresAfter?.Fire ?? "-"}
                              </span>
                              <span className="pill" style={styles.pill}>
                                امتیاز کل طوفان:{" "}
                                {r.teamScoresAfter?.Storm ?? "-"}
                              </span>
                            </div>
                          </button>

                          {/* Details: 12 Stiche mit Kartenanzeige */}
                          {isOpen && (
                            <div style={{ padding: 10 }}>
                              {/* Header – Richter & Trumpf */}
                              <div
                                style={{
                                  display: "flex",
                                  gap: 12,
                                  alignItems: "center",
                                  flexWrap: "wrap",
                                  marginBottom: 10,
                                }}
                              >
                                <div className="pill" style={styles.pill}>
                                  حاکم: {r.bidderName || "-"}
                                </div>
                                {r.trumpf && (
                                  <span className="pill" style={styles.pill}>
                                    حکم: {r.trumpf}
                                  </span>
                                )}
                                <span className="pill" style={styles.pill}>
                                  هدف: {r.bid || 0}
                                </span>
                              </div>

                              {/* Chronologische Liste der 12 Stiche */}
                              <div style={{ display: "grid", gap: 8 }}>
                                {(r.tricks || [])
                                  .slice()
                                  .sort((a, b) => a.no - b.no) // sicher chronologisch
                                  .map((t) => (
                                    <TrickRow key={t.no} t={t} />
                                  ))}
                              </div>

                              {/* Summen / Footer */}
                              <div
                                style={{
                                  display: "flex",
                                  gap: 10,
                                  flexWrap: "wrap",
                                  alignItems: "center",
                                  justifyContent: "flex-end",
                                  marginTop: 10,
                                }}
                              >
                                <span className="pill" style={styles.pill}>
                                  Round Punkte – Storm:{" "}
                                  {r.roundPoints?.Storm ?? 0}
                                </span>
                                <span className="pill" style={styles.pill}>
                                  Round Punkte – Fire:{" "}
                                  {r.roundPoints?.Fire ?? 0}
                                </span>
                                <span className="pill" style={styles.pill}>
                                  امتیاز کل طوفان – Storm:{" "}
                                  {r.teamScoresAfter?.Storm ?? "-"}
                                </span>
                                <span className="pill" style={styles.pill}>
                                  امتیاز کل آتش – Fire:{" "}
                                  {r.teamScoresAfter?.Fire ?? "-"}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default App;
