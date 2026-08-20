// Regressionstest fuer: "Nach der zweiten Runde wird der bid bei den
// falschen Spielern angezeigt" (z.B. Bid von Spieler A erscheint zusaetzlich
// oder anstelle bei Spieler B).
//
// Stellt einen echten Server-Prozess hoch (keine echte Postgres-DB noetig,
// s. dbPing()-Fix in index.js), verbindet 4 echte Socket.IO-Clients, spielt
// mehrere komplette Runden automatisch durch und prueft nach JEDEM
// Rundenwechsel, dass niemals zwei unterschiedliche Spieler gleichzeitig
// denselben (nicht-null) lastBid-Wert zeigen.
//
// Ausfuehren:  node --test server/test/round-transition-bid-isolation.test.js
// (benoetigt: npm install socket.io-client --save-dev, s. package.json)

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { io as ioc } from "socket.io-client";
import jwt from "jsonwebtoken";

const PORT = 5099;
const JWT_SECRET = "test_secret_fuer_regressionstest";
const SERVER_URL = `http://localhost:${PORT}`;
const ROUNDS_TO_PLAY = 6; // deckt mehrere Rundenwechsel ab, nicht nur Runde 1->2

const USERS = [
  { id: "test-u1", name: "Storm 100", username: "storm100" },
  { id: "test-u2", name: "Fire 105", username: "fire105" },
  { id: "test-u3", name: "Storm 200", username: "storm200" },
  { id: "test-u4", name: "Fire 210", username: "fire210" },
];

let serverProc;

before(async () => {
  serverProc = spawn("node", ["index.js"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, PORT: String(PORT), JWT_SECRET, DATABASE_URL: "" },
    stdio: "pipe",
  });
  await new Promise((resolve, reject) => {
    let out = "";
    const onData = (d) => {
      out += d.toString();
      if (out.includes("Server läuft auf Port")) {
        serverProc.stdout.off("data", onData);
        resolve();
      }
    };
    serverProc.stdout.on("data", onData);
    serverProc.on("error", reject);
    setTimeout(() => reject(new Error("Server-Start Timeout:\n" + out)), 10000);
  });
});

after(() => {
  if (serverProc) serverProc.kill();
});

function token(u) {
  return jwt.sign({ sub: u.id, name: u.name, username: u.username }, JWT_SECRET, {
    expiresIn: "1h",
  });
}

test("Bid-Badge bleibt nach jedem Rundenwechsel eindeutig dem richtigen Spieler zugeordnet", async () => {
  const sockets = {};
  const hands = {};
  let latestPlayers = [];
  let roomId = null;
  let roundCounter = 0;
  let biddingActive = false;
  const allBiddingSnapshots = []; // { round, snapshot: [{userId,name,lastBid}] }
  const crossContaminations = [];

  function checkSnapshotForContamination(round, list) {
    const seen = new Map();
    for (const p of list.filter((p) => p.lastBid != null)) {
      if (seen.has(p.lastBid)) {
        const other = seen.get(p.lastBid);
        if (other.userId !== p.userId) {
          crossContaminations.push({
            round,
            bid: p.lastBid,
            a: { name: p.name, userId: p.userId },
            b: { name: other.name, userId: other.userId },
          });
        }
      } else {
        seen.set(p.lastBid, p);
      }
    }
  }

  function connectUser(u) {
    return new Promise((resolve) => {
      const s = ioc(SERVER_URL, {
        auth: { token: token(u) },
        transports: ["websocket"],
      });
      sockets[u.id] = s;

      s.on("connect", () => resolve());

      s.on("roomJoined", ({ roomId: rid }) => {
        roomId = rid;
        s.emit("register", { clientId: u.id, name: u.name });
      });

      s.on("hand", (cards) => {
        hands[u.id] = cards;
      });

      s.on("playersUpdate", (list) => {
        latestPlayers = list;
        if (biddingActive) {
          const snap = list.map((p) => ({
            userId: p.userId,
            name: p.name,
            lastBid: p.lastBid,
          }));
          allBiddingSnapshots.push({ round: roundCounter, snapshot: snap });
          checkSnapshotForContamination(roundCounter, snap);
        }
      });

      s.on("yourTurn", ({ currentBid, mustBid }) => {
        const mine = latestPlayers.find((p) => p.userId === u.id);
        const already = mine?.lastBid;
        setTimeout(() => {
          if (mustBid) {
            s.emit("makeBid", Math.max(100, currentBid + 5));
          } else if (!already && Math.random() < 0.6) {
            s.emit("makeBid", Math.max(100, currentBid + 5));
          } else {
            s.emit("makeBid", 0);
          }
        }, 10);
      });

      s.on("biddingResult", () => {
        biddingActive = false;
      });

      s.on("showBottomCards", () => {
        setTimeout(() => s.emit("takeBottomCards"), 10);
      });

      s.on("discardPhase", ({ hand, bottomSize }) => {
        setTimeout(() => s.emit("discardCards", hand.slice(0, bottomSize)), 10);
      });

      s.on("askVariant", () => {
        setTimeout(() => s.emit("setVariant", { variant: "NORMAL" }), 10);
      });

      let trick = [];
      s.on("cardPlayed", ({ userId, card }) => {
        trick.push({ userId, card });
        if (trick.length > 4) trick = trick.slice(-4);
      });
      s.on("trickResult", () => {
        trick = [];
      });

      s.on("turnUpdate", ({ currentPlayer }) => {
        if (biddingActive) return;
        if (!currentPlayer || currentPlayer.userId !== u.id) return;
        const h = hands[u.id] || [];
        if (!h.length) return;
        setTimeout(() => {
          const leadSuit = trick.length ? trick[0].card.slice(-1) : null;
          let card = h[0];
          if (leadSuit) {
            const matching = h.find((c) => c.slice(-1) === leadSuit);
            if (matching) card = matching;
          }
          s.emit("playCard", card);
        }, 10);
      });

      s.on("roundEnd", () => {
        roundCounter++;
        biddingActive = true;
      });

      s.connect();
    });
  }

  for (const u of USERS) await connectUser(u);
  await new Promise((r) => setTimeout(r, 300));

  sockets[USERS[0].id].emit("createRoom", { name: "TestRoom" });
  await new Promise((r) => setTimeout(r, 300));
  for (let i = 1; i < USERS.length; i++) {
    sockets[USERS[i].id].emit("joinRoom", { roomId });
    await new Promise((r) => setTimeout(r, 150));
  }
  await new Promise((r) => setTimeout(r, 300));

  for (let i = 0; i < USERS.length; i++) {
    sockets[USERS[i].id].emit("chooseSeat", { seat: i + 1 });
    await new Promise((r) => setTimeout(r, 150));
  }
  await new Promise((r) => setTimeout(r, 300));

  biddingActive = true;
  sockets[USERS[0].id].emit("startGame");

  const t0 = Date.now();
  while (roundCounter < ROUNDS_TO_PLAY && Date.now() - t0 < 60000) {
    await new Promise((r) => setTimeout(r, 100));
  }

  for (const s of Object.values(sockets)) s.close();

  assert.ok(
    roundCounter >= ROUNDS_TO_PLAY,
    `Simulation kam nicht durch alle ${ROUNDS_TO_PLAY} Runden (nur ${roundCounter} beendet) - Testaufbau pruefen`
  );
  assert.ok(
    allBiddingSnapshots.length > 0,
    "Keine playersUpdate-Snapshots waehrend Bidding-Phasen erfasst - Testaufbau pruefen"
  );

  assert.deepStrictEqual(
    crossContaminations,
    [],
    `Bid-Badge wurde faelschlich bei mehreren Spielern gleichzeitig angezeigt: ${JSON.stringify(
      crossContaminations,
      null,
      2
    )}`
  );
});
