// Wrapper sobre la Web Speech API (SpeechRecognition). Solo fiable en Chrome/Android para el MVP.
export function isSttSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function createRecognizer({ lang, continuous, onInterim, onFinal, onError, onEnd }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) throw new Error("SpeechRecognition no soportado en este navegador");

  const rec = new SR();
  rec.lang = lang;
  rec.continuous = continuous;
  rec.interimResults = true;

  rec.onresult = (e) => {
    let interim = "";
    let final = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const transcript = e.results[i][0].transcript;
      if (e.results[i].isFinal) final += transcript;
      else interim += transcript;
    }
    if (interim) onInterim?.(interim);
    if (final.trim()) onFinal?.(final.trim());
  };
  rec.onerror = (e) => onError?.(e.error);
  rec.onend = () => onEnd?.();

  return rec;
}
