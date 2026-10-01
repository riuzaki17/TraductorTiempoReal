// Idiomas soportados en el MVP (deben coincidir con LT_LOAD_ONLY en docker-compose.yml).
export const LANGUAGES = [
  { code: "es", label: "Español", srLang: "es-ES" },
  { code: "en", label: "English", srLang: "en-US" },
  { code: "fr", label: "Français", srLang: "fr-FR" },
  { code: "de", label: "Deutsch", srLang: "de-DE" },
  { code: "it", label: "Italiano", srLang: "it-IT" },
  { code: "pt", label: "Português", srLang: "pt-PT" },
  { code: "ja", label: "日本語", srLang: "ja-JP" },
];

export function srLangFor(code) {
  return LANGUAGES.find((l) => l.code === code)?.srLang || "en-US";
}
