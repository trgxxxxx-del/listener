/*
  Servidor puente: recibe audio de varias estaciones ESP32 por WebSocket
  y reenvía cada una solo a las páginas que estén escuchando ESE barrio.

  Instalación:
    npm install

  Ejecución:
    npm start

  Cada estación tiene su propio canal, identificado por un slug de barrio:

    ESP32 (emisor):    wss://TU_HOST/audio/<barrio>
    Navegador (oyente): wss://TU_HOST/listen/<barrio>   (lo hace solo index.html
                                                          según el <select> elegido)

  Ejemplos de <barrio>: villa-alem-1, villa-alem-2, villa-alem-3
  No hace falta declarar los barrios de antemano: el canal se crea solo
  la primera vez que alguien (ESP32 u oyente) se conecta a ese slug.
*/

const express = require("express");
const http = require("http");
const path = require("path");
const { WebSocketServer, WebSocket } = require("ws");

const app = express();
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// stationId -> { listeners: Set<ws>, esp32Connected: bool }
const stations = new Map();

function getStation(stationId) {
  let station = stations.get(stationId);
  if (!station) {
    station = { listeners: new Set(), esp32Connected: false };
    stations.set(stationId, station);
  }
  return station;
}

// Devuelve, p.ej., { kind: "audio", stationId: "villa-alem-1" } a partir de
// "/audio/villa-alem-1" (soporta slugs codificados en la URL).
function parsePath(rawUrl) {
  const url = new URL(rawUrl, "http://localhost");
  const parts = url.pathname.split("/").filter(Boolean); // ["audio", "villa-alem-1"]
  const kind = parts[0];
  const stationId = parts[1] ? decodeURIComponent(parts[1]) : null;
  return { kind, stationId };
}

wss.on("connection", (ws, req) => {
  const { kind, stationId } = parsePath(req.url || "");

  if (kind === "audio" && stationId) {
    // Conexión del ESP32 (emisor) de una estación puntual
    const station = getStation(stationId);
    station.esp32Connected = true;
    console.log(`[+] ESP32 conectado (${stationId})`);

    ws.on("message", (data) => {
      for (const listener of station.listeners) {
        if (listener.readyState === WebSocket.OPEN) {
          listener.send(data);
        }
      }
    });

    ws.on("close", () => {
      station.esp32Connected = false;
      console.log(`[-] ESP32 desconectado (${stationId})`);
    });

  } else if (kind === "listen" && stationId) {
    // Conexión de un navegador (oyente) de esa misma estación
    const station = getStation(stationId);
    station.listeners.add(ws);
    console.log(`[+] Oyente conectado a "${stationId}" (total: ${station.listeners.size})`);

    ws.on("close", () => {
      station.listeners.delete(ws);
      console.log(`[-] Oyente desconectado de "${stationId}" (total: ${station.listeners.size})`);
    });

  } else {
    // Rutas viejas sin barrio ("/audio", "/listen") o cualquier otra cosa:
    // ya no se soportan porque no sabríamos a qué estación pertenecen.
    ws.close();
  }
});

// Estado simple para que el frontend pueda mostrar qué barrios están
// transmitiendo en este momento (sin esto, el <select> no sabría si
// la estación elegida está online antes de intentar escuchar).
app.get("/api/estaciones", (_req, res) => {
  const estado = {};
  for (const [stationId, station] of stations) {
    estado[stationId] = {
      online: station.esp32Connected,
      oyentes: station.listeners.size,
    };
  }
  res.json(estado);
});

const PORT = process.env.PORT || 8765;
server.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
