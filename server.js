/*
  Servidor puente: recibe audio de DOS ESP32 (Villa Alem 1 y Villa Alem 2)
  por WebSocket y reenvía cada uno a las páginas que estén escuchando esa
  estación en particular.

  Instalación:
    npm install

  Ejecución:
    npm start

  Cada ESP32 se conecta a su propia ruta:
    Villa Alem 1 -> wss://TU_HOST/audio1
    Villa Alem 2 -> wss://TU_HOST/audio2

  El navegador se conecta solo, a través de index.html, a:
    wss://TU_HOST/listen1   (pestaña Villa Alem 1)
    wss://TU_HOST/listen2   (pestaña Villa Alem 2)
*/

const express = require("express");
const http = require("http");
const path = require("path");
const { WebSocketServer, WebSocket } = require("ws");

const app = express();
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Configuración de las estaciones: cada una tiene su ruta de audio (ESP32)
// y su ruta de escucha (navegador), con su propio set de oyentes y estado.
const stations = {
  1: { audioPath: "/audio1", listenPath: "/listen1", name: "Villa Alem 1", listeners: new Set(), esp32Connected: false },
  2: { audioPath: "/audio2", listenPath: "/listen2", name: "Villa Alem 2", listeners: new Set(), esp32Connected: false },
};

wss.on("connection", (ws, req) => {
  const url = req.url || "";

  const stationByAudio = Object.values(stations).find((s) => url.startsWith(s.audioPath));
  const stationByListen = Object.values(stations).find((s) => url.startsWith(s.listenPath));

  if (stationByAudio) {
    // Conexión del ESP32 (emisor) de esta estación
    const station = stationByAudio;
    station.esp32Connected = true;
    console.log(`[+] ESP32 conectado (${station.name})`);

    ws.on("message", (data) => {
      for (const listener of station.listeners) {
        if (listener.readyState === WebSocket.OPEN) {
          listener.send(data);
        }
      }
    });

    ws.on("close", () => {
      station.esp32Connected = false;
      console.log(`[-] ESP32 desconectado (${station.name})`);
    });

  } else if (stationByListen) {
    // Conexión de un navegador (oyente) de esta estación
    const station = stationByListen;
    station.listeners.add(ws);
    console.log(`[+] Oyente conectado a ${station.name} (total: ${station.listeners.size})`);

    ws.on("close", () => {
      station.listeners.delete(ws);
      console.log(`[-] Oyente desconectado de ${station.name} (total: ${station.listeners.size})`);
    });

  } else {
    ws.close();
  }
});

const PORT = process.env.PORT || 8765;
server.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
