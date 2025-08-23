import React, { useEffect, useState } from "react";
import { io } from "socket.io-client";

const socket = io("http://localhost:3001");

function App() {
  const [hand, setHand] = useState([]);
  const [players, setPlayers] = useState([]);
  const [me, setMe] = useState(null);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [currentBid, setCurrentBid] = useState(0);
  const [biddingWinner, setBiddingWinner] = useState(null);


  useEffect(() => {
    socket.on('connect', () => {
    console.log("Connected to backend!");

    const name = prompt("Bitte gib deinen Namen ein:");
    if(name){
      socket.emit("register", name);
    console.log("Player gave a name: ", name);
    }else{
      console.log("player cancelled name input or provided an empty name.");
    }    
});
    socket.on("playersUpdate", (list) => {
      setPlayers(list);
      const myId = socket.id;
      const myself = list.find((p) => p.id === myId);
      setMe(myself);
    });

    socket.on("hand", (cards) => setHand(cards));

    socket.on("bottomCards", (cards) => {
      console.log("Boden:", cards);
    });

    socket.on("yourTurn", (data) => {
      setIsMyTurn(true);
      setCurrentBid(data.currentBid);
    });

    socket.on("biddingResult", ({ winner, bid }) => {
      setBiddingWinner({ winner, bid });
      setIsMyTurn(false);
    });

    return () => {
      socket.off("connect");
      socket.off("playersUpdate");
      socket.off("hand");
      socket.off("bottomCards");
      socket.off("yourTurn");
      socket.off("biddingResult");
    };
  }, []);

  const makeBid = (bid) => {
    socket.emit("makeBid", bid);
    setIsMyTurn(false);
  };

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold">Shelem – Lobby & Bieten</h1>

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
          <h2 className="font-semibold">
            Aktuelles Höchstgebot: {currentBid}
          </h2>
        </div>
      )}

      {/* === Deine Hand === */}
      <div className="mt-4">
        <h2 className="font-semibold">Deine Hand:</h2>
        <div className="flex flex-wrap gap-2">
          {hand.map((card) => (
            <span
              key={card}
              className="px-3 py-2 border rounded bg-gray-100 shadow"
            >
              {card}
            </span>
          ))}
        </div>
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
              .map((i) => (i + 1) * 5 + 100) // 105 bis 165
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
        <p className="mt-2">Warte auf deinen Zug...</p>
      )}
    </div>
  );
}

export default App;
