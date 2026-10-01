const path = require("path");
const crypto = require("crypto");
const express = require("express");
const QRCode = require("qrcode");
const { WebSocketServer } = require("ws");

const { createRoom, getRoom, joinRoom, leaveRoom, otherPeer } = require("./rooms");
const { translateText } = require("./translate");

const PORT = process.env.PORT || 3000;

const app = express();
app.set("trust proxy", 1); // Render/otros PaaS terminan TLS en su proxy; necesario para que req.protocol sea "https"
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

// Crea una sala nueva y devuelve el código + un QR que apunta a la URL de unión.
app.post("/api/rooms", (req, res) => {
  const code = createRoom();
  const joinUrl = `${req.protocol}://${req.get("host")}/?join=${code}`;
  QRCode.toDataURL(joinUrl, { margin: 1, width: 240 }, (err, dataUrl) => {
    if (err) return res.status(500).json({ error: "qr_failed" });
    res.json({ code, joinUrl, qrDataUrl: dataUrl });
  });
});

app.get("/api/rooms/:code", (req, res) => {
  const room = getRoom(req.params.code);
  if (!room) return res.status(404).json({ error: "not_found" });
  res.json({ code: room.code, peerCount: room.peers.size });
});

const server = app.listen(PORT, () => {
  console.log(`VoiceMeetTranslate escuchando en http://localhost:${PORT}`);
});

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
  let currentRoomCode = null;
  let peerId = crypto.randomUUID();

  const send = (obj) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
  };

  ws.on("message", async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === "join") {
      const room = joinRoom(msg.code, peerId, ws);
      if (!room) {
        send({ type: "join-error", reason: "room_full_or_missing" });
        return;
      }
      currentRoomCode = msg.code;
      send({ type: "joined", code: msg.code, peerId });

      const other = otherPeer(room, peerId);
      if (other) {
        send({ type: "peer-status", connected: true });
        other.ws.send(JSON.stringify({ type: "peer-status", connected: true }));
      }
      return;
    }

    if (!currentRoomCode) return;
    const room = getRoom(currentRoomCode);
    if (!room) return;

    if (msg.type === "set-languages") {
      const peer = room.peers.get(peerId);
      if (!peer) return;
      peer.lang = msg.lang;
      peer.listenLang = msg.listenLang;
      // Preferencia de traducción de ESTE participante: afecta a cómo se traduce
      // el texto que recibe (el emisor nunca necesita su propia API key ajena).
      peer.provider = ["deepl", "libretranslate"].includes(msg.provider) ? msg.provider : "mymemory";
      peer.apiKey = typeof msg.apiKey === "string" ? msg.apiKey : "";
      return;
    }

    if (msg.type === "speech") {
      const sender = room.peers.get(peerId);
      const receiver = otherPeer(room, peerId);
      if (!sender || !receiver) return;

      // Siempre reenviamos el texto original (para mostrarlo en pantalla al instante).
      receiver.ws.send(
        JSON.stringify({
          type: "transcript",
          text: msg.text,
          isFinal: msg.isFinal,
          fromSelf: false,
        })
      );
      send({ type: "transcript", text: msg.text, isFinal: msg.isFinal, fromSelf: true });

      if (!msg.isFinal) return; // solo traducimos frases finales, no resultados intermedios

      try {
        const translated = await translateText(
          msg.text,
          sender.lang || "auto",
          receiver.listenLang || "en",
          receiver.provider,
          receiver.apiKey
        );
        receiver.ws.send(
          JSON.stringify({
            type: "translated",
            originalText: msg.text,
            translatedText: translated,
            fromLang: sender.lang,
            toLang: receiver.listenLang,
          })
        );
      } catch (err) {
        console.error("Error de traduccion:", err.message);
        // Avisamos a los dos: quien habló (para que sepa que no llegó traducido)
        // y quien escucha (para que no se quede esperando en silencio).
        const errMsg = JSON.stringify({ type: "translate-error", message: err.message });
        send(errMsg);
        receiver.ws.send(errMsg);
      }
      return;
    }
  });

  ws.on("close", () => {
    if (currentRoomCode) {
      const room = getRoom(currentRoomCode);
      const other = room ? otherPeer(room, peerId) : null;
      leaveRoom(currentRoomCode, peerId);
      if (other) other.ws.send(JSON.stringify({ type: "peer-status", connected: false }));
    }
  });
});
