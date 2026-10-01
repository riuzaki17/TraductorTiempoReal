// Verificación de locutor GRATIS: heurística de huella espectral + VAD por energía.
// No requiere API key ni servicios externos. Es menos precisa que un modelo de
// speaker-verification dedicado (ver speaker-gate-eagle.js para la versión premium),
// pero evita recoger voces de terceros en la mayoría de casos con auriculares/mic cercano.

const BIN_COUNT = 32; // tamaño de la "huella" tras comprimir el espectro de frecuencias
const SPEECH_RMS_THRESHOLD = 0.02;
const SILENCE_HANGOVER_MS = 400; // cuánto silencio hace falta para cerrar un segmento
const SIMILARITY_THRESHOLD = 0.82; // cosine similarity mínima para considerar "misma voz"

function rms(float32) {
  let sum = 0;
  for (let i = 0; i < float32.length; i++) sum += float32[i] * float32[i];
  return Math.sqrt(sum / float32.length);
}

function compressSpectrum(freqData) {
  // freqData: Float32Array en dB (getFloatFrequencyData). Convertimos a magnitud lineal
  // y promediamos en BIN_COUNT bandas para obtener un vector compacto.
  const bins = new Float32Array(BIN_COUNT);
  const bandSize = Math.floor(freqData.length / BIN_COUNT);
  for (let b = 0; b < BIN_COUNT; b++) {
    let sum = 0;
    for (let i = 0; i < bandSize; i++) {
      const db = freqData[b * bandSize + i];
      sum += Math.pow(10, db / 20); // dB -> magnitud lineal
    }
    bins[b] = sum / bandSize;
  }
  return bins;
}

function cosineSimilarity(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export class FreeSpeakerGate {
  constructor(audioContext, sourceNode) {
    this.audioContext = audioContext;
    this.analyser = audioContext.createAnalyser();
    this.analyser.fftSize = 1024;
    this.processor = audioContext.createScriptProcessor(2048, 1, 1);
    sourceNode.connect(this.analyser);
    this.analyser.connect(this.processor);
    this.processor.connect(audioContext.createGain()); // sumidero silencioso, no suena

    this.enrolledFingerprint = null;
    this.verified = false;
    this.onVerifiedChange = null;

    this._speaking = false;
    this._silenceSince = 0;
    this._segmentBins = [];
    this._running = false;
  }

  // Graba `durationMs` de audio y guarda la huella espectral media como perfil del usuario.
  async enroll(durationMs = 4000) {
    return new Promise((resolve) => {
      const freqBuf = new Float32Array(this.analyser.frequencyBinCount);
      const collected = [];
      const tick = () => {
        this.analyser.getFloatFrequencyData(freqBuf);
        collected.push(compressSpectrum(freqBuf));
      };
      const interval = setInterval(tick, 100);
      setTimeout(() => {
        clearInterval(interval);
        const avg = new Float32Array(BIN_COUNT);
        for (const v of collected) for (let i = 0; i < BIN_COUNT; i++) avg[i] += v[i] / collected.length;
        this.enrolledFingerprint = avg;
        resolve(true);
      }, durationMs);
    });
  }

  get isEnrolled() {
    return !!this.enrolledFingerprint;
  }

  start(onVerifiedChange) {
    this.onVerifiedChange = onVerifiedChange;
    this._running = true;
    const timeBuf = new Float32Array(this.processor.bufferSize);
    const freqBuf = new Float32Array(this.analyser.frequencyBinCount);

    this.processor.onaudioprocess = (e) => {
      if (!this._running) return;
      const input = e.inputBuffer.getChannelData(0);
      timeBuf.set(input);
      const level = rms(timeBuf);
      const now = this.audioContext.currentTime * 1000;

      if (level >= SPEECH_RMS_THRESHOLD) {
        this._speaking = true;
        this._silenceSince = 0;
        this.analyser.getFloatFrequencyData(freqBuf);
        this._segmentBins.push(compressSpectrum(freqBuf));
      } else if (this._speaking) {
        if (!this._silenceSince) this._silenceSince = now;
        if (now - this._silenceSince >= SILENCE_HANGOVER_MS) {
          this._finishSegment();
        }
      }
    };
  }

  _finishSegment() {
    this._speaking = false;
    this._silenceSince = 0;
    if (this._segmentBins.length === 0 || !this.enrolledFingerprint) {
      this._segmentBins = [];
      return;
    }
    const avg = new Float32Array(BIN_COUNT);
    for (const v of this._segmentBins) for (let i = 0; i < BIN_COUNT; i++) avg[i] += v[i] / this._segmentBins.length;
    this._segmentBins = [];

    const similarity = cosineSimilarity(avg, this.enrolledFingerprint);
    const nowVerified = similarity >= SIMILARITY_THRESHOLD;
    if (nowVerified !== this.verified) {
      this.verified = nowVerified;
      this.onVerifiedChange?.(this.verified, similarity);
    } else {
      this.onVerifiedChange?.(this.verified, similarity);
    }
  }

  stop() {
    this._running = false;
    if (this.processor) this.processor.onaudioprocess = null;
  }
}
