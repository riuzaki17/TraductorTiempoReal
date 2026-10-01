import { LANGUAGES, srLangFor } from "./languages.js";
import { connectSocket } from "./socket.js";
import { isSttSupported, createRecognizer } from "./stt.js";
import { speak } from "./tts.js";
import { FreeSpeakerGate } from "./speaker-gate-free.js";
import { EagleSpeakerGate } from "./speaker-gate-eagle.js";

const $ = (id) => document.getElementById(id);

// ---------- Ajustes (gratis / premium), persistidos en localStorage ----------
const SETTINGS_KEY = "vmt-settings";
const settings = Object.assign(
  { useDeepL: false, deeplKey: "", useEagle: false, eagleKey: "" },
  JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}")
);
function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// ---------- Navegación entre pantallas ----------
function showScreen(name) {
  for (const el of document.querySelectorAll(".screen")) el.classList.add("hidden");
  $(`screen-${name}`).classList.remove("hidden");
}

// ---------- Estado de sala ----------
let socket = null;
let roomCode = null;
let speakLang = "es";
let listenLang = "en";

let manualRecognizer = null;
let autoRecognizer = null;
let autoModeActive = false;
let speakerVerified = false;
let speakerGate = null;
let micStream = null;
let audioCtx = null;

// ---------- Inicializar selects de idioma ----------
function populateLanguageSelects() {
  for (const sel of [$("lang-speak"), $("lang-listen")]) {
    sel.innerHTML = "";
    for (const l of LANGUAGES) {
      const opt = document.createElement("option");
      opt.value = l.code;
      opt.textContent = l.label;
      sel.appendChild(opt);
    }
  }
  $("lang-speak").value = speakLang;
  $("lang-listen").value = listenLang;
}

function sendLanguageConfig() {
  socket?.send({
    type: "set-languages",
    lang: speakLang,
    listenLang,
    provider: settings.useDeepL ? "deepl" : "libretranslate",
    apiKey: settings.useDeepL ? settings.deeplKey : "",
  });
}

// ---------- Transcripción en pantalla ----------
const transcriptEl = $("transcript");
let lastOwnBubble = null;
let lastRemoteBubble = null;

function addBubble(text, cls) {
  const div = document.createElement("div");
  div.className = `msg ${cls}`;
  div.textContent = text;
  transcriptEl.appendChild(div);
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
  return div;
}

function updateOwnTranscript(text, isFinal) {
  if (lastOwnBubble && !lastOwnBubble.dataset.final) {
    lastOwnBubble.textContent = `Tú: ${text}`;
  } else {
    lastOwnBubble = addBubble(`Tú: ${text}`, "msg-own msg-interim");
  }
  if (isFinal) {
    lastOwnBubble.classList.remove("msg-interim");
    lastOwnBubble.dataset.final = "1";
    lastOwnBubble = null;
  }
}

function updateRemoteTranscript(text, isFinal) {
  if (lastRemoteBubble && !lastRemoteBubble.dataset.final) {
    lastRemoteBubble.textContent = `Interlocutor: ${text}`;
  } else {
    lastRemoteBubble = addBubble(`Interlocutor: ${text}`, "msg-remote msg-interim");
  }
  if (isFinal) {
    lastRemoteBubble.classList.remove("msg-interim");
    lastRemoteBubble.dataset.final = "1";
    lastRemoteBubble = null;
  }
}

function addDiscardedBubble(text) {
  addBubble(`(descartado, voz no reconocida) ${text}`, "msg-own msg-discarded");
}

function addTranslatedBubble(text) {
  addBubble(`🔊 ${text}`, "msg-remote");
}

// ---------- Socket ----------
function ensureSocket() {
  if (socket) return;
  socket = connectSocket({
    onMessage: handleSocketMessage,
    onClose: () => {
      $("peer-status").textContent = "Desconectado del servidor";
      $("peer-status").classList.remove("connected");
    },
  });
}

function handleSocketMessage(msg) {
  if (msg.type === "joined") {
    roomCode = msg.code;
    $("room-header-code").textContent = `Sala ${roomCode}`;
    showScreen("room");
    sendLanguageConfig();
    return;
  }
  if (msg.type === "join-error") {
    alert("No se pudo unir a la sala (no existe o ya tiene 2 participantes).");
    return;
  }
  if (msg.type === "peer-status") {
    const el = $("peer-status");
    el.textContent = msg.connected ? "Interlocutor conectado" : "Esperando al otro participante...";
    el.classList.toggle("connected", msg.connected);
    return;
  }
  if (msg.type === "transcript") {
    if (msg.fromSelf) updateOwnTranscript(msg.text, msg.isFinal);
    else updateRemoteTranscript(msg.text, msg.isFinal);
    return;
  }
  if (msg.type === "translated") {
    addTranslatedBubble(msg.translatedText);
    speak(msg.translatedText, srLangFor(listenLang));
    return;
  }
  if (msg.type === "translate-error") {
    addBubble(`Error de traducción: ${msg.message}`, "msg-remote");
    return;
  }
}

// ---------- Crear / unirse a sala ----------
$("btn-create").addEventListener("click", async () => {
  const res = await fetch("/api/rooms", { method: "POST" });
  const data = await res.json();
  $("room-code").textContent = data.code;
  $("room-qr").src = data.qrDataUrl;
  $("create-result").classList.remove("hidden");

  ensureSocket();
  const trySend = () => socket.send({ type: "join", code: data.code });
  if (socket.raw.readyState === WebSocket.OPEN) trySend();
  else socket.raw.addEventListener("open", trySend, { once: true });
});

$("btn-join").addEventListener("click", () => {
  const code = $("join-code").value.trim();
  if (!/^\d{6}$/.test(code)) {
    alert("Introduce un código de 6 dígitos");
    return;
  }
  ensureSocket();
  const trySend = () => socket.send({ type: "join", code });
  if (socket.raw.readyState === WebSocket.OPEN) trySend();
  else socket.raw.addEventListener("open", trySend, { once: true });
});

// Pre-rellenar código si se entra desde el QR (?join=123456)
const urlParams = new URLSearchParams(location.search);
if (urlParams.has("join")) $("join-code").value = urlParams.get("join");

// ---------- Ajustes ----------
$("btn-settings").addEventListener("click", () => showScreen("settings"));
$("btn-settings-back").addEventListener("click", () => showScreen("home"));

$("toggle-deepl").checked = settings.useDeepL;
$("deepl-key").value = settings.deeplKey;
$("deepl-key-row").classList.toggle("hidden", !settings.useDeepL);
$("toggle-deepl").addEventListener("change", (e) => {
  settings.useDeepL = e.target.checked;
  $("deepl-key-row").classList.toggle("hidden", !settings.useDeepL);
  saveSettings();
  sendLanguageConfig();
});
$("deepl-key").addEventListener("input", (e) => {
  settings.deeplKey = e.target.value.trim();
  saveSettings();
  sendLanguageConfig();
});

$("toggle-eagle").checked = settings.useEagle;
$("eagle-key").value = settings.eagleKey;
$("eagle-key-row").classList.toggle("hidden", !settings.useEagle);
$("toggle-eagle").addEventListener("change", (e) => {
  settings.useEagle = e.target.checked;
  $("eagle-key-row").classList.toggle("hidden", !settings.useEagle);
  saveSettings();
});
$("eagle-key").addEventListener("input", (e) => {
  settings.eagleKey = e.target.value.trim();
  saveSettings();
});

// ---------- Selectores de idioma en la sala ----------
$("lang-speak").addEventListener("change", (e) => {
  speakLang = e.target.value;
  sendLanguageConfig();
});
$("lang-listen").addEventListener("change", (e) => {
  listenLang = e.target.value;
  sendLanguageConfig();
});

// ---------- Modo manual: pulsar para hablar ----------
function startManualRecognition() {
  if (!isSttSupported()) {
    alert("Este navegador no soporta reconocimiento de voz. Usa Chrome en Android.");
    return;
  }
  manualRecognizer = createRecognizer({
    lang: srLangFor(speakLang),
    continuous: false,
    onInterim: (text) => socket.send({ type: "speech", text, isFinal: false }),
    onFinal: (text) => socket.send({ type: "speech", text, isFinal: true }),
    onError: (err) => console.warn("STT error:", err),
  });
  manualRecognizer.start();
}
function stopManualRecognition() {
  manualRecognizer?.stop();
  manualRecognizer = null;
}

const pttBtn = $("btn-ptt");
pttBtn.addEventListener("pointerdown", () => {
  pttBtn.classList.add("active");
  startManualRecognition();
});
["pointerup", "pointerleave", "pointercancel"].forEach((ev) =>
  pttBtn.addEventListener(ev, () => {
    pttBtn.classList.remove("active");
    stopManualRecognition();
  })
);

// ---------- Toggle auriculares / altavoz ----------
$("toggle-headset").addEventListener("change", (e) => {
  const usingHeadset = e.target.checked;
  $("manual-mode").classList.toggle("hidden", usingHeadset);
  $("auto-mode").classList.toggle("hidden", !usingHeadset);
  if (!usingHeadset) stopAutoMode();
});

// ---------- Modo automático: VAD + verificación de locutor ----------
async function getMicStream() {
  if (!micStream) {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  }
  return micStream;
}

// Contexto/fuente propios del modo gratis (16kHz no es necesario aquí, solo para Eagle).
function getFreeGateAudioNodes(stream) {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const source = audioCtx.createMediaStreamSource(stream);
  return { source, audioCtx };
}

$("btn-enroll").addEventListener("click", async () => {
  const statusEl = $("auto-status");
  try {
    const stream = await getMicStream();

    if (settings.useEagle && settings.eagleKey) {
      statusEl.textContent = "Calibrando con Picovoice Eagle...";
      speakerGate = new EagleSpeakerGate(settings.eagleKey);
      await speakerGate.enroll(stream, (pct) => {
        statusEl.textContent = `Calibrando (premium): ${pct.toFixed(0)}%`;
      });
    } else {
      statusEl.textContent = "Di una frase durante unos segundos...";
      const { source, audioCtx: ctx } = getFreeGateAudioNodes(stream);
      speakerGate = new FreeSpeakerGate(ctx, source);
      await speakerGate.enroll(4000);
    }

    statusEl.textContent = "Voz calibrada. Activando modo automático...";
    startAutoMode(stream);
  } catch (err) {
    console.error(err);
    statusEl.textContent = `Error al calibrar (${err.message}). Usando modo gratis como respaldo.`;
    const stream = await getMicStream();
    const { source, audioCtx: ctx } = getFreeGateAudioNodes(stream);
    speakerGate = new FreeSpeakerGate(ctx, source);
    await speakerGate.enroll(4000);
    startAutoMode(stream);
  }
});

function startAutoMode(stream) {
  autoModeActive = true;
  $("auto-status").textContent = "Modo automático activo: escuchando tu voz...";

  const onVerifiedChange = (verified) => {
    speakerVerified = verified;
  };

  if (speakerGate instanceof EagleSpeakerGate) {
    speakerGate.start(stream, onVerifiedChange);
  } else {
    speakerGate.start(onVerifiedChange);
  }

  startAutoRecognition();
}

function startAutoRecognition() {
  if (!isSttSupported()) {
    alert("Este navegador no soporta reconocimiento de voz. Usa Chrome en Android.");
    return;
  }
  autoRecognizer = createRecognizer({
    lang: srLangFor(speakLang),
    continuous: true,
    onFinal: (text) => {
      if (speakerVerified) {
        socket.send({ type: "speech", text, isFinal: true });
      } else {
        addDiscardedBubble(text);
      }
    },
    onError: (err) => console.warn("STT auto error:", err),
    onEnd: () => {
      if (autoModeActive) autoRecognizer.start(); // el navegador puede cortar el reconocimiento tras silencio
    },
  });
  autoRecognizer.start();
}

function stopAutoMode() {
  autoModeActive = false;
  autoRecognizer?.stop();
  autoRecognizer = null;
  speakerGate?.stop();
}

// ---------- Arranque ----------
populateLanguageSelects();
showScreen("home");
