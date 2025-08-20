/*
  es handelt sich bei diesem Code um den Client-Teil eines Echtzeit-Kartenspiels, 
  der über Socket.IO mit einem Server kommuniziert, um den Spielzustand 
  (Hand des Spielers, gespielte Karten) zu synchronisieren und die Benutzeroberfläche 
  dynamisch zu aktualisieren.
*/
import React, { useEffect, useState } from "react";
import { io } from "socket.io-client";

const socket = io("http://localhost:3001");

function App() {
  // Zustand der Komponente
  const [hand, setHand] = useState([]);
  const [played, setPlayed] = useState([]);

  // Lebenszyklus und Kommunikation
  useEffect(() => {
    socket.on("hand", (cards) => setHand(cards));
    socket.on("cardPlayed", (data) => setPlayed((prev) => [...prev, data]));
    socket.on("gameStart", (msg) => console.log(msg));
  }, []);

  // Spiellogik
  const playCard = (card) => {
    socket.emit("playCard", card);
    setHand(hand.filter((c) => c !== card));
  };

  // Benutzeroberfläche (UI)
  return (
    <div className="p-4">
      <h1 className="text-xl font-bold">Shelem Demo</h1>

      <div className="mt-4">
        <h2>Deine Hand:</h2>
        <div className="flex flex-wrap gap-2">
          {hand.map((card) => (
            <button
              key={card}
              className="px-3 py-2 border rounded bg-gray-100"
              onClick={() => playCard(card)}
            >
              {card}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <h2>Gespielte Karten:</h2>
        <ul>
          {played.map((p, i) => (
            <li key={i}>
              {p.player}: {p.card}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default App;
