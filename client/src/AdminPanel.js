import React, { useEffect, useState, useCallback } from "react";

// Vertikaler Balken-Chart – dependency-frei, verzerrungsfrei (CSS-Flexbox).
function BarChart({ data, height = 170, color = "#e9bb55" }) {
  const rows = Array.isArray(data) ? data : [];
  const max = Math.max(1, ...rows.map((d) => d.value || 0));
  const barMax = height - 46; // Platz für Wert oben + Label unten
  if (rows.length === 0) {
    return (
      <div style={{ color: "#93a3b5", fontSize: 12, padding: "20px 0", textAlign: "center" }}>
        داده‌ای موجود نیست.
      </div>
    );
  }
  return (
    <div style={{ overflowX: "auto", overflowY: "hidden", paddingBottom: 4 }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: rows.length <= 6 ? "space-around" : "flex-start",
          gap: 12,
          minHeight: height,
          padding: "6px 4px 0",
        }}
      >
        {rows.map((d, i) => {
          const h = Math.max(2, ((d.value || 0) / max) * barMax);
          return (
            <div
              key={i}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                flex: "0 0 auto",
                width: 56,
              }}
            >
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 800,
                  color: "#c9d4e0",
                  height: 16,
                  marginBottom: 4,
                }}
              >
                {d.value || ""}
              </div>
              <div
                style={{
                  width: 38,
                  height: h,
                  background: color,
                  borderRadius: "6px 6px 2px 2px",
                  opacity: 0.92,
                }}
              />
              <div
                style={{
                  fontSize: 10.5,
                  color: "#93a3b5",
                  marginTop: 7,
                  textAlign: "center",
                  lineHeight: 1.35,
                  wordBreak: "break-word",
                  minHeight: 26,
                }}
              >
                {d.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const card = {
  background: "#161e28",
  border: "1px solid #26313f",
  borderRadius: 14,
  padding: 16,
  marginBottom: 14,
};
const h3 = { fontSize: 15, fontWeight: 800, marginBottom: 12, color: "#e9eef4" };
const btn = {
  fontFamily: "inherit",
  cursor: "pointer",
  borderRadius: 10,
  fontWeight: 800,
  fontSize: 13.5,
  padding: "9px 14px",
  border: "1px solid #26313f",
  background: "#1e2833",
  color: "#c9d4e0",
};
const btnGold = { ...btn, background: "#e9bb55", border: "1px solid #c99e34", color: "#1c1406" };
const inp = {
  width: "100%",
  padding: "9px 11px",
  borderRadius: 9,
  border: "1px solid #26313f",
  background: "#0e151d",
  color: "#e9eef4",
  fontSize: 14,
};

export default function AdminPanel({ token, apiBase, onClose }) {
  const [summary, setSummary] = useState(null);
  const [users, setUsers] = useState(null);
  const [activity, setActivity] = useState(null);
  const [hours, setHours] = useState(null);
  const [timeline, setTimeline] = useState(null);
  const [gran, setGran] = useState("month");
  const [mpN, setMpN] = useState("");
  const [mpJ, setMpJ] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const api = useCallback(
    async (path, opts = {}) => {
      const res = await fetch(`${apiBase}${path}`, {
        ...opts,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(opts.headers || {}),
        },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      return body;
    },
    [apiBase, token]
  );

  const loadTimeline = useCallback(
    (g) => {
      api(`/api/admin/games/timeline?granularity=${g}`)
        .then((r) => setTimeline(r.data || []))
        .catch(() => setTimeline([]));
    },
    [api]
  );

  useEffect(() => {
    api("/api/admin/summary")
      .then((s) => {
        setSummary(s);
        if (s.settings) {
          setMpN(String(s.settings.maxPointsNormal ?? ""));
          setMpJ(String(s.settings.maxPointsJokers ?? ""));
        }
      })
      .catch((e) => setMsg("خطا: " + e.message));
    api("/api/admin/users").then(setUsers).catch(() => {});
    api("/api/admin/activity").then(setActivity).catch(() => {});
    api("/api/admin/hours").then(setHours).catch(() => {});
    loadTimeline("month");
  }, [api, loadTimeline]);

  const saveSettings = async () => {
    setBusy(true);
    setMsg("");
    try {
      const r = await api("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify({
          maxPointsNormal: Number(mpN),
          maxPointsJokers: Number(mpJ),
        }),
      });
      setMpN(String(r.settings.maxPointsNormal));
      setMpJ(String(r.settings.maxPointsJokers));
      setMsg("✅ ذخیره شد");
    } catch (e) {
      setMsg("خطا: " + e.message);
    }
    setBusy(false);
  };

  const resetStats = async () => {
    if (
      !window.confirm(
        "آمار کاملاً پاک و از روی داده‌های بازی‌ها دوباره محاسبه می‌شود. ادامه؟"
      )
    )
      return;
    setBusy(true);
    setMsg("");
    try {
      const r = await api("/api/admin/stats/reset", { method: "POST" });
      setMsg(`✅ بازسازی شد: ${r.players} بازیکن، ${r.pairs} جفت`);
    } catch (e) {
      setMsg("خطا: " + e.message);
    }
    setBusy(false);
  };

  const switchGran = (g) => {
    setGran(g);
    loadTimeline(g);
  };

  const K = ({ label, value }) => (
    <div
      style={{
        flex: "1 1 90px",
        background: "#0e151d",
        border: "1px solid #26313f",
        borderRadius: 12,
        padding: "12px 10px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 900, color: "#e9bb55" }}>
        {value ?? "—"}
      </div>
      <div style={{ fontSize: 11, color: "#93a3b5", marginTop: 2 }}>{label}</div>
    </div>
  );

  const maxAct = Math.max(1, ...(activity?.players || []).map((p) => p.games || 0));

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "radial-gradient(circle at 50% 0%, #1a2430, #0b1016 60%)",
        color: "#e9eef4",
        direction: "rtl",
        overflowY: "auto",
        padding: "16px 12px 40px",
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 900 }}>🛠️ بخش مدیریت</div>
          <span style={{ flex: 1 }} />
          <button style={btn} onClick={onClose}>
            بستن ✕
          </button>
        </div>

        {msg && (
          <div
            style={{
              ...card,
              padding: "10px 14px",
              borderColor: "rgba(233,187,85,.4)",
              color: "#e9bb55",
            }}
          >
            {msg}
          </div>
        )}

        {/* Kennzahlen */}
        <div style={card}>
          <div style={h3}>📊 نمای کلی</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <K label="بازیکنان ثبت‌شده" value={summary?.userCount} />
            <K label="بازیکنان فعال" value={summary?.activePlayerCount} />
            <K label="کل بازی‌ها" value={summary?.gameCount} />
            <K label="تمام‌شده" value={summary?.finishedCount} />
            <K label="در حال بازی" value={summary?.activeCount} />
          </div>
        </div>

        {/* Einstellungen */}
        <div style={card}>
          <div style={h3}>⚙️ تنظیمات بازی</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <label style={{ flex: "1 1 200px", fontSize: 13 }}>
              سقف امتیاز — عادی (MAX_POINTS_NORMAL)
              <input
                style={{ ...inp, marginTop: 6 }}
                type="number"
                value={mpN}
                onChange={(e) => setMpN(e.target.value)}
              />
            </label>
            <label style={{ flex: "1 1 200px", fontSize: 13 }}>
              سقف امتیاز — جوکر (MAX_POINTS_JOKERS)
              <input
                style={{ ...inp, marginTop: 6 }}
                type="number"
                value={mpJ}
                onChange={(e) => setMpJ(e.target.value)}
              />
            </label>
          </div>
          <div style={{ marginTop: 12 }}>
            <button style={btnGold} disabled={busy} onClick={saveSettings}>
              ذخیره تنظیمات
            </button>
            <span style={{ fontSize: 11, color: "#93a3b5", marginRight: 10 }}>
              برای بازی‌های جدید اعمال می‌شود.
            </span>
          </div>
        </div>

        {/* Statistik zurücksetzen */}
        <div style={card}>
          <div style={h3}>♻️ بازسازی آمار</div>
          <div style={{ fontSize: 12.5, color: "#93a3b5", marginBottom: 10 }}>
            آمار بازیکنان و جفت‌ها پاک و از روی بازی‌های ذخیره‌شده دوباره محاسبه
            می‌شود (بدون مقادیر قدیمی یا تکراری).
          </div>
          <button style={btn} disabled={busy} onClick={resetStats}>
            پاک‌سازی و محاسبهٔ مجدد
          </button>
        </div>

        {/* Spiele-Timeline */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={h3}>📈 بازی‌ها در طول زمان</div>
            <span style={{ flex: 1 }} />
            <div style={{ display: "flex", gap: 6 }}>
              {[
                ["day", "روز"],
                ["month", "ماه"],
                ["year", "سال"],
              ].map(([g, lbl]) => (
                <button
                  key={g}
                  onClick={() => switchGran(g)}
                  style={gran === g ? { ...btnGold, padding: "6px 12px" } : { ...btn, padding: "6px 12px" }}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>
          <BarChart
            data={(timeline || []).map((d) => ({ label: d.period, value: d.count }))}
            color="#3a8ee0"
          />
        </div>

        {/* Spielzeiten */}
        <div style={card}>
          <div style={h3}>🕐 زمان‌های پربازی</div>
          <BarChart
            data={(hours?.buckets || []).map((b) => ({
              label: `${b.label}`,
              value: b.count,
            }))}
            color="#1d9166"
          />
        </div>

        {/* Spiel-Kennzahlen (statt redundanter Team-Statistik) */}
        <div style={card}>
          <div style={h3}>🎲 آمار بازی‌ها</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <K label="میانگین مدت (دقیقه)" value={summary?.avgDurationMin} />
            <K label="میانگین دست در هر بازی" value={summary?.avgRounds} />
            <K label="بیشترین بازیِ همزمان" value={summary?.peakConcurrent} />
            <K
              label="نرخ تکمیل"
              value={
                summary && summary.gameCount
                  ? Math.round((summary.finishedCount / summary.gameCount) * 100) + "٪"
                  : "—"
              }
            />
          </div>
        </div>

        {/* Aktivste Spieler */}
        <div style={card}>
          <div style={h3}>🏆 فعال‌ترین بازیکنان</div>
          {(activity?.players || []).slice(0, 15).map((p, i) => (
            <div key={p.id} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", fontSize: 12.5, marginBottom: 3 }}>
                <span style={{ color: "#93a3b5", marginLeft: 6 }}>{i + 1}.</span>
                <span style={{ fontWeight: 600 }}>{p.name || p.username}</span>
                <span style={{ flex: 1 }} />
                <span style={{ color: "#93a3b5" }}>
                  {p.games} بازی · {p.wins} برد
                </span>
              </div>
              <div style={{ background: "#0e151d", borderRadius: 6, height: 10 }}>
                <div
                  style={{
                    width: `${(p.games / maxAct) * 100}%`,
                    height: "100%",
                    borderRadius: 6,
                    background: "#e9bb55",
                  }}
                />
              </div>
            </div>
          ))}
          {activity && (activity.players || []).length === 0 && (
            <div style={{ fontSize: 12, color: "#93a3b5" }}>هنوز بازی‌ای ثبت نشده.</div>
          )}
        </div>

        {/* Registrierte Spieler */}
        <div style={card}>
          <div style={h3}>
            👥 بازیکنان ثبت‌شده {users ? `(${users.count})` : ""}
          </div>
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {(users?.users || []).map((u) => (
              <div
                key={u.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 0",
                  borderBottom: "1px solid #1e2833",
                  fontSize: 13,
                }}
              >
                <span style={{ fontWeight: 700 }}>{u.name || u.username}</span>
                <span style={{ color: "#93a3b5", fontSize: 11 }}>@{u.username}</span>
                {u.role === "admin" || u.username === "admin" ? (
                  <span style={{ fontSize: 10, color: "#e9bb55" }}>مدیر</span>
                ) : null}
                <span style={{ flex: 1 }} />
                <span style={{ color: "#93a3b5", fontSize: 11 }}>
                  {u.gamesPlayed} بازی
                  {u.levelTitle ? ` · ${u.levelTitle}` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
