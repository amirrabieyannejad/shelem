// Express wird verwendet, um den Webserver zu erstellen.
const express = require("express");

// Das integrierte http-Modul von Node.js wird verwendet, um einen HTTP-Server zu erstellen.
const http = require("http");

// Importiert die Socket.IO-Bibliothek, um Echtzeit-Kommunikation zu ermöglichen.
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// 54 Karten (52 + 2 Joker)
const suits = ["♠", "♥", "♦", "♣"];
const ranks = [
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
const deck = suits.flatMap((s) => ranks.map((r) => r + s));

let players = [];
let hands = {};

function shuffle(array) {
  return array.sort(() => Math.random() - 0.5);
}

io.on("connection", (socket) => {
  console.log("Neuer Spieler:", socket.id);

  // Spieler tritt Lobby bei
  players.push(socket.id);

  // Wenn 4 Spieler da → Karten austeilen
  if (players.length === 4) {
    let shuffled = shuffle([...deck]);
    hands = {};
    players.forEach((p, i) => {
      hands[p] = shuffled.slice(i * 13, i * 13 + 13);
      io.to(p).emit("hand", hands[p]);
    });
    io.emit("gameStart", { msg: "Spiel gestartet!", players });
  }

  // Spieler spielt Karte
  socket.on("playCard", (card) => {
    console.log(socket.id, "spielt", card);
    io.emit("cardPlayed", { player: socket.id, card });
  });

  // Disconnect
  socket.on("disconnect", () => {
    console.log("Spieler weg:", socket.id);
    players = players.filter((p) => p !== socket.id);
  });
});

server.listen(3001, () => {
  console.log("Server läuft auf Port 3001");
});
