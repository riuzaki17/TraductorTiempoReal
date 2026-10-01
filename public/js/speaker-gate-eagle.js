// Verificación de locutor PREMIUM: Picovoice Eagle (modelo dedicado de speaker-verification).
// Requiere:
//   1. Una AccessKey gratuita de https://console.picovoice.ai (tier gratis: 100 min/mes, 3 usuarios).
//   2. El fichero de modelo `eagle_params.pv` servido en /models/eagle_params.pv
//      (clonar https://github.com/Picovoice/eagle y copiar lib/common/eagle_params.pv, ver README.md).
// Se carga bajo demanda vía ESM CDN (esm.sh) para no obligar a montar un bundler en el MVP.
//
// NOTA: la API de @picovoice/eagle-web ha cambiado entre versiones (EagleProfiler vs
// EagleProfilerWorker, forma de pasar el perfil a process()). Este adaptador sigue la
// documentación oficial vigente en picovoice.ai/docs/quick-start/eagle-web/; si Picovoice
// publica una versión con otra firma, ajustar aquí. Si falla, app.js hace fallback automático
// al modo gratis (speaker-gate-free.js).

const MODEL_PATH = "/models/eagle_params.pv";
const EAGLE_SAMPLE_RATE = 16000;

export class EagleSpeakerGate {
  constructor(accessKey) {
    this.accessKey = accessKey;
    this.eagleModel = { publicPath: MODEL_PATH };
    this.profile = null;
    this.eagle = null;
    this.verified = false;
    this.onVerifiedChange = null;
    this._ctx = null;
    this._processor = null;
  }

  async _loadSdk() {
    if (!this.accessKey) throw new Error("Falta la AccessKey de Picovoice");
    return import("https://esm.sh/@picovoice/eagle-web@2?bundle");
  }

  // Crea un AudioContext dedicado a 16kHz (lo que espera Eagle) a partir del MediaStream del micro,
  // y un acumulador que entrega frames de tamaño exacto `frameLength` sin importar el buffer del navegador.
  _buildFrameSource(micStream, frameLength, onFrame) {
    this._ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: EAGLE_SAMPLE_RATE });
    const source = this._ctx.createMediaStreamSource(micStream);
    const processor = this._ctx.createScriptProcessor(2048, 1, 1);
    let pending = new Float32Array(0);

    processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      const merged = new Float32Array(pending.length + input.length);
      merged.set(pending);
      merged.set(input, pending.length);

      let offset = 0;
      while (merged.length - offset >= frameLength) {
        const frame = merged.subarray(offset, offset + frameLength);
        const pcm = Int16Array.from(frame, (x) => Math.max(-32768, Math.min(32767, x * 32768)));
        onFrame(pcm);
        offset += frameLength;
      }
      pending = merged.slice(offset);
    };

    source.connect(processor);
    processor.connect(this._ctx.createGain()); // sumidero silencioso
    this._processor = processor;
  }

  async enroll(micStream, onProgress) {
    const { EagleProfilerWorker } = await this._loadSdk();
    const profiler = await EagleProfilerWorker.create(this.accessKey, this.eagleModel);

    await new Promise((resolve, reject) => {
      this._buildFrameSource(micStream, profiler.frameLength, async (pcm) => {
        try {
          const percentage = await profiler.enroll(pcm);
          onProgress?.(percentage);
          if (percentage >= 100) {
            this._processor.onaudioprocess = null;
            resolve();
          }
        } catch (err) {
          this._processor.onaudioprocess = null;
          reject(err);
        }
      });
    });

    this.profile = await profiler.export();
    profiler.release?.();
    this.isEnrolled = true;
  }

  async start(micStream, onVerifiedChange) {
    if (!this.profile) throw new Error("Eagle no está enrolado todavía");
    const { EagleWorker } = await this._loadSdk();
    this.eagle = await EagleWorker.create(this.accessKey, this.eagleModel);
    this.onVerifiedChange = onVerifiedChange;

    this._buildFrameSource(micStream, this.eagle.minProcessSamples ?? this.eagle.frameLength, async (pcm) => {
      const scores = await this.eagle.process(pcm, this.profile);
      const score = Array.isArray(scores) ? scores[0] : scores;
      const nowVerified = (score ?? 0) >= 0.5;
      if (nowVerified !== this.verified) {
        this.verified = nowVerified;
        this.onVerifiedChange?.(this.verified, score);
      }
    });
  }

  stop() {
    if (this._processor) this._processor.onaudioprocess = null;
    this.eagle?.release?.();
  }
}
