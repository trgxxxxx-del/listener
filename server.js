/*
  Servidor puente: recibe audio del ESP32 por WebSocket y lo reenvía
  a todas las páginas web que estén escuchando.

  Instalación:
    npm install

  Ejecución:
    npm start

  El ESP32 se conecta a:  wss://TU_HOST/audio
  El navegador se conecta a: wss://TU_HOST/listen  (esto lo hace solo, con la página index.html)
*/

const express = require("express");
const http = require("http");
const path = require("path");
const { WebSocketServer, WebSocket } = require("ws");

const app = express();
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const listeners = new Set();
let esp32Connected = false;

wss.on("connection", (ws, req) => {
  const url = req.url || "";

  if (url.startsWith("/audio")) {
    // Conexión del ESP32 (emisor)
    esp32Connected = true;
    console.log("[+] ESP32 conectado");

    ws.on("message", (data) => {
      for (const listener of listeners) {
        if (listener.readyState === WebSocket.OPEN) {
          listener.send(data);
        }
      }
    });

    ws.on("close", () => {
      esp32Connected = false;
      console.log("[-] ESP32 desconectado");
    });

  } else if (url.startsWith("/listen")) {
    // Conexión de un navegador (oyente)
    listeners.add(ws);
    console.log(`[+] Oyente conectado (total: ${listeners.size})`);

    ws.on("close", () => {
      listeners.delete(ws);
      console.log(`[-] Oyente desconectado (total: ${listeners.size})`);
    });

  } else {
    ws.close();
  }
});

const PORT = process.env.PORT || 8765;
server.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
