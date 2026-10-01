// Wrapper sobre SpeechSynthesis (TTS nativo del navegador, gratis y funciona en Android/iOS).
let voicesCache = [];

function loadVoices() {
  voicesCache = speechSynthesis.getVoices();
}
loadVoices();
if (typeof speechSynthesis !== "undefined") {
  speechSynthesis.onvoiceschanged = loadVoices;
}

export function speak(text, lang) {
  if (!text || !text.trim()) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang;
  const match = voicesCache.find((v) => v.lang?.toLowerCase().startsWith(lang.toLowerCase()));
  if (match) utter.voice = match;
  speechSynthesis.speak(utter);
}
