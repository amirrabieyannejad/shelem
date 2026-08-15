import React, { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";
import "./theme.css";
// CRA liest nur process.env.REACT_APP_*
const API_BASE = (
  process.env.REACT_APP_BACKEND_URL ||
  (window.location.hostname.endsWith("vercel.app")
    ? "https://shelem.onrender.com"
    : `http://${window.location.hostname}:3001`)
).trim();
const socket = io(API_BASE, { autoConnect: false });

// simple, crisp crown

// crisp suits
const SuitIcon = ({ suit = "♠", size = 32, dark = false }) => {
  const isRed = suit === "♦" || suit === "♥";
  // "dark": Icon liegt auf dunklem Hintergrund (z.B. Trumpf-Anzeige oben
  // links am Tisch). Schwarze Farben (♠/♣) waren dort fast unsichtbar
  // (#111111 auf dunkelgrünem Badge-Hintergrund) - auf hell umschalten.
  const color = isRed ? "#ef4444" : dark ? "#f4f6f8" : "#111111";
  const stroke = isRed ? "#7f1d1d" : dark ? "#0d1620" : "#000000";
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

// --- Layout-Helfer (layout_neu) -------------------------------------------

// Persische Ziffern für Zahlen, die in persischen Sätzen stehen.
// Die großen Punktestände bleiben bewusst lateinisch.
const faNum = (n) =>
  String(n ?? "").replace(/\d/g, (d) => "\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9"[d]);

// Absolute URL für ein Avatarbild bauen (Server liefert "/uploads/…").
const avatarSrc = (u) => {
  const raw = u && (u.avatarUrl || u.avatar_url);
  if (!raw) return null;
  if (raw.startsWith("http") || raw.startsWith("data:")) return raw;
  return `${API_BASE}${raw}`;
};

const initialsOf = (u) =>
  String((u && (u.username || u.name)) || "\u061F")
    .trim()
    .slice(0, 2);

// Rundes Profilbild mit Initialen als Rückfallebene.
function Avatar({ user, size = 34, className = "" }) {
  const src = avatarSrc(user);
  const style = { width: size, height: size };
  return src ? (
    <img className={className} src={src} alt="" style={style} />
  ) : (
    <span className={"sh-ph " + className} style={style}>
      {initialsOf(user)}
    </span>
  );
}

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
    color: "#e9eef4",
    padding: 16,
    borderRadius: 14,
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
    background: "rgba(4,8,12,.72)",
    backdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
    padding: 14,
  },
  modal: {
    background: "#121a23",
    color: "#e9eef4",
    border: "1px solid #26313f",
    boxShadow: "0 30px 70px rgba(0,0,0,.65)",
    padding: 0,
    borderRadius: 18,
    width: 350,
    maxWidth: "100%",
    maxHeight: "calc(100dvh - 28px)",
    overflow: "auto",
    paddingBottom: 4,
  },
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
    margin: "4px auto 0",
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
    minHeight: 44,
    borderRadius: 10,
    border: "1px solid #33455c",
    background: "#1f2b3a",
    color: "#dce6f1",
    fontWeight: 700,
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
    marginBottom: -1,
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
    marginBottom: -7,
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

  const [showPw, setShowPw] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");

  // Datei -> /api/upload-avatar -> URL in form.avatarUrl
  const pickAvatar = async (file) => {
    if (!file) return;
    setBusy(true);
    setErr("");
    try {
      const fd = new FormData();
      fd.append("avatar", file);
      const res = await fetch(`${host}/api/upload-avatar`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Upload fehlgeschlagen");
      setForm((f) => ({ ...f, avatarUrl: data.url }));
    } catch (e) {
      setErr(e.message || "Upload fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  };

  const avaPreview = form.avatarUrl
    ? form.avatarUrl.startsWith("http") || form.avatarUrl.startsWith("data:")
      ? form.avatarUrl
      : `${host}${form.avatarUrl}`
    : null;
  const initials = (form.name || form.username || "؟").trim().slice(0, 2);


  return (
    <div className="sh-authwrap">
      <div className="sh-authcard">
        <div className="sh-brand">
          <div className="sh-logo">♠♥</div>
          <h1>شلم</h1>
          <p>بازی چهار نفره · دو تیم</p>
        </div>

        <div className="sh-tabs">
          <button
            className={mode === "login" ? "is-on" : ""}
            onClick={() => setMode("login")}
          >
            ورود
          </button>
          <button
            className={mode === "register" ? "is-on" : ""}
            onClick={() => setMode("register")}
          >
            ثبت نام
          </button>
        </div>

        {mode === "login" ? (
          <div>
            <div className="sh-fld">
              <label htmlFor="sh-lUser">نام کاربری یا ایمیل</label>
              <input
                id="sh-lUser"
                autoComplete="username"
                value={form.usernameOrEmail}
                onChange={(e) =>
                  setForm((f) => ({ ...f, usernameOrEmail: e.target.value }))
                }
              />
            </div>
            <div className="sh-fld">
              <label htmlFor="sh-lPw">رمز عبور</label>
              <div className="sh-wrap">
                <input
                  id="sh-lPw"
                  type={showPw ? "text" : "password"}
                  autoComplete="current-password"
                  value={form.password}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, password: e.target.value }))
                  }
                  onKeyDown={(e) => e.key === "Enter" && login()}
                />
                <button
                  type="button"
                  className="sh-eye"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label="نمایش رمز"
                >
                  {showPw ? "🙈" : "👁"}
                </button>
              </div>
            </div>
            <button
              className="sh-btn sh-btn--gold"
              style={{ width: "100%", marginTop: 6, minHeight: 48, fontSize: 15 }}
              onClick={login}
            >
              ورود
            </button>
            <div className="sh-authfoot">
              حساب نداری؟{" "}
              <button
                type="button"
                className="sh-linkbtn"
                onClick={() => setMode("register")}
              >
                ثبت نام کن
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="sh-avpick">
              <label className="sh-avbig" htmlFor="sh-rPhoto">
                {avaPreview ? (
                  <img src={avaPreview} alt="" />
                ) : (
                  <span
                    style={{
                      width: "100%",
                      height: "100%",
                      borderRadius: "50%",
                      background: "#223040",
                      display: "grid",
                      placeItems: "center",
                      fontSize: 24,
                      fontWeight: 800,
                    }}
                  >
                    {initials}
                  </span>
                )}
                <span className="sh-cam">{busy ? "…" : "📷"}</span>
              </label>
              <input
                id="sh-rPhoto"
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => pickAvatar(e.target.files && e.target.files[0])}
              />
              <span className="sh-opt">عکس پروفایل — اختیاری</span>
            </div>

            <div className="sh-fld">
              <label htmlFor="sh-rName">نام</label>
              <input
                id="sh-rName"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="sh-fld">
              <label htmlFor="sh-rUser">نام کاربری</label>
              <input
                id="sh-rUser"
                value={form.username}
                onChange={(e) =>
                  setForm((f) => ({ ...f, username: e.target.value }))
                }
              />
              <div className="sh-hint">
                بعداً قابل تغییر نیست. نام نمایشی سر میز را می‌توانی هر وقت عوض کنی.
              </div>
            </div>
            <div className="sh-fld">
              <label htmlFor="sh-rMail">ایمیل</label>
              <input
                id="sh-rMail"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="sh-fld">
              <label htmlFor="sh-rPhone">
                شماره تماس <span className="sh-opt">اختیاری</span>
              </label>
              <input
                id="sh-rPhone"
                type="tel"
                inputMode="tel"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div className="sh-fld">
              <label htmlFor="sh-rPw">رمز عبور</label>
              <div className="sh-wrap">
                <input
                  id="sh-rPw"
                  type={showPw ? "text" : "password"}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, password: e.target.value }))
                  }
                />
                <button
                  type="button"
                  className="sh-eye"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label="نمایش رمز"
                >
                  {showPw ? "🙈" : "👁"}
                </button>
              </div>
            </div>

            <button
              className="sh-btn sh-btn--gold"
              style={{ width: "100%", marginTop: 6, minHeight: 48, fontSize: 15 }}
              onClick={register}
            >
              ساختن حساب
            </button>
            <div className="sh-authfoot">
              حساب داری؟{" "}
              <button
                type="button"
                className="sh-linkbtn"
                onClick={() => setMode("login")}
              >
                وارد شو
              </button>
            </div>
          </div>
        )}

        {err ? <div className="sh-msg sh-msg--err">{err}</div> : null}
      </div>
    </div>
  );
}

/* ===========================================================================
   Statistik-Bausteine: Gewinnwahrscheinlichkeit, Spieler-Level, Partner-Bericht
   =========================================================================== */

const pct = (p) => (p === null || p === undefined ? "–" : `${Math.round(p * 100)}%`);

const probColor = (p) =>
  p === null || p === undefined
    ? "#9ca3af"
    : p >= 0.66
    ? "#16a34a"
    : p >= 0.34
    ? "#d97706"
    : "#b91c1c";

function ProbBar({ label, hint, p }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "170px 1fr 56px", gap: 8, alignItems: "center" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#374151" }} title={hint}>
        {label}
      </div>
      <div style={{ height: 12, borderRadius: 999, background: "#e5e7eb", overflow: "hidden" }}>
        <div
          style={{
            width: `${Math.round((p || 0) * 100)}%`,
            height: "100%",
            background: probColor(p),
            transition: "width .4s ease",
          }}
        />
      </div>
      <div style={{ fontWeight: 800, fontSize: 13, textAlign: "right", color: probColor(p) }}>
        {pct(p)}
      </div>
    </div>
  );
}

/**
 * Zeigt, wie wahrscheinlich es war, dass das Hakem-Team sein Gebot erfüllt.
 * Zwei Sichtweisen (Monte-Carlo, Server-seitig berechnet):
 *  - hakem: nur die eigenen Karten waren bekannt  -> "War das Gebot riskant?"
 *  - deal:  die tatsächliche Verteilung aller Hände -> "Wie lagen die Karten?"
 */
function WinProbBlock({ winProb, bid, bidSuccess, compact = false }) {
  if (!winProb) return null;
  const pHakem = winProb.hakem?.p ?? null;
  const pDeal = winProb.deal?.p ?? null;
  const ref = pDeal ?? pHakem;

  let verdict = null;
  if (ref !== null && typeof bidSuccess === "boolean") {
    if (bidSuccess && ref < 0.35) verdict = { txt: "خوش‌شانس · Glück gehabt", c: "#16a34a" };
    else if (!bidSuccess && ref > 0.65) verdict = { txt: "بدشانس · Pech gehabt", c: "#b91c1c" };
    else if (bidSuccess) verdict = { txt: "طبق انتظار · wie erwartet", c: "#16a34a" };
    else verdict = { txt: "طبق انتظار · wie erwartet", c: "#b91c1c" };
  }

  return (
    <div
      style={{
        marginTop: compact ? 8 : 14,
        padding: 10,
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        background: "#fff",
        color: "#111", // styles.page setzt white -> sonst unsichtbar
        display: "grid",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 900, fontSize: 14, color: "#111" }}>
          🎲 شانس موفقیت حاکم · Gewinnchance (هدف {bid})
        </div>
        {verdict && (
          <span style={{ fontWeight: 800, fontSize: 12, color: verdict.c }}>{verdict.txt}</span>
        )}
      </div>

      <ProbBar
        label="با برگ‌های حاکم"
        hint="Nur die Karten des Hakem waren bekannt – der Rest wurde zufällig verteilt (Risiko des Gebots)."
        p={pHakem}
      />
      <ProbBar
        label="با پخش واقعی برگ‌ها"
        hint="Die tatsächliche Verteilung aller vier Hände – wie gut lagen die Karten wirklich?"
        p={pDeal}
      />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 11, color: "#6b7280" }}>
        {winProb.deal?.avgPoints != null && (
          <span>Ø امتیاز شبیه‌سازی: {winProb.deal.avgPoints} / هدف {bid}</span>
        )}
        {winProb.pShutout != null && <span>شانس دوبل مثبت: {pct(winProb.pShutout)}</span>}
        {winProb.pDoubleNegative != null && <span>خطر دوبل منفی: {pct(winProb.pDoubleNegative)}</span>}
        <span>
          Monte-Carlo · {(winProb.iterations?.deal || 0) + (winProb.iterations?.hakem || 0)} شبیه‌سازی
        </span>
      </div>
    </div>
  );
}

/** Gut lesbare Fehlerbox für die Statistik-Reiter (mit Wiederholen-Knopf) */
function StatsError({ msg, onRetry }) {
  return (
    <div
      style={{
        marginTop: 12,
        padding: 12,
        border: "1px solid #fecaca",
        background: "#fef2f2",
        color: "#991b1b",
        borderRadius: 10,
        fontSize: 13,
        lineHeight: 1.5,
        wordBreak: "break-word",
        whiteSpace: "pre-wrap",
        direction: "ltr",
        textAlign: "left",
      }}
    >
      <div style={{ fontWeight: 800, marginBottom: 4 }}>خطا · Fehler</div>
      <div>{msg}</div>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            marginTop: 10,
            padding: "6px 12px",
            borderRadius: 8,
            border: "1px solid #991b1b",
            background: "#fff",
            color: "#991b1b",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          دوباره تلاش کن · Erneut versuchen
        </button>
      )}
    </div>
  );
}

function LevelBadge({ level, title, small }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: small ? "2px 8px" : "4px 10px",
        borderRadius: 999,
        background: "linear-gradient(135deg,#f59e0b,#b45309)",
        color: "#fff",
        fontWeight: 800,
        fontSize: small ? 11 : 13,
        whiteSpace: "nowrap",
      }}
      title={`Level ${level}`}
    >
      <span style={{ opacity: 0.9 }}>Lv {level}</span>
      <span>{title}</span>
    </span>
  );
}

/** Lebenslange Spieler-Stufen: gespielt / gewonnen / Punkte -> XP -> Level */
function PlayerLevelPanel({ players, meId }) {
  if (!players?.length) return <div style={{ marginTop: 12 }}>هنوز داده‌ای وجود ندارد</div>;
  const th = { textAlign: "left", padding: "6px 8px", fontSize: 12, color: "#6b7280", fontWeight: 800 };
  const td = { padding: "6px 8px", fontSize: 13, borderTop: "1px solid #eee" };

  return (
    // WICHTIG: styles.page setzt color:"white" – ohne eigene Farbe wäre der
    // Tabellentext weiß auf weiß und damit unsichtbar.
    <div style={{ marginTop: 12, overflowX: "auto", color: "#111" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 10 }}>
        <thead>
          <tr>
            <th style={th}>#</th>
            <th style={th}>بازیکن</th>
            <th style={th}>سطح</th>
            <th style={th}>XP</th>
            <th style={th}>بازی‌ها</th>
            <th style={th}>برد</th>
            <th style={th}>دست‌ها (برد)</th>
            <th style={th}>حاکم موفق</th>
            <th style={th}>امتیاز کل</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p, i) => (
            <tr key={p.userId} style={{ background: p.userId === meId ? "#fff7ed" : "transparent" }}>
              <td style={td}>{i + 1}</td>
              <td style={{ ...td, fontWeight: 700 }}>{p.username || p.name}</td>
              <td style={td}>
                <LevelBadge level={p.level} title={p.title} small />
                <div style={{ marginTop: 4, height: 5, background: "#e5e7eb", borderRadius: 999 }}>
                  <div
                    style={{
                      width: `${Math.round((p.progress || 0) * 100)}%`,
                      height: "100%",
                      background: "#f59e0b",
                      borderRadius: 999,
                    }}
                  />
                </div>
                <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>
                  {p.nextLevelXp ? `${p.xp} / ${p.nextLevelXp} XP` : "حداکثر سطح"}
                </div>
              </td>
              <td style={{ ...td, fontWeight: 800 }}>{p.xp}</td>
              <td style={td}>{p.gamesPlayed}</td>
              <td style={td}>
                {p.gamesWon}
                {p.gameWinRate !== null && (
                  <span style={{ color: "#6b7280", fontSize: 11 }}> ({pct(p.gameWinRate)})</span>
                )}
              </td>
              <td style={td}>
                {p.roundsPlayed} ({p.roundsWon})
              </td>
              <td style={td}>
                {p.hakemSuccess}/{p.hakemRounds}
                {p.hakemSuccessRate !== null && (
                  <span style={{ color: "#6b7280", fontSize: 11 }}> ({pct(p.hakemSuccessRate)})</span>
                )}
              </td>
              <td style={td}>{p.pointsFor}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 8 }}>
        XP = 10·بازی + 60·برد + 3·دست برده + 6·حاکم موفق + 20·دوبل مثبت − 12·دوبل منفی + امتیاز/150
      </div>
    </div>
  );
}

const teamLabel = (t) => (t === "Fire" ? "🔥 Fire" : t === "Storm" ? "🌩️ Storm" : "–");

/** Partner-Bericht: wer mit wem, Siege/Niederlagen, Team, Prognose */
function PairStatsPanel({ pairs }) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");

  if (!pairs?.length) return <div style={{ marginTop: 12 }}>هنوز داده‌ای وجود ندارد</div>;

  const th = { textAlign: "left", padding: "6px 8px", fontSize: 12, color: "#6b7280", fontWeight: 800 };
  const td = { padding: "6px 8px", fontSize: 13, borderTop: "1px solid #eee" };
  const keyOf = (p) => `${p.userA}|${p.userB}`;

  const pa = pairs.find((p) => keyOf(p) === a) || null;
  const pb = pairs.find((p) => keyOf(p) === b) || null;
  let duel = null;
  if (pa && pb && a !== b) {
    const s = (pa.predictedWinProb || 0) + (pb.predictedWinProb || 0);
    const p1 = s > 0 ? pa.predictedWinProb / s : 0.5;
    duel = { p1, p2: 1 - p1 };
  }

  return (
    // color: styles.page setzt white – sonst unsichtbarer Text auf weiß
    <div style={{ marginTop: 12, color: "#111" }}>
      {/* Direkter Vergleich zweier Duos */}
      <div style={{ padding: 10, border: "1px solid #e5e7eb", borderRadius: 10, background: "#fff" }}>
        <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 8 }}>
          ⚔️ پیش‌بینی بازی · Duo gegen Duo
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select value={a} onChange={(e) => setA(e.target.value)} style={{ padding: 6, borderRadius: 8, color: "#111", background: "#fff" }}>
            <option value="">— تیم ۱ —</option>
            {pairs.map((p) => (
              <option key={keyOf(p)} value={keyOf(p)}>
                {p.nameA} + {p.nameB}
              </option>
            ))}
          </select>
          <span style={{ fontWeight: 800 }}>vs</span>
          <select value={b} onChange={(e) => setB(e.target.value)} style={{ padding: 6, borderRadius: 8, color: "#111", background: "#fff" }}>
            <option value="">— تیم ۲ —</option>
            {pairs.map((p) => (
              <option key={keyOf(p)} value={keyOf(p)}>
                {p.nameA} + {p.nameB}
              </option>
            ))}
          </select>
        </div>

        {pa && !pb && (
          <div style={{ marginTop: 10 }}>
            <ProbBar
              label={`${pa.nameA} + ${pa.nameB}`}
              hint="Prognose, das nächste Spiel zu gewinnen"
              p={pa.predictedWinProb}
            />
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
              اطمینان: {pa.confidence} · {pa.gamesWon}/{pa.gamesPlayed} بازی برده
            </div>
          </div>
        )}

        {duel && (
          <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
            <ProbBar label={`${pa.nameA} + ${pa.nameB}`} p={duel.p1} />
            <ProbBar label={`${pb.nameA} + ${pb.nameB}`} p={duel.p2} />
            <div style={{ fontSize: 11, color: "#6b7280" }}>
              اطمینان: {pa.confidence} / {pb.confidence} — بر پایه {pa.gamesPlayed} و {pb.gamesPlayed} بازی
            </div>
          </div>
        )}
      </div>

      {/* Tabelle aller Paare */}
      <div style={{ marginTop: 12, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 10 }}>
          <thead>
            <tr>
              <th style={th}>یار (Duo)</th>
              <th style={th}>تیم</th>
              <th style={th}>بازی</th>
              <th style={th}>برد</th>
              <th style={th}>باخت</th>
              <th style={th}>دست‌ها ب/ب</th>
              <th style={th}>اختلاف امتیاز</th>
              <th style={th}>شانس برد</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((p) => (
              <tr key={keyOf(p)}>
                <td style={{ ...td, fontWeight: 700 }}>
                  {p.nameA} + {p.nameB}
                </td>
                <td style={td}>
                  {teamLabel(p.lastTeam)}
                  <div style={{ fontSize: 10, color: "#6b7280" }}>
                    🔥{p.winsAsFire}/{p.gamesAsFire} · 🌩️{p.winsAsStorm}/{p.gamesAsStorm}
                  </div>
                </td>
                <td style={td}>{p.gamesPlayed}</td>
                <td style={{ ...td, color: "#16a34a", fontWeight: 800 }}>{p.gamesWon}</td>
                <td style={{ ...td, color: "#b91c1c", fontWeight: 800 }}>{p.gamesLost}</td>
                <td style={td}>
                  {p.roundsWon}/{p.roundsLost}
                </td>
                <td style={{ ...td, color: p.pointsDiff >= 0 ? "#16a34a" : "#b91c1c" }}>
                  {p.pointsDiff >= 0 ? `+${p.pointsDiff}` : p.pointsDiff}
                </td>
                <td style={td}>
                  <span style={{ fontWeight: 800, color: probColor(p.predictedWinProb) }}>
                    {pct(p.predictedWinProb)}
                  </span>
                  <div style={{ fontSize: 10, color: "#6b7280" }}>
                    {pct(p.ci95?.low)}–{pct(p.ci95?.high)} · {p.confidence}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 8 }}>
        Prognose = Bayes-geglättete Siegquote (wenige Spiele ziehen Richtung Rundenquote), 95 %-Intervall nach Wilson.
      </div>
    </div>
  );
}

// --- Profil: Foto, Anzeigename, Kontaktdaten, Passwort, Level ----------------
function ProfileSheet({ auth, onClose, onSaved, level }) {
  const profile = auth?.profile || {};
  const [nick, setNick] = React.useState(profile.name || "");
  const [mail, setMail] = React.useState(profile.email || "");
  const [ava, setAva] = React.useState(profile.avatarUrl || null);
  const [pw0, setPw0] = React.useState("");
  const [pw1, setPw1] = React.useState("");
  const [pw2, setPw2] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState(null);

  const preview = ava
    ? ava.startsWith("http") || ava.startsWith("data:")
      ? ava
      : `${API_BASE}${ava}`
    : null;

  const pickPhoto = async (file) => {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("avatar", file);
      const res = await fetch(`${API_BASE}/api/upload-avatar`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Upload fehlgeschlagen");
      setAva(data.url);
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (pw1 && pw1 !== pw2) {
      setMsg({ ok: false, text: "تکرار رمز جدید یکسان نیست" });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`${API_BASE}/api/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.token}`,
        },
        body: JSON.stringify({
          name: nick,
          email: mail,
          avatarUrl: ava,
          currentPassword: pw0 || undefined,
          newPassword: pw1 || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "ذخیره نشد");
      onSaved(data.profile);
      setPw0("");
      setPw1("");
      setPw2("");
      setMsg({ ok: true, text: "ذخیره شد" });
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="sh-sheet"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="sh-sheetbox">
        <div className="sh-sheethd">
          <h2>پروفایل</h2>
          <button className="sh-xbtn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="sh-avarea">
          <label className="sh-avbig" htmlFor="sh-pPhoto" style={{ width: 104, height: 104 }}>
            {preview ? (
              <img src={preview} alt="" />
            ) : (
              <span className="sh-ph" style={{ width: "100%", height: "100%", fontSize: 26 }}>
                {initialsOf(profile)}
              </span>
            )}
            <span className="sh-cam">{busy ? "…" : "📷"}</span>
          </label>
          <input
            id="sh-pPhoto"
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => pickPhoto(e.target.files && e.target.files[0])}
          />
          {level != null && (
            <div className="sh-lvbox">
              <span className="sh-pill">Lv {level}</span>
            </div>
          )}
        </div>

        <fieldset className="sh-fset">
          <legend>مشخصات</legend>
          <div className="sh-fld">
            <label htmlFor="sh-nick">نام نمایشی</label>
            <input
              id="sh-nick"
              maxLength={40}
              value={nick}
              onChange={(e) => setNick(e.target.value)}
            />
            <div className="sh-hint">
              این نامی است که سر میز به بقیه نشان داده می‌شود.
            </div>
          </div>
          <div className="sh-fld">
            <label htmlFor="sh-uname">نام کاربری</label>
            <input id="sh-uname" value={profile.username || ""} disabled />
            <div className="sh-hint">قابل تغییر نیست.</div>
          </div>
          <div className="sh-fld">
            <label htmlFor="sh-mail">ایمیل</label>
            <input
              id="sh-mail"
              type="email"
              value={mail}
              onChange={(e) => setMail(e.target.value)}
            />
          </div>
        </fieldset>

        <fieldset className="sh-fset">
          <legend>تغییر رمز عبور</legend>
          <div className="sh-fld">
            <label htmlFor="sh-pw0">رمز فعلی</label>
            <input
              id="sh-pw0"
              type="password"
              value={pw0}
              onChange={(e) => setPw0(e.target.value)}
            />
          </div>
          <div className="sh-fld">
            <label htmlFor="sh-pw1">رمز جدید</label>
            <input
              id="sh-pw1"
              type="password"
              placeholder="حداقل ۸ نویسه"
              value={pw1}
              onChange={(e) => setPw1(e.target.value)}
            />
          </div>
          <div className="sh-fld">
            <label htmlFor="sh-pw2">تکرار رمز جدید</label>
            <input
              id="sh-pw2"
              type="password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
            />
          </div>
        </fieldset>

        <div className="sh-sheetft">
          <button className="sh-btn" onClick={onClose}>
            انصراف
          </button>
          <button className="sh-btn sh-btn--gold" onClick={save} disabled={busy}>
            {busy ? "…" : "ذخیره"}
          </button>
        </div>

        {msg && (
          <div className={"sh-msg " + (msg.ok ? "sh-msg--ok" : "sh-msg--err")}>
            {msg.text}
          </div>
        )}
      </div>
    </div>
  );
}

function App() {
  const [hand, setHand] = useState([]);
  const [players, setPlayers] = useState([]);
  const [me, setMe] = useState(null);
  const [isMyTurn, setIsMyTurn] = useState(false);
  // WICHTIG: "wer ist dran" kam bisher AUSSCHLIESSLICH aus dem einmaligen
  // "yourTurn"-Event und lebte nur im lokalen State "isMyTurn". Ging dieses
  // Event einmal verloren (Refresh/Reconnect mit ungünstigem Timing), gab es
  // keinerlei Möglichkeit mehr, den Zustand zu rekonstruieren - das Bieten-
  // Popup blieb dauerhaft weg und das Spiel hing. Hier zusätzlich der
  // server-autoritative Zug-Zustand aus stateSync (userId-basiert, damit er
  // Socket-ID-Wechsel bei Reconnects übersteht). Das Popup wird daraus
  // abgeleitet, sodass ein Refresh den korrekten Zustand IMMER wiederherstellt.
  const [serverTurn, setServerTurn] = useState({
    currentPlayerUserId: null,
    forceBidUserId: null,
  });
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
  const [showProfile, setShowProfile] = useState(false);


  // Statistik-Reiter: Runden | Spieler-Level | Partner-Statistik
  const [statsTab, setStatsTab] = useState("rounds");
  const [overview, setOverview] = useState({ players: [], pairs: [] });
  const [overviewState, setOverviewState] = useState({ loading: false, error: null });
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
  const [includeJokers, setIncludeJokers] = useState(false);
  const [showRoundPoints, setShowRoundPoints] = useState(true);
  const [discardTargetCount, setDiscardTargetCount] = useState(4); // 4 oder 6
  const [firstClientId, setFirstClientId] = useState(null);

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

  // Token vorhanden → Profil serverseitig verifizieren (kommt aus DB)
  useEffect(() => {
    if (!auth?.token) return;
    const host = API_BASE;

    (async () => {
      try {
        const res = await fetch(`${host}/api/me`, {
          headers: { Authorization: `Bearer ${auth.token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "Unauthorized");

        if (data?.profile) {
          localStorage.setItem("shelem_profile", JSON.stringify(data.profile));
          setAuth((a) => ({ ...a, profile: data.profile }));
        }
      } catch {
        // Token ungültig → logout
        localStorage.removeItem("shelem_token");
        localStorage.removeItem("shelem_profile");
        setAuth({ token: null, profile: null });
      }
    })();
  }, [auth?.token]);

  // --- Lebenslange Statistik (Level + Partner-Bericht) laden ---
  const loadOverview = React.useCallback(async () => {
    if (!auth?.token) return;
    setOverviewState({ loading: true, error: null });
    const url = `${API_BASE}/api/stats/overview`;
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      const raw = await res.text();
      let data = null;
      try {
        data = JSON.parse(raw);
      } catch {
        /* keine JSON-Antwort (z. B. 404-HTML) */
      }

      if (!res.ok) {
        // Aussagekräftige Meldung statt eines nackten "Fehler":
        // 404 = Server läuft noch mit altem Code (Routen fehlen)
        if (res.status === 404) {
          throw new Error(
            `404 – ${url} nicht gefunden. Server neu starten (neue /api/stats-Routen).`
          );
        }
        if (res.status === 401) throw new Error("401 – nicht angemeldet");
        throw new Error(
          data?.error
            ? `${res.status} – ${data.error}`
            : `${res.status} ${res.statusText || ""}`.trim()
        );
      }
      if (!data) throw new Error("Antwort war kein JSON");

      setOverview({ players: data.players || [], pairs: data.pairs || [] });
      setOverviewState({ loading: false, error: null });
    } catch (e) {
      // fetch selbst gescheitert -> Server nicht erreichbar / CORS
      const msg =
        e?.name === "TypeError"
          ? `Server nicht erreichbar (${url})`
          : e?.message || "Unbekannter Fehler";
      console.error("stats/overview:", msg, e);
      setOverviewState({ loading: false, error: msg });
    }
  }, [auth?.token]);

  // Einmal nach dem Login (für das Level im Kopfbereich) und bei jedem Öffnen
  // der Statistik neu holen.
  useEffect(() => {
    if (auth?.token) loadOverview();
  }, [auth?.token, loadOverview]);

  useEffect(() => {
    if (showStats) loadOverview();
  }, [showStats, loadOverview]);

  // Ref, damit der zentrale Socket-Effekt (dessen Cleanup socket.off() ALLE
  // Listener entfernt) die aktuelle Ladefunktion aufrufen kann, ohne selbst neu
  // aufgesetzt werden zu müssen.
  const loadOverviewRef = useRef(loadOverview);
  useEffect(() => {
    loadOverviewRef.current = loadOverview;
  }, [loadOverview]);

  // Eigene Lebenszeit-Statistik (für das Level-Abzeichen im Kopfbereich)
  const myStats =
    (overview.players || []).find((p) => p.userId === auth?.profile?.id) || null;

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

  // nur der serverseitig erste Spieler (firstClientId) darf Random/Optionen
  const isFirstPlayer =
    !!auth?.profile?.id && firstClientId === auth.profile.id;

  const anyChosen = players.some(
    (p) => p.team === "Fire" || p.team === "Storm"
  );
  const canStartRandom = !randomTeams && !anyChosen && isFirstPlayer;

  // Die Kartengröße kommt jetzt aus theme.css (--card-w / --card-h) und
  // skaliert per clamp() mit dem Viewport - der ResizeObserver entfällt.

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
      // stabile ID & Name kommen vom Profil (server-side verifiziert).
      // stabile ID & Name kommen vom Profil (server-side verifiziert).
      // avatarUrl bewusst NICHT hier mitschicken: das Bild kann als
      // base64-Data-URL mehrere hundert KB groß sein und würde Socket.IOs
      // maxHttpBufferSize (Standard 1MB) sprengen -> Verbindung wird
      // gekappt -> Client reconnectet sofort wieder -> Endlosschleife.
      // Der Server holt sich die aktuelle avatarUrl stattdessen selbst
      // frisch aus der DB (siehe register-Handler).
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
        "JOKER_BW",
        "JOKER",
      ];

      const decode = (code) => {
        if (code === "JOKER_BW") return ["JOKER_BW", "♠"]; // s/w Joker bei ♠
        if (code === "JOKER") return ["JOKER", "♥"]; // farbig Joker bei ♥
        return [code.slice(0, -1), code.slice(-1)];
      };

      return [...cards].sort((a, b) => {
        const [ra, sa] = decode(a);
        const [rb, sb] = decode(b);

        if (suitOrder.indexOf(sa) !== suitOrder.indexOf(sb)) {
          return suitOrder.indexOf(sa) - suitOrder.indexOf(sb);
        }
        return rankOrder.indexOf(ra) - rankOrder.indexOf(rb);
      });
    };

    socket.on("askVariant", ({ options }) => {
      setVariantModal({ open: true, options: options || ["NORMAL", "FLIP"] });
    });

    socket.on("showRoundPointsUpdated", ({ value }) => {
      setShowRoundPoints(value);
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

    socket.on("turnUpdate", ({ currentPlayer, currentBid: cb }) => {
      // falls zu Beginn der Auktion nur turnUpdate kommt
      if (!biddingWinner) setBiddingActive(true);
      setCurrentPlayer(currentPlayer);
      setIsMyTurn(!!currentPlayer && currentPlayer.id === socket.id);
      // WICHTIG: "turnUpdate" geht an ALLE Clients, nicht nur an den, der
      // gerade dran ist ("yourTurn" ist unicast). Ohne dies blieb das "هدف"
      // (aktuelles Gebot) bei allen anderen Spielern auf dem letzten Stand,
      // den SIE selbst zuletzt per "yourTurn" bekommen haben - z.B. zeigte
      // ein Spieler weiter "0", obwohl gerade jemand anders 100 geboten hat.
      if (typeof cb === "number") setCurrentBid(cb);
    });

    socket.on("biddingResult", ({ winner, bid }) => {
      // Gebot sofort überall sichtbar machen (HUD "هدف", etc.)
      setCurrentBid(bid);

      // Gewinner/Status der Auktion setzen
      setBiddingWinner({ winner, bid });
      // Gelber Rand sofort zum Richter
      setCurrentPlayer(winner);
      setIsMyTurn(false);
      setBiddingActive(false);
      // Auktion vorbei -> Zwangsgebot-/Zug-Zustand der Bietrunde verwerfen
      setServerTurn({ currentPlayerUserId: null, forceBidUserId: null });
    });

    socket.on("showBottomCards", ({ bottomCards }) => {
      setBottomCards(bottomCards);
      setShowBottom(true);
    });

    socket.on("discardPhase", ({ hand, bottomSize }) => {
      setHand(sortHand(hand));
      setDiscardPhase(true);
      setSelectedDiscard([]);
      setDiscardTargetCount(bottomSize || 4);
    });

    // Discard beendet

    socket.on("discardDone", () => {
      setDiscardPhase(false);
      setSelectedDiscard([]);
      setHand((h) => sortHand(h));
      setDiscardTargetCount(4);
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
        bidSuccess,
        winProb, // Monte-Carlo-Schätzung der Gewinnchance des Hakem-Teams
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
        setServerTurn({ currentPlayerUserId: null, forceBidUserId: null });
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
          bidSuccess: !!bidSuccess,
          winProb: winProb || null,
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
      // WICHTIG: stateSnapshot() liefert currentBid server-seitig immer mit,
      // aber hier wurde es bisher nie übernommen - dadurch blieb "هدف" beim
      // Reconnect/Tab-Refresh auf dem letzten lokal bekannten Stand hängen,
      // statt den echten aktuellen Gebotsstand zu zeigen.
      if (typeof s?.currentBid === "number") setCurrentBid(s.currentBid);
      if (Array.isArray(s?.players)) setPlayers(s.players);
      // WICHTIG: currentPlayer wurde hier bisher NIE übernommen - dadurch war
      // nach jedem Refresh der gelbe "ist am Zug"-Ring verschwunden, obwohl
      // der Server sehr wohl weiß, wer dran ist.
      if (s?.currentPlayer !== undefined) setCurrentPlayer(s.currentPlayer);
      if (s?.trumpf) setTrumpf(s.trumpf);
      if (s?.roundVariant) setRoundVariant(s.roundVariant);
      if (typeof s?.biddingActive === "boolean")
        setBiddingActive(s.biddingActive);
      if (typeof s?.showRoundPoints === "boolean") {
        setShowRoundPoints(s.showRoundPoints);
      }
      if (typeof s?.tricksPlayed === "number" || s?.winnerPlayerId != null) {
        setServerFlags({
          tricksPlayed: s?.tricksPlayed || 0,
          winnerId: s?.winnerPlayerId || null,
        });
      }
      if (typeof s?.includeJokers === "boolean") {
        setIncludeJokers(s.includeJokers);
      }
      if (typeof s?.currentBottomSize === "number" && s.currentBottomSize > 0) {
        setDiscardTargetCount(s.currentBottomSize);
      }
      if (s?.firstClientId) {
        setFirstClientId(s.firstClientId);
      }
      // NEU: Karten, die in diesem Stich schon liegen, nach Reconnect wiederherstellen
      if (Array.isArray(s?.currentTrick)) {
        setCurrentTrick(s.currentTrick);
      }

      // WICHTIG: "wer ist dran"/"wer muss zwingend bieten" bisher NUR über das
      // einmalige "yourTurn"-Event bekannt. Kam das (aus welchem Grund auch
      // immer - z.B. ein zweiter, schneller Reconnect mittendrin) nicht an,
      // blieb das Bieten-Popup dauerhaft weg, obwohl der Server längst auf
      // genau diesen Spieler wartete - das Spiel hing dann komplett fest,
      // weil "isMyTurn" nirgendwo sonst neu gesetzt wurde. Jetzt bei JEDEM
      // stateSync (u.a. bei Reconnect/Refresh) direkt aus dem Snapshot selbst
      // ableiten, ob ich dran bin bzw. zwingend bieten muss - unabhängig
      // davon, ob "yourTurn" separat je angekommen ist. "myself" wird hier
      // bewusst aus s.players (nicht dem evtl. noch nicht aktualisierten
      // React-State "me") über die aktuelle socket.id ermittelt.
      // Server-autoritativen Zug-Zustand IMMER übernehmen (auch wenn gerade
      // nicht ich dran bin - sonst bliebe ein veralteter Wert stehen).
      setServerTurn({
        currentPlayerUserId: s?.biddingActive
          ? s?.currentPlayerUserId || null
          : null,
        forceBidUserId: s?.biddingActive ? s?.forceBidUserId || null : null,
      });

      if (s?.biddingActive && Array.isArray(s?.players)) {
        const myself = s.players.find((p) => p.id === socket.id);
        if (myself && !myself.passed) {
          const iAmForced = !!s.forceBidUserId && s.forceBidUserId === myself.userId;
          const iAmCurrent =
            !!s.currentPlayerUserId && s.currentPlayerUserId === myself.userId;
          if (iAmForced || iAmCurrent) {
            setIsMyTurn(true);
            setMustBid(iAmForced);
            const cb = typeof s.currentBid === "number" ? s.currentBid : 0;
            setMyBid(Math.max(cb + 5, 100));
          }
        }
      }
    });

    socket.on("gameOver", ({ winner, teamScores }) => {
      setScores(teamScores);
      alert(
        `Spielende! Gewinner: Team ${winner}\nFire: ${teamScores.Fire}, Storm: ${teamScores.Storm}`
      );
    });

    // Server hat die lebenslange Statistik (Level/Partner) neu berechnet
    socket.on("statsUpdated", () => {
      loadOverviewRef.current?.();
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
      setServerTurn({ currentPlayerUserId: null, forceBidUserId: null });
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
      if (s?.firstClientId) {
        setFirstClientId(s.firstClientId);
      }
    });

    return () => {
      socket.off();
      socket.off("invalidAction", onInvalidAction);
      socket.off("showRoundPointsUpdated");
      if (trickTimer.current) clearTimeout(trickTimer.current);
    };
  }, []); // Events nur einmal registrieren

  // Wenn Auth vorhanden → Socket mit Token verbinden
  useEffect(() => {
    if (!auth?.token || !auth?.profile?.id) return;

    // Token zuerst setzen
    socket.auth = { token: auth.token };

    // sauberen Connect erzwingen
    socket.disconnect();
    socket.connect();

    // WICHTIG: Hier bewusst KEIN eigener socket.once("connect", ...)-Handler
    // mehr, der zusätzlich "register" sendet. Der permanente
    // socket.on("connect", ...) weiter oben (siehe erstes useEffect) feuert
    // bei JEDEM connect-Event - auch bei diesem hier erzwungenen - und
    // emittiert register/getRoundsHistory/requestState bereits selbst.
    // Mit beiden Handlern liefen zwei nahezu zeitgleiche "register"-Aufrufe
    // für denselben Spieler auf dem Server (der register-Handler ist async
    // und damit unterbrechbar), wodurch er kurzzeitig doppelt in players[]
    // angelegt wurde - sichtbar z.B. als kurz aufblitzendes und dann wieder
    // verschwindendes Gebot-Badge nach einem (Re-)Login.
  }, [auth?.token, auth?.profile?.id]);

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
    // WICHTIG: auch den server-abgeleiteten Zug-Zustand lokal sofort löschen -
    // sonst würde das Popup direkt wieder aufgehen, weil serverTurn bis zum
    // nächsten stateSync noch auf mich zeigt.
    setServerTurn({ currentPlayerUserId: null, forceBidUserId: null });
  };

  const toggleDiscard = (card) => {
    setSelectedDiscard((prev) =>
      prev.includes(card)
        ? prev.filter((c) => c !== card)
        : prev.length < discardTargetCount
        ? [...prev, card]
        : prev
    );
  };

  const confirmDiscard = () => {
    if (selectedDiscard.length === discardTargetCount)
      socket.emit("discardCards", selectedDiscard);
    else alert(`Bitte genau ${discardTargetCount} Karten auswählen!`);
  };

  const playCard = (card) => {
    socket.emit("playCard", card);
  };

  const getSeatingOrder = () => {
    if (!me) return [null, null, null, null];

    // Bevorzugt: Sitzreihenfolge über seatPosition (server-fix: 1=unten,
    // 2=rechts, 3=oben, 4=links), relativ zu meinem eigenen Sitzplatz gedreht.
    // Das ist robust gegen die Reihenfolge im players[]-Array, die sich
    // z.B. nach einem Reconnect verschieben kann (players.push() hängt
    // reconnectete Spieler ans Ende an) - vorher hing die Tischanordnung
    // rein an dieser Array-Reihenfolge, wodurch Partner nach einem
    // Reconnect scheinbar vertauscht wirkten, obwohl seatPosition/team
    // serverseitig unverändert korrekt waren.
    if (me.seatPosition) {
      const bySeat = {};
      players.forEach((p) => {
        if (p.seatPosition) bySeat[p.seatPosition] = p;
      });
      const seatCycle = [1, 2, 3, 4];
      const myIdx = seatCycle.indexOf(me.seatPosition);
      if (myIdx !== -1) {
        return [0, 1, 2, 3].map(
          (offset) => bySeat[seatCycle[(myIdx + offset) % 4]] || null
        );
      }
    }

    // Fallback (z.B. falls seatPosition ausnahmsweise mal fehlt): alte,
    // rein Array-Index-basierte Logik.
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
  // Ein Sitz am Tisch: Name ÜBER dem Kreis, Foto IM Kreis.
  // Team steckt nur noch in der Ringfarbe - keine Text-Chips mehr.
  const PlayerBox = ({ p, side = "s", youLabel }) => {
    if (!p) {
      return (
        <div className={"sh-seat sh-seat--" + side}>
          <span className="sh-name" style={{ opacity: 0.45 }}>
            — آزاد —
          </span>
          <span className="sh-ring" style={{ background: "#2a3644" }}>
            <span className="sh-ph" />
          </span>
        </div>
      );
    }

    const kind = p.team === "Fire" ? "fire" : "storm";
    const isTurn = currentPlayer && currentPlayer.id === p.id;
    const isJudge = judgeId && p.id === judgeId;

    // Reihenfolge der Abzeichen: Auktion zeigt پاس/Gebot, danach حاکم.
    let badge = null;
    if (biddingActive && !biddingWinner) {
      if (p.passed) badge = { text: "پاس", kind: "pass" };
      else if (p.lastBid) badge = { text: String(p.lastBid), kind: "bid" };
    } else if (isJudge) {
      badge = { text: "👑", kind: "judge" };
    }

    return (
      <div
        className={
          "sh-seat sh-seat--" + side + " sh-seat--" + kind +
          (isTurn ? " is-active" : "")
        }
      >
        <span className="sh-name">
          {p.username || p.name}
          {youLabel ? " · تو" : ""}
        </span>
        <span className="sh-ring">
          <Avatar user={p} size="100%" />
          {badge && (
            <span className={"sh-badge sh-badge--" + badge.kind}>
              {badge.text}
            </span>
          )}
        </span>
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

  function cardPointsClient(card) {
    if (card === "JOKER_BW") return 15;
    if (card === "JOKER") return 20;

    const rank = card.slice(0, -1);
    if (rank === "A") return 10;
    if (rank === "10") return 10;
    if (rank === "5") return 5;
    return 0;
  }

  function TrickRow({ t }) {
    const [tapInfo, setTapInfo] = useState(null); // 👈 neu

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
      color: "#0f0101ff",
    };

    // kleine Helper, damit der Text hübsch ist
    const teamLabel = (team) =>
      team === "Fire" ? "آتش" : team === "Storm" ? "طوفان" : team || "";

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
            <div
              key={i}
              title={`#${i + 1} · ${p.name} (${p.team})`} // Desktop-Hover
              onClick={() =>
                setTapInfo(`#${i + 1} – ${p.name} (${teamLabel(p.team)})`)
              } // Mobile-Tap
              style={{ cursor: "pointer" }}
            >
              <SpriteCard
                code={p.card}
                size="xxs"
                radius={CARD_RADIUS_PLAYED}
              />
            </div>
          ))}

          {/* Info-Zeile bei Tap – funktioniert auch auf Handy */}
          {tapInfo && (
            <div
              style={{
                fontSize: 11,
                marginTop: 4,
                opacity: 0.8,
                width: "100%",
                color: "#000",
              }}
            >
              {tapInfo}
            </div>
          )}
        </div>

        {/* rechts: Punkte deutlich sichtbar */}
        <div style={pointsBadge}>+{pts}</div>
      </div>
    );
  }

  function SpriteCard({
    code,
    size = "md",
    style = {},
    radius = CARD_RADIUS,
    squash = false, // ⬅️ neu
  }) {
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

    // gemeinsamer Style
    const baseStyle = {
      width,
      height: "auto",
      display: "block",
      borderRadius: radius,
      border: "1px solid rgba(0,0,0,.15)",
      boxShadow: "0 4px 10px rgba(0,0,0,.25)",
      userSelect: "none",
      ...style,
    };

    // hier breiter + etwas niedriger machen NUR wenn squash=true
    if (squash) {
      const existing = baseStyle.transform ? baseStyle.transform + " " : "";
      baseStyle.transform = existing + "scale(1.08, 0.9)"; // breiter & kürzer
      baseStyle.transformOrigin = "bottom center";
    }

    if (!src) return null;

    return <img src={src} alt={code} draggable="false" style={baseStyle} />;
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
        const seatsAllEmpty =
          !seatMap[1] && !seatMap[2] && !seatMap[3] && !seatMap[4];
        const mySeat = me?.seatPosition || null;
        const takenCount = [1, 2, 3, 4].filter((i) => seatMap[i]).length;

        // Sitze 1+3 = آتش, 2+4 = طوفان — Partner sitzen gegenüber.
        const SEAT_TEAMS = { 1: "آتش", 2: "طوفان", 3: "آتش", 4: "طوفان" };
        const SEAT_SIDE = { 3: "n", 2: "e", 4: "w", 1: "s" };

        const renderSeat = (i) => {
          const team = SEAT_TEAMS[i];
          const kind = team === "آتش" ? "fire" : "storm";
          const occ = seatMap[i];
          const mine = !!occ && occ.seatPosition === mySeat && occ.id === me?.id;
          const occupiedByOther = !!occ && !mine;

          return (
            <div
              key={i}
              className={
                "sh-seat sh-seat--" + SEAT_SIDE[i] + (mine ? " is-mine" : "")
              }
            >
              <div className={"sh-seatbox sh-seatbox--" + kind}>
                <div className="sh-hd">
                  ({faNum(i)}) تیم {team}
                </div>

                <div className={"sh-who" + (occ ? "" : " is-free")}>
                  {occ ? (
                    <>
                      <Avatar user={occ} size={32} />
                      <span>{occ.username || occ.name}</span>
                    </>
                  ) : (
                    "— آزاد —"
                  )}
                </div>

                <button
                  className={"sh-sbtn" + (mine ? " sh-sbtn--leave" : "")}
                  disabled={occupiedByOther}
                  onClick={() =>
                    mine
                      ? socket.emit("leaveSeat")
                      : socket.emit("chooseSeat", { seat: i })
                  }
                  title={
                    occupiedByOther
                      ? "Platz ist belegt"
                      : mine
                      ? "Diesen Platz freigeben"
                      : "اینجا بنشین"
                  }
                >
                  {mine ? "آزاد کردن" : occupiedByOther ? "اشغال شده" : "اینجا بنشین"}
                </button>
              </div>
            </div>
          );
        };

        return (
          <div className="sh-seats">
            <div className="sh-tablewrap">
              <div className="sh-table">
                <div className="sh-tablecore">
                  <div>
                    <div className="sh-t">میز</div>
                    <div className="sh-s">
                      {faNum(takenCount)} از ۴ نفر نشسته‌اند
                    </div>
                  </div>
                </div>
                <div className="sh-seatgrid">
                  {[3, 4, 2, 1].map((i) => renderSeat(i))}
                </div>
              </div>
            </div>

            <div className="sh-optpanel">
              <div
                className={
                  "sh-switchrow" + (isFirstPlayer ? "" : " is-locked")
                }
                onClick={() =>
                  isFirstPlayer &&
                  socket.emit("setIncludeJokers", { value: !includeJokers })
                }
              >
                <span className={"sh-sw" + (includeJokers ? " is-on" : "")} />
                <span className="sh-txt">
                  بازی با جوکر
                  <small>دو جوکر به دسته اضافه می‌شود</small>
                </span>
              </div>

              <div
                className={
                  "sh-switchrow" + (isFirstPlayer ? "" : " is-locked")
                }
                onClick={() =>
                  isFirstPlayer &&
                  socket.emit("setShowRoundPoints", { value: !showRoundPoints })
                }
              >
                <span className={"sh-sw" + (showRoundPoints ? " is-on" : "")} />
                <span className="sh-txt">
                  نمایش امتیاز دست‌ها
                  <small>امتیاز تیم مقابلِ حاکم در جریان دست نشان داده می‌شود</small>
                </span>
              </div>

              {!isFirstPlayer && (
                <div className="sh-lockhint">
                  فقط بازیکن اول می‌تواند این گزینه‌ها را عوض کند
                </div>
              )}
            </div>

            <div className="sh-row" style={{ marginTop: 14 }}>
              {isFirstPlayer && seatsAllEmpty && (
                <button
                  className="sh-btn"
                  onClick={() => socket.emit("chooseTeam", "Random")}
                  title="Zufällig und balanciert auf freie Plätze verteilen"
                >
                  🎲 انتخاب تیم تصادفی
                </button>
              )}

              {isFirstPlayer ? (
                <button
                  className="sh-btn sh-btn--gold"
                  style={{ minWidth: 180, minHeight: 48 }}
                  disabled={!seatsAllFilled}
                  onClick={() => socket.emit("startGame")}
                  title="Spiel starten"
                >
                  {seatsAllFilled
                    ? "شروع بازی"
                    : `منتظر ${faNum(4 - takenCount)} بازیکن دیگر`}
                </button>
              ) : (
                <div className="sh-lockhint" style={{ border: 0, marginTop: 0 }}>
                  {seatsAllFilled
                    ? "منتظر شروع بازی توسط بازیکن اول"
                    : `منتظر ${faNum(4 - takenCount)} بازیکن دیگر`}
                </div>
              )}
            </div>
          </div>
        );
      })()
    : null;

  // WICHTIG: Das Bieten-Popup hing bisher allein an "isMyTurn", das NUR durch
  // das einmalige "yourTurn"-Event gesetzt wird. Ging dieses Event verloren
  // (typisch: Refresh/Reconnect genau in dem Moment, in dem ich als letzter
  // Spieler zwangsweise bieten muss), konnte der Zustand nie wiederhergestellt
  // werden -> Popup blieb für immer weg, niemand konnte mehr bieten, das Spiel
  // hing. Deshalb zusätzlich direkt aus dem server-autoritativen stateSync-
  // Zustand ableiten (userId-basiert, übersteht Socket-ID-Wechsel).
  const serverSaysMyTurn =
    !!me?.userId &&
    !me?.passed &&
    (serverTurn.forceBidUserId === me.userId ||
      serverTurn.currentPlayerUserId === me.userId);

  // WICHTIG (Zwangsgebot-Fall): Wenn alle ANDEREN gepasst haben und die
  // Auktion trotzdem noch läuft, kann rein logisch nur noch ich am Zug sein -
  // und ich MUSS bieten (hätte jemand geboten, wäre die Auktion mit einem
  // Sieger beendet und biddingActive/biddingWinner entsprechend gesetzt).
  // Diese Ableitung braucht WEDER "yourTurn" NOCH forceBidUserId, sondern nur
  // die passed-Flags aus players[] - und genau die kommen beim Refresh
  // nachweislich korrekt an (die پاس-Badges werden ja richtig angezeigt).
  // Dadurch stellt sich das Popup nach einem Refresh selbst dann wieder her,
  // wenn der Zug-Zustand über die Events verloren gegangen ist.
  const activeBidders = players.filter((p) => !p.passed);
  const iAmLastActiveBidder =
    biddingActive &&
    !biddingWinner &&
    players.length === 4 &&
    activeBidders.length === 1 &&
    !!me?.userId &&
    activeBidders[0]?.userId === me.userId;

  const showBidModal =
    (isMyTurn || serverSaysMyTurn || iAmLastActiveBidder) &&
    biddingActive &&
    !biddingWinner &&
    !anyModalOpen &&
    !me?.passed;

  // "پاس"-Button sperren, wenn ich laut Server zwingend bieten muss - auch das
  // muss einen Refresh überleben (mustBid kam bisher nur via "yourTurn").
  const mustBidNow =
    mustBid || serverTurn.forceBidUserId === me?.userId || iAmLastActiveBidder;

  // direkt über dem JSX vom Bieten-Modal
  const maxBid = includeJokers ? 200 : 165;
  const minBid = Math.max(100, currentBid + 5);
  // -8 ist fast keine Überlappung
  // 1.3 bestimmt, wie stark es bei vielen Karten zusammenrückt
  return (
    <div className="sh-root" style={{ ...styles.page, background: "transparent" }}>
      {!auth?.token ? (
        <AuthGate onAuthed={setAuth} />
      ) : (
        <>
          <div className="sh-app" style={{ paddingBottom: 0 }}>
            <div className="sh-topbar">
              <button
                className="sh-mechip"
                onClick={() => setShowProfile(true)}
                title="پروفایل"
              >
                <Avatar user={auth?.profile} size={34} />
                <span className="sh-nm">
                  {auth?.profile?.username || auth?.profile?.name || "بازیکن"}
                </span>
                {myStats && (
                  <span
                    className="sh-lv"
                    title={`${myStats.xp} XP · ${myStats.gamesWon}/${myStats.gamesPlayed} بازی برده`}
                  >
                    <LevelBadge level={myStats.level} title={myStats.title} small />
                  </span>
                )}
              </button>

              <span className="sh-grow" />

              {paused && (
                <span className="sh-lv" title="بازی متوقف است">
                  ⏸ توقف
                </span>
              )}

              <button className="sh-btn" onClick={() => setShowStats(true)}>
                📊 آمار
              </button>

              {isFirstPlayer && (
                <button
                  className="sh-btn"
                  onClick={() => socket.emit("resetGame")}
                  title="بازی جدید"
                >
                  ♻ بازی جدید
                </button>
              )}

              <button
                className="sh-btn sh-btn--red"
                onClick={handleLogout}
                title="خروج از حساب"
              >
                خروج
              </button>
            </div>
          </div>

          {showProfile && (
            <ProfileSheet
              auth={auth}
              level={myStats?.level ?? null}
              onClose={() => setShowProfile(false)}
              onSaved={(profile) => {
                setAuth((a) => ({ ...a, profile }));
                localStorage.setItem("shelem_profile", JSON.stringify(profile));
                // Name sofort auch am Tisch aktualisieren. avatarUrl bewusst
                // NICHT mitschicken (kann als base64 >1MB sein und würde
                // Socket.IOs Frame-Limit sprengen) - Server holt sich das
                // aktuelle Bild stattdessen frisch aus der DB (register-Handler).
                socket.emit("register", {
                  clientId: profile.id,
                  name: profile.name,
                });
              }}
            />
          )}

          {/* Popup Boden-Karten */}
          {showBottom && (
            <div style={styles.modalBackdrop}>
              <div style={styles.modal}>
                {/* Karten als Bilder im neuen Layout */}
                <div style={{ marginTop: 0, textAlign: "center" }}>
                  <button
                    style={{
                      ...styles.btn,
                      background: "#238747ff",
                      color: "#fff",
                    }}
                    onClick={() => {
                      socket.emit("takeBottomCards");
                      setShowBottom(false);
                    }}
                  >
                    برگ های زمین را دیدم
                  </button>
                </div>
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
                      size="md"
                      style={{
                        boxShadow: "0 8px 18px rgba(0,0,0,.35)",
                        border: "1px solid rgba(0,0,0,.12)",
                      }}
                    />
                  ))}
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
                      حاکم: {recap.bidderUsername || recap.bidderName || "-"} (
                      {recap.bidderTeam || "?"})
                    </span>
                    <span className="pill" style={styles.pill}>
                      هدف {recap.bid}
                    </span>

                    <span
                      className="pill"
                      style={{
                        ...styles.pill,
                        color:
                          recap.bidderTeam === "Fire"
                            ? recap.roundPoints.Fire >= recap.bid
                              ? "#16a34a"
                              : "#b91c1c"
                            : undefined,
                      }}
                    >
                      امتیاز این دست آتش: {recap.roundPoints.Fire}
                    </span>

                    <span
                      className="pill"
                      style={{
                        ...styles.pill,
                        color:
                          recap.bidderTeam === "Storm"
                            ? recap.roundPoints.Storm >= recap.bid
                              ? "#16a34a"
                              : "#b91c1c"
                            : undefined,
                      }}
                    >
                      امتیاز این دست طوفان: {recap.roundPoints.Storm}
                    </span>

                    {recap.ruleApplied === "doublePositive" && (
                      <span className="pill" style={styles.pill}>
                        دوبل 🤓 (+{recap.bid * 2})
                      </span>
                    )}
                    {recap.ruleApplied === "doubleNegative" && (
                      <span className="pill" style={styles.pill}>
                        دوبل ● █▀█▄🤜🤜🤜🤫 منفی (−{recap.bid * 2})
                      </span>
                    )}

                    <span className="pill" style={styles.pill}>
                      امتیاز کل آتش: {recap.teamScoresAfter.Fire}
                    </span>
                    <span className="pill" style={styles.pill}>
                      امتیاز کل طوفان: {recap.teamScoresAfter.Storm}
                    </span>
                  </div>

                  {/* Gewinnwahrscheinlichkeit des Hakem-Teams für diese Runde */}
                  <WinProbBlock
                    winProb={recap.winProb}
                    bid={recap.bid}
                    bidSuccess={recap.bidSuccess}
                  />
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
                      color: "#e9eef4",
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
                      background: "rgba(255,255,255,.06)",
                      padding: 4,
                      borderRadius: 10,
                      minHeight: 70,
                    }}
                  >
                    {recap.bottomCards.length === 0 && (
                      <div style={{ opacity: 0.6 }}>Keine Karten</div>
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
                      color: "#e9eef4",
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
                      background: "rgba(255,255,255,.06)",
                      padding: 4,
                      borderRadius: 10,
                      minHeight: 70,
                    }}
                  >
                    {recap.discarded.length === 0 && (
                      <div style={{ opacity: 0.6 }}>Keine Karten</div>
                    )}
                    {recap.discarded.map((c, i) => (
                      <div key={`d-${i}`} title={`Abwurfkarte ${i + 1}`}>
                        <SpriteCard code={c} size="sm" />
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ marginTop: 16 }}>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>دست ها</div>
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
          {/* WICHTIG: früher strikt "players.length === 4" - sobald ein Spieler
              nach 15s Disconnect aus players[] entfernt wurde, verschwand damit
              das GESAMTE Spielfeld (inkl. Geboten/Karten) für alle übrigen
              Mitspieler, nicht nur die Anzeige des Ausgeloggten. Jetzt reicht
              es, dass ich selbst einen Sitzplatz habe - Mitspieler ohne
              aktuellen Sitz werden von getSeatingOrder()/PlayerBox einfach
              als leere Stelle gerendert. */}
          {/* Tisch und Sitzauswahl schließen sich jetzt gegenseitig aus.
              Vorher standen beide gleichzeitig im DOM - mit dem großen
              ovalen Tisch sah man dadurch zwei Tische untereinander. */}
          {!roundNotStarted && (players.length === 4 || me?.seatPosition) && (
            <>
              {/* --- Punktestand: Gebot und Rundenpunkte gehören dem TEAM --- */}
              {(() => {
                const judge = (players || []).find((p) => p.id === judgeId);
                const declTeam = judge ? judge.team : null;          // "Fire" | "Storm"
                const oppTeam =
                  declTeam === "Fire" ? "Storm" : declTeam === "Storm" ? "Fire" : null;
                const label = (t) => (t === "Fire" ? "آتش" : "طوفان");
                const kind = (t) => (t === "Fire" ? "fire" : "storm");
                const pctOf = (v) =>
                  Math.max(0, Math.min(100, ((Number(v) || 0) / 1165) * 100));

                return (
                  <>
                    <div className="sh-scorebar">
                      <span className="sh-team sh-team--fire">
                        <span className="sh-dot" />
                        آتش <span className="sh-n">{scores.Fire}</span>
                      </span>
                      <div className="sh-track">
                        <i className="sh-fire" style={{ width: pctOf(scores.Fire) + "%" }} />
                      </div>

                      <span className="sh-goal">
                        هدف <b>{currentBid || "—"}</b>
                        {declTeam && (
                          <span className={"sh-decl sh-decl--" + kind(declTeam)}>
                            {label(declTeam)}
                          </span>
                        )}
                      </span>

                      <div className="sh-track">
                        <i className="sh-storm" style={{ width: pctOf(scores.Storm) + "%" }} />
                      </div>
                      <span className="sh-team sh-team--storm">
                        <span className="sh-n">{scores.Storm}</span> طوفان
                        <span className="sh-dot" />
                      </span>
                    </div>

                    {/* Nur die Punkte des GEGNERteams, und nur wenn die Option
                        aktiv ist. Ist sie aus, erscheint die Zeile gar nicht. */}
                    {showRoundPoints && oppTeam && (
                      <div className={"sh-roundpts sh-roundpts--" + kind(oppTeam)}>
                        <span className="sh-lbl">
                          امتیاز این دست — تیم {label(oppTeam)}
                        </span>
                        <span className="sh-val">
                          {faNum(roundPointsLive?.[oppTeam] ?? 0)}
                        </span>
                        <span className="sh-of">از ۱۶۵</span>
                      </div>
                    )}
                  </>
                );
              })()}

              {/* --- Ovaler Tisch --- */}
              {/* Während der Abwurfphase (discardPhase) ist der Tisch selbst
                  irrelevant (kein Stich läuft, nur "در انتظار کارت‌ها") und
                  die Hand kann bis zu 18 Karten haben - der Tisch bekommt
                  hier bewusst weniger Höhe, damit die Hand+Bestätigen-Leiste
                  ohne Scrollen sichtbar bleibt. */}
              <div className={"sh-tablewrap" + (discardPhase ? " sh-tablewrap--compact" : "")}>
                <div className="sh-table">
                  {/* Trumpf: vor dem Aufdecken ehrlich als "unbekannt" */}
                  <div className="sh-hud-tl">
                    {roundVariant === VARIANTS.NORMAL && trumpf ? (
                      <>
                        <div className="sh-trump">
                          <SuitIcon suit={trumpf} size={18} dark />
                          حکم
                        </div>
                        {trumpfSetter && (
                          <div className="sh-sub">
                            حاکم: {trumpfSetter.username || trumpfSetter.name}
                          </div>
                        )}
                      </>
                    ) : roundVariant === VARIANTS.FLIP ? (
                      <div className="sh-trump">نرس</div>
                    ) : (
                      <div className="sh-trump sh-trump--unknown">؟ حکم</div>
                    )}
                    {includeJokers && (
                      <div className="sh-sub">با جوکر</div>
                    )}
                  </div>

                  {/* Gespielte Karten - liegen dort, wo der Spieler sitzt.
                      Kein Name darunter: die Position sagt schon, wer gelegt hat. */}
                  <div className="sh-center">
                    <div className="sh-stack">
                      {(() => {
                        const order = currentTrick || [];
                        // WICHTIG: sowohl über die (stabile) userId als auch
                        // über die aktuelle socketId matchen. Vorher gab es
                        // bei fehlendem Match ein "?? 0"-Fallback auf Sitz 0
                        // (unten/ich) - dadurch konnte eine fremde Karte
                        // exakt auf meiner eigenen Position landen und sich
                        // mit meiner überlappen. Jetzt: kein Match = Karte
                        // wird lieber gar nicht gezeichnet statt falsch.
                        const id2seat = new Map();
                        seated.forEach((p, i) => {
                          if (!p) return;
                          if (p.id) id2seat.set(p.id, i);
                          if (p.userId) id2seat.set(p.userId, i);
                        });
                        // seated: 0 = unten (ich), 1 = rechts, 2 = oben, 3 = links
                        const SIDE = ["s", "e", "n", "w"];
                        const winnerId =
                          lastTrick && lastTrick.winner
                            ? lastTrick.winner.id || lastTrick.winner
                            : null;

                        if (!order.length) {
                          return (
                            <div className="sh-tablemsg">
                              <p>در انتظار کارت‌ها</p>
                            </div>
                          );
                        }

                        return order
                          .map((t, i) => {
                            const seat = id2seat.has(t.playerId)
                              ? id2seat.get(t.playerId)
                              : id2seat.has(t.userId)
                              ? id2seat.get(t.userId)
                              : null;
                            if (seat == null) return null;
                            const isWin = winnerId && t.playerId === winnerId;
                            return (
                              <div
                                key={`${t.playerId}-${t.card}-${i}`}
                                className={
                                  "sh-slot sh-slot--" + SIDE[seat] +
                                  (isWin ? " is-win" : "")
                                }
                              >
                                <SpriteCard code={t.card} size="md" />
                              </div>
                            );
                          })
                          .filter(Boolean);
                      })()}
                    </div>
                  </div>

                  <PlayerBox p={seated[2]} side="n" />
                  <PlayerBox p={seated[1]} side="e" />
                  <PlayerBox p={seated[3]} side="w" />
                  <PlayerBox p={seated[0]} side="s" youLabel />
                </div>
              </div>
            </>
          )}
          {/* Discard-Hinweis + Bestätigen */}
          {discardPhase && (
            <div className="sh-actions">
              <div className="sh-title">
                {faNum(discardTargetCount)} برگ برای خواباندن انتخاب کن
              </div>
              <div className="sh-row">
                <span className="sh-counter">
                  انتخاب‌شده <b>{faNum(selectedDiscard.length)}</b> /{" "}
                  {faNum(discardTargetCount)}
                </span>
                <button
                  className="sh-bidbtn sh-bidbtn--go"
                  onClick={confirmDiscard}
                  disabled={selectedDiscard.length !== discardTargetCount}
                >
                  تأیید خوابانده
                </button>
              </div>
            </div>
          )}
          {variantModal.open && (
            <div style={styles.modalBackdrop}>
              <div style={styles.modal}>
                {(() => {
                  const opts =
                    variantModal.options && variantModal.options.length
                      ? variantModal.options
                      : ["NORMAL", "FLIP"];

                  const suitOpts = ["♠", "♥", "♣", "♦"].filter((s) =>
                    opts.includes(s)
                  );
                  const hasSuitChoice = suitOpts.length > 0;
                  const hasFlipChoice = opts.includes("FLIP");
                  const hasNormalChoice = opts.includes("NORMAL");

                  if (hasSuitChoice) {
                    // Joker war erste Karte → Trumpf-Farbe oder Flip wählen
                    return (
                      <>
                        <h3
                          style={{
                            margin: 0,
                            fontWeight: 800,
                            textAlign: "center",
                          }}
                        >
                          حکم را انتخاب کن یا نرس بازی کن
                        </h3>
                        <p
                          style={{
                            textAlign: "center",
                            marginTop: 8,
                            fontSize: 13,
                          }}
                        >
                          با جوکر شروع کردی – یک خال را به عنوان حکم انتخاب کن
                          یا &quot;نرس&quot; (Flip) بازی کن.
                        </p>

                        <div
                          style={{
                            display: "flex",
                            gap: 10,
                            justifyContent: "center",
                            marginTop: 16,
                            flexWrap: "wrap",
                          }}
                        >
                          {/*SuitOs */}
                          {suitOpts.map((suit) => (
                            <button
                              key={suit}
                              style={{
                                ...styles.btn,
                                padding: "10px 14px",
                                borderRadius: 12,
                                background: "#e5e7eb",
                                minWidth: 70,
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                              onClick={() =>
                                socket.emit("setVariant", { variant: suit })
                              }
                            >
                              <SuitIcon suit={suit} size={32} />
                            </button>
                          ))}
                        </div>

                        {hasFlipChoice && (
                          <div
                            style={{
                              marginTop: 16,
                              textAlign: "center",
                            }}
                          >
                            <button
                              style={{
                                ...styles.btn,
                                background: "#fde68a",
                                color: "#3a2e05",
                                fontWeight: 800,
                                padding: "10px 24px",
                              }}
                              onClick={() =>
                                socket.emit("setVariant", { variant: "FLIP" })
                              }
                            >
                              🔄 نرس (Flip)
                            </button>
                          </div>
                        )}
                      </>
                    );
                  }

                  // Standard: Normal / Flip
                  return (
                    <>
                      <h3
                        style={{
                          margin: 0,
                          fontWeight: 800,
                          textAlign: "center",
                        }}
                      >
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
                        {hasNormalChoice && (
                          <button
                            style={{
                              ...styles.btn,
                              background: "#dbeafe",
                              color: "#1c3a5e",
                              fontWeight: 800,
                            }}
                            onClick={() =>
                              socket.emit("setVariant", {
                                variant: "NORMAL",
                              })
                            }
                          >
                            ▶️ معمولی
                          </button>
                        )}
                        {hasFlipChoice && (
                          <button
                            style={{
                              ...styles.btn,
                              background: "#fde68a",
                              color: "#3a2e05",
                              fontWeight: 800,
                            }}
                            onClick={() =>
                              socket.emit("setVariant", { variant: "FLIP" })
                            }
                          >
                            🔄 نرس
                          </button>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Bieten */}
          {/* WICHTIG: zusätzlich "!me?.passed" prüfen - reine Absicherung gegen
              serverseitige Fälle, in denen "isMyTurn" fälschlich true wird,
              obwohl dieser Spieler schon gepasst hat (z.B. bei einem stale
              currentPlayerIndex nach Reconnect). Ein Spieler, der gepasst hat,
              soll das Gebot-Popup nie wieder sehen. */}
          {showBidModal && (
            <div className="sh-sheet">
              <div className="sh-sheetbox" style={{ maxWidth: 420 }}>
                <div className="sh-sheethd" style={{ justifyContent: "center" }}>
                  <h2>مزایده</h2>
                </div>

                <div
                  className="sh-title"
                  style={{ marginBottom: 14, textAlign: "center" }}
                >
                  {currentBid
                    ? <>بالاترین پیشنهاد الان <b>{currentBid}</b> است</>
                    : "هنوز پیشنهادی ثبت نشده"}
                </div>

                <div className="sh-row">
                  <button
                    className="sh-bidbtn sh-bidbtn--pass"
                    onClick={() => makeBid(0)}
                    disabled={mustBidNow}
                    title={
                      mustBidNow
                        ? "تو آخرین بازیکن فعالی - باید پیشنهاد بدهی"
                        : "پاس"
                    }
                  >
                    پاس
                  </button>

                  <button
                    className="sh-step"
                    onClick={() => setMyBid((prev) => Math.max(prev - 5, minBid))}
                    disabled={myBid <= minBid}
                  >
                    −
                  </button>

                  <div className="sh-bidval">
                    {myBid || minBid}
                    <small>پیشنهاد تو</small>
                  </div>

                  <button
                    className="sh-step"
                    onClick={() => setMyBid((prev) => Math.min(prev + 5, maxBid))}
                    disabled={myBid >= maxBid}
                  >
                    +
                  </button>

                  <button
                    className="sh-bidbtn sh-bidbtn--go"
                    onClick={() => makeBid(myBid)}
                  >
                    ثبت پیشنهاد
                  </button>
                </div>

                {mustBidNow && (
                  <div className="sh-msg sh-msg--err">
                    همه پاس کرده‌اند — تو باید پیشنهاد بدهی
                  </div>
                )}
              </div>
            </div>
          )}
          {/* Hand — LTR-Fächer: jede nächste Karte deckt die RECHTE Seite der
              vorigen ab, damit die obere linke Ecke mit dem aufrechten Index
              sichtbar bleibt. Vorher lag die kopfstehende Ecke unten frei. */}
          <div className="sh-handzone">
            <div className="sh-fan">
              {(() => {
                const list = [...hand].reverse();          // Trumpf bleibt rechts
                const n = list.length;
                const mid = (n - 1) / 2;

                // Überlappung hängt jetzt von der Kartenzahl ab statt fix zu
                // sein: bei wenigen Karten (normale Hand) mehr Abstand zum
                // leichteren Tippen, bei vielen Karten (Joker-Runde beim
                // Abwerfen: bis zu 18) automatisch etwas enger, damit noch
                // alle in einer Reihe Platz finden, statt einzelne Karten
                // komplett zu verdecken.
                // Bei vielen Karten (Joker-Runde beim Abwerfen: bis zu 18)
                // wird der Bogen sonst SEHR hoch (lift wächst mit der
                // Kartenzahl^1.85) und sprengt die verfügbare Höhe. Bei
                // großen Händen daher flacherer Bogen, bei normalen 12
                // Karten bleibt der volle, ausgeprägte Bogen erhalten.
                const liftCoef = n <= 12 ? 1.35 : n <= 15 ? 0.95 : 0.68;

                // Überlappung hängt ebenfalls von der Kartenzahl ab: bei
                // wenigen Karten (normale Hand) mehr Abstand zum leichteren
                // Tippen, bei vielen Karten automatisch etwas enger, damit
                // noch alle in einer Reihe Platz finden.
                const overlapFrac =
                  n <= 8 ? 0.36 :
                  n <= 10 ? 0.40 :
                  n <= 12 ? 0.44 :
                  n <= 14 ? 0.50 :
                  n <= 16 ? 0.55 :
                  0.60;

                return list.map((card, i) => {
                  const isSelected = selectedDiscard.includes(card);
                  const canSelectMore = selectedDiscard.length < discardTargetCount;
                  const inDiscard = discardPhase;

                  const onClick = () => {
                    if (inDiscard) {
                      if (isSelected || canSelectMore) toggleDiscard(card);
                    } else if (biddingWinner && isMyTurn) {
                      playCard(card);
                    }
                  };

                  const disabled =
                    (inDiscard && !isSelected && !canSelectMore) ||
                    (!inDiscard && (!biddingWinner || !isMyTurn));

                  // Bogen verstärkt (mehr Rotation + mehr Höhenversatz pro
                  // Karte), damit die obere linke Ecke (Rang/Farbe-Index)
                  // jeder Karte trotz Überlappung klar sichtbar bleibt.
                  const rot = (i - mid) * 4.4;
                  const lift = Math.pow(Math.abs(i - mid), 1.85) * liftCoef;
                  const raise = inDiscard && isSelected ? -20 : 0;

                  return (
                    <button
                      key={card}
                      className={
                        "sh-cardbtn" +
                        (inDiscard && isSelected ? " is-sel" : "") +
                        (inDiscard && !isSelected && !canSelectMore ? " is-dim" : "")
                      }
                      onClick={onClick}
                      disabled={disabled}
                      aria-pressed={isSelected}
                      title={
                        inDiscard
                          ? isSelected
                            ? "برداشتن از خوابانده"
                            : "انتخاب برای خوابانده"
                          : card
                      }
                      style={{
                        transform: `rotate(${rot}deg) translateY(${lift + raise}px)`,
                        zIndex: i * 2 + (isSelected ? 1 : 0),
                        marginLeft:
                          i === 0
                            ? undefined
                            : `calc(var(--card-w) * -${overlapFrac})`,
                      }}
                    >
                      <SpriteCard
                        code={card}
                        size="lg"
                        style={{ width: "var(--card-w)", height: "var(--card-h)" }}
                      />
                    </button>
                  );
                });
              })()}
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
                  <h3 style={{ margin: 0, fontWeight: 800 }}>Statistik · آمار</h3>
                  <button
                    className="close"
                    style={styles.btn}
                    onClick={() => setShowStats(false)}
                  >
                    بستن
                  </button>
                </div>

                {/* Reiter */}
                <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
                  {[
                    { k: "rounds", t: "دست‌ها · Runden" },
                    { k: "players", t: "سطح بازیکنان · Level" },
                    { k: "pairs", t: "آمار یاران · Duos" },
                  ].map((tab) => (
                    <button
                      key={tab.k}
                      onClick={() => setStatsTab(tab.k)}
                      style={{
                        ...styles.btn,
                        padding: "6px 12px",
                        borderRadius: 999,
                        fontWeight: 800,
                        background: statsTab === tab.k ? "#111" : "#e5e7eb",
                        color: statsTab === tab.k ? "#fff" : "#111",
                      }}
                    >
                      {tab.t}
                    </button>
                  ))}
                  {statsTab !== "rounds" && (
                    <button
                      onClick={loadOverview}
                      style={{ ...styles.btn, padding: "6px 12px", borderRadius: 999 }}
                      title="Statistik neu laden"
                    >
                      ⟳
                    </button>
                  )}
                </div>

                {statsTab === "players" &&
                  (overviewState.loading ? (
                    <div style={{ marginTop: 12 }}>در حال بارگذاری…</div>
                  ) : overviewState.error ? (
                    <StatsError msg={overviewState.error} onRetry={loadOverview} />
                  ) : (
                    <PlayerLevelPanel
                      players={overview.players}
                      meId={auth?.profile?.id}
                    />
                  ))}

                {statsTab === "pairs" &&
                  (overviewState.loading ? (
                    <div style={{ marginTop: 12 }}>در حال بارگذاری…</div>
                  ) : overviewState.error ? (
                    <StatsError msg={overviewState.error} onRetry={loadOverview} />
                  ) : (
                    <PairStatsPanel pairs={overview.pairs} />
                  ))}

                {statsTab !== "rounds" ? null : !roundsHistory ||
                  roundsHistory.length === 0 ? (
                  <div style={{ marginTop: 12 }}>دستی وجود ندارد</div>
                ) : (
                  <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                    {roundsHistory.map((r) => {
                      const isOpen = !!expandedRounds[r.round];

                      const firePts = r.roundPoints?.Fire ?? 0;
                      const stormPts = r.roundPoints?.Storm ?? 0;
                      const bid = r.bid || 0;

                      let fireColor;
                      let stormColor;

                      if (r.bidderTeam === "Fire") {
                        const ok = firePts >= bid;
                        fireColor = ok ? "#16a34a" : "#b91c1c"; // grün / rot
                      } else if (r.bidderTeam === "Storm") {
                        const ok = stormPts >= bid;
                        stormColor = ok ? "#16a34a" : "#b91c1c";
                      }
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
                              دست {r.round}
                              {r.trumpf ? ` · حکم: ${r.trumpf}` : "نرس"}
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
                                حاکم: {r.bidderUsername || r.bidderName || "-"}{" "}
                                ({r.bidderTeam || "?"})
                              </span>
                              <span className="pill" style={styles.pill}>
                                هدف: {r.bid || 0}
                              </span>
                              {r.winProb?.deal?.p != null && (
                                <span
                                  className="pill"
                                  style={{
                                    ...styles.pill,
                                    color: probColor(r.winProb.deal.p),
                                  }}
                                  title="Wahrscheinlichkeit, dass der Hakem sein Gebot erfüllt (Monte-Carlo)"
                                >
                                  🎲 شانس: {pct(r.winProb.deal.p)}
                                </span>
                              )}
                              <span
                                className="pill"
                                style={{ ...styles.pill, color: fireColor }}
                              >
                                امتیاز دست آتش: {firePts}
                              </span>
                              <span
                                className="pill"
                                style={{ ...styles.pill, color: stormColor }}
                              >
                                امتیاز دست طوفان: {stormPts}
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

                              {/* Gewinnwahrscheinlichkeit dieser Runde */}
                              <WinProbBlock
                                winProb={r.winProb}
                                bid={r.bid || 0}
                                bidSuccess={r.bidSuccess}
                                compact
                              />

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