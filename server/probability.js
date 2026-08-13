// probability.js
// -----------------------------------------------------------------------------
// Monte-Carlo-Schätzung: Wie wahrscheinlich war es, dass das Team des Hakem
// (Bid-Gewinner) sein Gebot erfüllt?
//
// Zwei Sichtweisen werden berechnet:
//   1) "hakem" – nur die eigenen 12 Karten (nach Boden-Tausch) sind bekannt,
//      die restlichen 36 Karten werden zufällig auf die drei anderen verteilt.
//      => "Wie riskant war das Gebot mit dieser Hand?"
//   2) "deal"  – die tatsächliche Verteilung aller vier Hände ist bekannt,
//      nur der Spielverlauf wird simuliert.
//      => "Wie gut lagen die Karten wirklich?"
//
// Die Spiel-Policy ist für beide Teams identisch (symmetrisch), damit die
// Wahrscheinlichkeit nicht künstlich zugunsten einer Seite verzerrt wird.
// -----------------------------------------------------------------------------

const RANK_ORDER = [
  "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A",
  "JOKER_BW",
  "JOKER",
];

const SUITS = ["♠", "♥", "♣", "♦"];
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

export function fullDeck(includeJokers) {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push(`${r}${s}`);
  if (includeJokers) {
    deck.push("JOKER_BW");
    deck.push("JOKER");
  }
  return deck;
}

function splitCard(card) {
  if (card === "JOKER_BW") return { rank: "JOKER_BW", suit: "R" };
  if (card === "JOKER") return { rank: "JOKER", suit: "R" };
  return { rank: card.slice(0, -1), suit: card.slice(-1) };
}

export function cardPoints(card) {
  if (card === "JOKER_BW") return 15;
  if (card === "JOKER") return 20;
  const rank = card.slice(0, -1);
  if (rank === "A" || rank === "10") return 10;
  if (rank === "5") return 5;
  return 0;
}

// Farbe der Karte fürs Bedienen (spiegelt cardSuitForPlay aus index.js)
function playSuit(card, trumpSuit, isFlip) {
  if (card === "JOKER_BW") return isFlip ? "♠" : trumpSuit || "R";
  if (card === "JOKER") return isFlip ? "♥" : trumpSuit || "R";
  return card.slice(-1);
}

// Angespielte Farbe des Stichs (spiegelt getLeadSuit aus index.js)
function leadSuitOf(firstCard, trumpSuit, isFlip) {
  if (firstCard === "JOKER" || firstCard === "JOKER_BW") {
    if (isFlip) return firstCard === "JOKER_BW" ? "♠" : "♥";
    return trumpSuit || "R";
  }
  return firstCard.slice(-1);
}

// Identisch zur Vergleichslogik in index.js
function compareCards(cardA, cardB, leadSuit, trumpSuit, isFlip = false) {
  const a = splitCard(cardA);
  const b = splitCard(cardB);
  const isJokerA = a.rank === "JOKER" || a.rank === "JOKER_BW";
  const isJokerB = b.rank === "JOKER" || b.rank === "JOKER_BW";

  if (isFlip) {
    const suitA = a.rank === "JOKER_BW" ? "♠" : a.rank === "JOKER" ? "♥" : a.suit;
    const suitB = b.rank === "JOKER_BW" ? "♠" : b.rank === "JOKER" ? "♥" : b.suit;
    const aLed = suitA === leadSuit;
    const bLed = suitB === leadSuit;
    if (aLed && !bLed) return 1;
    if (!aLed && bLed) return -1;
    if (aLed && bLed) {
      const ia = RANK_ORDER.indexOf(a.rank);
      const ib = RANK_ORDER.indexOf(b.rank);
      if (ia === -1 || ib === -1) return 0;
      const diff = ib - ia; // kleine Karte = stark
      if (diff > 0) return 1;
      if (diff < 0) return -1;
      return 0;
    }
    return 0;
  }

  if (isJokerA || isJokerB) {
    if (isJokerA && isJokerB) {
      const ia = RANK_ORDER.indexOf(a.rank);
      const ib = RANK_ORDER.indexOf(b.rank);
      return ia > ib ? 1 : ia < ib ? -1 : 0;
    }
    return isJokerA ? 1 : -1;
  }

  const suitA = a.suit;
  const suitB = b.suit;
  if (suitA === trumpSuit && suitB !== trumpSuit) return 1;
  if (suitB === trumpSuit && suitA !== trumpSuit) return -1;
  if (suitA === trumpSuit && suitB === trumpSuit) {
    const ia = RANK_ORDER.indexOf(a.rank);
    const ib = RANK_ORDER.indexOf(b.rank);
    return ia > ib ? 1 : ia < ib ? -1 : 0;
  }
  if (suitA === leadSuit && suitB !== leadSuit) return 1;
  if (suitB === leadSuit && suitA !== leadSuit) return -1;
  if (suitA === leadSuit && suitB === leadSuit) {
    const ia = RANK_ORDER.indexOf(a.rank);
    const ib = RANK_ORDER.indexOf(b.rank);
    return ia > ib ? 1 : ia < ib ? -1 : 0;
  }
  return 0;
}

// Totale Ordnung der Kartenstärke innerhalb eines Stichs (konsistent zu compareCards)
function strength(card, leadSuit, trumpSuit, isFlip) {
  const { rank, suit } = splitCard(card);
  const isJoker = rank === "JOKER" || rank === "JOKER_BW";
  if (isFlip) {
    const s = rank === "JOKER_BW" ? "♠" : rank === "JOKER" ? "♥" : suit;
    if (leadSuit && s !== leadSuit) return -1;
    return 100 - RANK_ORDER.indexOf(rank); // "2" am stärksten
  }
  if (isJoker) return 300 + RANK_ORDER.indexOf(rank);
  if (trumpSuit && suit === trumpSuit) return 200 + RANK_ORDER.indexOf(rank);
  if (leadSuit && suit === leadSuit) return 100 + RANK_ORDER.indexOf(rank);
  if (!leadSuit) return 100 + RANK_ORDER.indexOf(rank); // Anspiel: eigene Farbe
  return RANK_ORDER.indexOf(rank);
}

function legalCards(hand, leadSuit, trumpSuit, isFlip) {
  if (!leadSuit || leadSuit === "R") return hand;
  const follow = hand.filter((c) => playSuit(c, trumpSuit, isFlip) === leadSuit);
  return follow.length ? follow : hand;
}

// -----------------------------------------------------------------------------
// Spiel-Policy: "vernünftiger Durchschnittsspieler"
//  - Anspiel: eher hohe Karten
//  - Partner führt bereits: Punkte zuschieben (als Letzter) bzw. billig abwerfen
//  - Gegner führt: mit der billigsten Karte stechen, die reicht - sonst abwerfen
//  - epsilon-Zufall für Streuung zwischen den Simulationen
// -----------------------------------------------------------------------------
const EPSILON = 0.12;

function chooseCard(hand, trick, trumpSuit, isFlip, myTeam, rng) {
  const leadSuit = trick.length ? leadSuitOf(trick[0].card, trumpSuit, isFlip) : null;
  const legal = legalCards(hand, leadSuit, trumpSuit, isFlip);
  if (legal.length === 1) return legal[0];
  if (rng() < EPSILON) return legal[(rng() * legal.length) | 0];

  const byStrength = (a, b) =>
    strength(a, leadSuit, trumpSuit, isFlip) - strength(b, leadSuit, trumpSuit, isFlip);

  // --- Anspiel ---
  if (!trick.length) {
    const sorted = [...legal].sort(byStrength).reverse();
    const top = Math.min(3, sorted.length);
    return rng() < 0.6 ? sorted[0] : sorted[(rng() * top) | 0];
  }

  // --- Wer führt den Stich gerade? ---
  let best = trick[0];
  for (let i = 1; i < trick.length; i++) {
    if (compareCards(trick[i].card, best.card, leadSuit, trumpSuit, isFlip) > 0) best = trick[i];
  }
  const partnerAhead = best.team === myTeam;
  const isLast = trick.length === 3;

  const sortedAsc = [...legal].sort(byStrength);
  const winners = sortedAsc.filter(
    (c) => compareCards(c, best.card, leadSuit, trumpSuit, isFlip) > 0
  );

  if (partnerAhead) {
    // Als Letzter: Punkte zum Partner schieben
    if (isLast) {
      const withPoints = [...legal].sort((a, b) => cardPoints(b) - cardPoints(a));
      if (cardPoints(withPoints[0]) > 0) return withPoints[0];
    }
    return sortedAsc[0]; // sonst billig abwerfen
  }

  // Gegner führt: billigste Karte, die den Stich holt
  if (winners.length) {
    const trickValue = 5 + trick.reduce((s, t) => s + cardPoints(t.card), 0);
    // Ohne Punkte im Stich und nicht als Letzter: nicht immer verschwenden
    if (!isLast && trickValue <= 5 && rng() < 0.35) return sortedAsc[0];
    return winners[0];
  }

  // Kann nicht gewinnen: möglichst punktlos abwerfen
  const cheap = [...legal].sort(
    (a, b) => cardPoints(a) - cardPoints(b) || byStrength(a, b)
  );
  return cheap[0];
}

// -----------------------------------------------------------------------------
// Eine komplette Runde ausspielen (12 Stiche)
// -----------------------------------------------------------------------------
function playout({ hands, order, teamOf, leaderIdx, trumpSuit, isFlip, basePoints, rng }) {
  const h = {};
  for (const uid of order) h[uid] = [...hands[uid]];

  const pts = { Fire: basePoints.Fire || 0, Storm: basePoints.Storm || 0 };
  const tricksWon = { Fire: 0, Storm: 0 };

  let lead = leaderIdx;
  const totalTricks = h[order[0]].length;

  for (let t = 0; t < totalTricks; t++) {
    const trick = [];
    for (let k = 0; k < order.length; k++) {
      const idx = (lead + k) % order.length;
      const uid = order[idx];
      const team = teamOf[uid];
      const card = chooseCard(h[uid], trick, trumpSuit, isFlip, team, rng);
      h[uid] = h[uid].filter((c) => c !== card);
      trick.push({ uid, card, team, idx });
    }

    const leadSuit = leadSuitOf(trick[0].card, trumpSuit, isFlip);
    let winner = trick[0];
    for (let i = 1; i < trick.length; i++) {
      if (compareCards(trick[i].card, winner.card, leadSuit, trumpSuit, isFlip) > 0) {
        winner = trick[i];
      }
    }

    const trickPoints = 5 + trick.reduce((s, x) => s + cardPoints(x.card), 0);
    pts[winner.team] += trickPoints;
    tricksWon[winner.team] += 1;
    lead = winner.idx;
  }

  return { pts, tricksWon };
}

// Mulberry32 – deterministisch seedbarer, schneller PRNG
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * @param {object} o
 * @param {Record<string,string[]>} o.hands      userId -> 12 Karten (Stand Spielbeginn)
 * @param {string[]}                o.order      userIds in Spielreihenfolge
 * @param {Record<string,string>}   o.teamOf     userId -> "Fire" | "Storm"
 * @param {string}                  o.bidderId   userId des Hakem
 * @param {number}                  o.bid        Gebot
 * @param {string|null}             o.trumpSuit  Trumpf der Runde
 * @param {boolean}                 o.isFlip     FLIP-Variante?
 * @param {{Fire:number,Storm:number}} o.basePoints Punkte vor dem 1. Stich (Abwurf-Bonus)
 * @param {string[]}                o.discarded  vom Hakem abgeworfene Karten
 * @param {boolean}                 o.includeJokers
 * @param {number}                  [o.iterations=300]
 * @param {number}                  [o.budgetMs=400]
 * @param {number}                  [o.doubleNegativeMin]
 */
export function estimateRoundWinProbability(o) {
  const {
    hands,
    order,
    teamOf,
    bidderId,
    bid,
    trumpSuit = null,
    isFlip = false,
    basePoints = { Fire: 0, Storm: 0 },
    discarded = [],
    includeJokers = false,
    iterations = 300,
    budgetMs = 400,
    doubleNegativeMin = 0,
  } = o || {};

  if (!hands || !order || order.length !== 4 || !bidderId || !bid) return null;
  for (const uid of order) {
    if (!Array.isArray(hands[uid]) || hands[uid].length === 0) return null;
  }

  const bidderTeam = teamOf[bidderId];
  const otherTeam = bidderTeam === "Fire" ? "Storm" : "Fire";
  const leaderIdx = order.indexOf(bidderId);
  if (leaderIdx < 0 || !bidderTeam) return null;

  const started = Date.now();
  const rng = makeRng(
    (bid * 7919 + order.join("").length * 104729 + Date.now()) >>> 0
  );

  // ---------- Modus 1: tatsächliche Verteilung ----------
  let dealHits = 0;
  let dealPtsSum = 0;
  let shutoutHits = 0;
  let dblNegHits = 0;
  let dealRuns = 0;

  for (let i = 0; i < iterations; i++) {
    if (Date.now() - started > budgetMs) break;
    const { pts, tricksWon } = playout({
      hands, order, teamOf, leaderIdx, trumpSuit, isFlip, basePoints, rng,
    });
    dealRuns++;
    dealPtsSum += pts[bidderTeam];
    const made = pts[bidderTeam] >= bid;
    if (made) dealHits++;
    if (tricksWon[otherTeam] === 0) shutoutHits++;
    if (!made && pts[otherTeam] >= doubleNegativeMin) dblNegHits++;
  }

  // ---------- Modus 2: nur die Hakem-Hand bekannt ----------
  const others = order.filter((u) => u !== bidderId);
  const known = new Set([...hands[bidderId], ...discarded]);
  const pool = fullDeck(includeJokers).filter((c) => !known.has(c));
  const handSize = hands[bidderId].length;

  let hakemHits = 0;
  let hakemPtsSum = 0;
  let hakemRuns = 0;

  if (pool.length === others.length * handSize) {
    for (let i = 0; i < iterations; i++) {
      if (Date.now() - started > budgetMs * 2) break;
      const p = shuffleInPlace([...pool], rng);
      const simHands = { [bidderId]: hands[bidderId] };
      others.forEach((u, k) => {
        simHands[u] = p.slice(k * handSize, (k + 1) * handSize);
      });
      const { pts } = playout({
        hands: simHands, order, teamOf, leaderIdx, trumpSuit, isFlip, basePoints, rng,
      });
      hakemRuns++;
      hakemPtsSum += pts[bidderTeam];
      if (pts[bidderTeam] >= bid) hakemHits++;
    }
  }

  const r3 = (x) => Math.round(x * 1000) / 1000;

  return {
    method: "monte-carlo",
    bid,
    bidderTeam,
    trumpf: trumpSuit,
    variant: isFlip ? "FLIP" : "NORMAL",
    iterations: { deal: dealRuns, hakem: hakemRuns },
    // Wahrscheinlichkeit, das Gebot zu erfüllen – mit der echten Kartenlage
    deal: dealRuns
      ? { p: r3(dealHits / dealRuns), avgPoints: Math.round(dealPtsSum / dealRuns) }
      : null,
    // Wahrscheinlichkeit aus Sicht des Hakem (nur eigene Karten bekannt)
    hakem: hakemRuns
      ? { p: r3(hakemHits / hakemRuns), avgPoints: Math.round(hakemPtsSum / hakemRuns) }
      : null,
    pShutout: dealRuns ? r3(shutoutHits / dealRuns) : null,
    pDoubleNegative: dealRuns ? r3(dblNegHits / dealRuns) : null,
    computedMs: Date.now() - started,
  };
}

export const __test__ = {
  compareCards,
  strength,
  legalCards,
  playout,
  makeRng,
  leadSuitOf,
  playSuit,
};
