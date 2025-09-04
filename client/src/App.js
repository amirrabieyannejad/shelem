import React, { useEffect, useState } from "react";
import { io } from "socket.io-client";

const socket = io("http://localhost:3001");

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
  const [chooseTrump, setChooseTrump] = useState(false);
  const [randomTeams, setRandomTeams] = useState(false);
  const [showBottom, setShowBottom] = useState(false);
  const [bottomCards, setBottomCards] = useState([]);

  useEffect(() => {
    socket.on("connect", () => {
      console.log("Connected to backend!");

      const name = prompt("Bitte gib deinen Namen ein:");
      if (name) {
        socket.emit("register", name);
        console.log("Player gave a name: ", name);
      } else {
        console.log("player cancelled name input or provided an empty name.");
      }
    });
    socket.on("playersUpdate", (list) => {
      setPlayers(list);
      const myId = socket.id;
      const myself = list.find((p) => p.id === myId);
      setMe(myself);
    });

    socket.on("randomTeamsActivated", () => {
      setRandomTeams(true);
    });

    // Hilfsfunktion zum Sortieren
    const sortHand = (cards, trumpf) => {
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
        const [rankA, suitA] = [a.slice(0, -1), a.slice(-1)];
        const [rankB, suitB] = [b.slice(0, -1), b.slice(-1)];

        // Trumpf zuerst
        const isTrumpA = suitA === trumpf;
        const isTrumpB = suitB === trumpf;
        if (isTrumpA && !isTrumpB) return -1;
        if (!isTrumpA && isTrumpB) return 1;

        // Wenn beide gleich (Trumpf oder beide kein Trumpf) -> nach suitOrder
        if (suitOrder.indexOf(suitA) !== suitOrder.indexOf(suitB)) {
          return suitOrder.indexOf(suitA) - suitOrder.indexOf(suitB);
        }

        // Wenn gleiche Farbe -> nach Rang
        return rankOrder.indexOf(rankA) - rankOrder.indexOf(rankB);
      });
    };

    socket.on("hand", (cards) => setHand(sortHand(cards, trumpf)));

    socket.on("bottomCards", (cards) => {
      console.log("Boden:", cards);
    });

    socket.on("yourTurn", (data) => {
      setIsMyTurn(true);
      setCurrentBid(data.currentBid);
    });

    socket.on("turnUpdate", ({ currentPlayer }) => {
      setCurrentPlayer(currentPlayer);
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

    socket.on("chooseTrumpPhase", () => {
      setDiscardPhase(false);
      setChooseTrump(true);
    });

    socket.on("trumpChosen", ({ trumpf, winner }) => {
      setTrumpf(trumpf);
      setHand((h) => sortHand(h, trumpf));
      setChooseTrump(false);
      alert(`${winner.name} hat ${trumpf} als Trumpf gewählt!`);
    });

    return () => {
      socket.off("connect");
      socket.off("playersUpdate");
      socket.off("hand");
      socket.off("bottomCards");
      socket.off("yourTurn");
      socket.off("biddingResult");
      socket.off("turnUpdate");
      socket.off("chooseTeam");
      socket.off("lobbyFull");
      socket.off("discardPhase");
      socket.off("chooseTrumpPhase");
      socket.off("trumpChosen");
    };
  }, []);

  const makeBid = (bid) => {
    socket.emit("makeBid", bid);
    setIsMyTurn(false);
  };

  const toggleDiscard = (card) => {
    if (selectedDiscard.includes(card)) {
      setSelectedDiscard(selectedDiscard.filter((c) => c !== card));
    } else if (selectedDiscard.length < 4) {
      setSelectedDiscard([...selectedDiscard, card]);
    }
  };

  const confirmDiscard = () => {
    if (selectedDiscard.length === 4) {
      socket.emit("discardCards", selectedDiscard);
    } else {
      alert("Bitte genau 4 Karten auswählen!");
    }
  };

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold">Shelem – Lobby & Bieten</h1>
     
     {/* === Popup für Boden-Karten === */}
    {showBottom && (
      <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
        <div className="bg-white p-6 rounded shadow-lg">
          <h2 className="text-lg font-bold">Boden-Karten</h2>
          <div className="flex gap-2 mt-2">
            {bottomCards.map((card) => (
              <span key={card} className="px-3 py-2 border rounded bg-yellow-200">
                {card}
              </span>
            ))}
          </div>
          <button
            className="mt-4 px-4 py-2 bg-green-400 rounded"
            onClick={() => {
              socket.emit("takeBottomCards");
              setShowBottom(false);
            }}
          >
            Übernehmen
          </button>
        </div>
      </div>
    )}
     
     {/* === Team Auswahl === */}
{me && !me.team && (
  <div className="mt-4">
    {!randomTeams ? (
      <>
        <h2>Wähle dein Team:</h2>
        <div className="flex gap-4 mt-2">
          <button
            onClick={() => socket.emit("chooseTeam", "Fire")}
            className="px-4 py-2 bg-red-300 rounded"
          >
            Team Fire
          </button>
          <button
            onClick={() => socket.emit("chooseTeam", "Storm")}
            className="px-4 py-2 bg-blue-300 rounded"
          >
            Team Storm
          </button>
          {players.length === 1 && (
            <button
              onClick={() => socket.emit("chooseTeam", "Random")}
              className="px-4 py-2 bg-green-300 rounded"
            >
              Random Teams
            </button>
          )}
        </div>
      </>
    ) : (
      <h2>Teams werden automatisch zugewiesen...</h2>
    )}
  </div>
)}


      {/* Wenn Random-Modus aktiv */}
      {me && !me.team && randomTeams && (
        <div className="mt-4">
          <h2>Teams werden automatisch zugewiesen...</h2>
        </div>
      )}
      {/* === Spiler Name === */}
      {me && (
        <div className="mt-4">
          <h2>Du bist: {me.name}</h2>
        </div>
      )}
      {/* === Spieler-Übersicht === */}
      <div className="mt-4">
        <h2 className="font-semibold">Spieler:</h2>
        <ul>
          {players.map((p) => (
            <li key={p.id}>
              {p.name} – Team {p.team}{" "}
              {p.passed ? <span className="text-red-500">(Pass)</span> : ""}
            </li>
          ))}
        </ul>
      </div>

      {/* === Aktuelles Gebot (für alle sichtbar) === */}
      {!biddingWinner && (
        <div className="mt-4">
          <h2 className="font-semibold">Aktuelles Höchstgebot: {currentBid}</h2>
        </div>
      )}

      {/* === Discard Phase (nur für Richter nach Boden-Übernahme) === */}
{discardPhase && (
  <div className="mt-4">
    <h2>Wähle 4 Karten zum Abwerfen:</h2>
    <div className="flex flex-wrap gap-2">
      {hand.map((card) => {
        const isSelected = selectedDiscard.includes(card);
        return (
          <button
            key={card}
            onClick={() => toggleDiscard(card)}
            disabled={
              !isSelected && selectedDiscard.length >= 4 // blockieren wenn schon 4 ausgewählt
            }
            className={`px-3 py-2 border rounded transition
              ${isSelected ? "bg-red-400 text-white" : "bg-gray-100"}
              ${!isSelected && selectedDiscard.length >= 4 ? "opacity-50 cursor-not-allowed" : ""}
            `}
          >
            {card}
          </button>
        );
      })}
    </div>
    <button
      className="mt-2 px-4 py-2 bg-green-500 text-white rounded disabled:opacity-50"
      onClick={confirmDiscard}
      disabled={selectedDiscard.length !== 4}
    >
      Abwerfen bestätigen
    </button>
  </div>
)}


      {/* === Trumpfwahl === */}
      {chooseTrump && (
        <div className="mt-4">
          <h2>Wähle Trumpf:</h2>
          <div className="flex gap-2">
            {["♠", "♥", "♦", "♣"].map((suit) => (
              <button
                key={suit}
                className="px-4 py-2 bg-blue-200 rounded"
                onClick={() => socket.emit("chooseTrump", suit)}
              >
                {suit}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* === Trumpf anzeigen === */}
      {trumpf && (
        <div className="mt-4 p-2 bg-purple-200 rounded">
          Trumpf ist: <b>{trumpf}</b>
        </div>
      )}

{/* === Deine Hand === */}
<div className="mt-4">
  <h2 className="font-semibold">Deine Hand:</h2>
  <div className="flex flex-wrap gap-2">
    {hand.map((card) =>
      discardPhase ? (
        <button
          key={card}
          onClick={() => toggleDiscard(card)}
          disabled={
            !selectedDiscard.includes(card) && selectedDiscard.length >= 4
          }
          className={`px-3 py-2 border rounded transition
            ${selectedDiscard.includes(card) ? "bg-red-400 text-white" : "bg-gray-100"}
            ${
              !selectedDiscard.includes(card) && selectedDiscard.length >= 4
                ? "opacity-50 cursor-not-allowed"
                : ""
            }
          `}
        >
          {card}
        </button>
      ) : (
        <span
          key={card}
          className="px-3 py-2 border rounded bg-gray-100 shadow"
        >
          {card}
        </span>
      )
    )}
  </div>

  {/* Discard bestätigen nur in Discard-Phase */}
  {discardPhase && (
    <button
      className="mt-2 px-4 py-2 bg-green-500 text-white rounded disabled:opacity-50"
      onClick={confirmDiscard}
      disabled={selectedDiscard.length !== 4}
    >
      Abwerfen bestätigen
    </button>
  )}
</div>

      {/* === Ergebnis nach Bietende === */}
      {biddingWinner ? (
        <div className="p-2 bg-green-200 rounded mt-4">
          <p>
            Höchstbietender:{" "}
            {biddingWinner.winner
              ? `${biddingWinner.winner.name} (Team ${biddingWinner.winner.team})`
              : "Keiner"}
          </p>
          <p>Gebot: {biddingWinner.bid}</p>
        </div>
      ) : isMyTurn && me && !me.passed ? (
        /* === Dein Zug === */
        <div className="mt-4">
          <h2>Dein Zug – aktuelles Gebot: {currentBid}</h2>
          <div className="flex gap-2 flex-wrap">
            <button
              className="px-3 py-2 bg-gray-200 rounded"
              onClick={() => makeBid(0)}
            >
              Pass
            </button>
            {[...Array(14).keys()]
              .map((i) => (i + 1) * 5 + 95) // 105 bis 165
              .filter((bid) => bid > currentBid)
              .map((bid) => (
                <button
                  key={bid}
                  className="px-3 py-2 bg-blue-200 rounded"
                  onClick={() => makeBid(bid)}
                >
                  {bid}
                </button>
              ))}
          </div>
        </div>
      ) : (
        <p className="mt-2">
          {currentPlayer
            ? `Aktuell am Zug: ${currentPlayer.name} (Team ${currentPlayer.team})`
            : "Warten auf den Spielstart..."}
        </p>
      )}
    </div>
  );
}

export default App;
