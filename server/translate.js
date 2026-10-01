const fetch = require("node-fetch");

const LIBRETRANSLATE_URL = process.env.LIBRETRANSLATE_URL || "http://localhost:5000";
const LIBRETRANSLATE_API_KEY = process.env.LIBRETRANSLATE_API_KEY || "";
const MYMEMORY_EMAIL = process.env.MYMEMORY_EMAIL || ""; // opcional: sube el limite diario de 5000 a 10000 palabras

// --- Gratis por defecto, cero configuracion: MyMemory (sin API key, uso anonimo) ---
// Limite: ~5000 palabras/dia por IP (10000 si se aporta un email de contacto via MYMEMORY_EMAIL).
// Suficiente para una demo/MVP, no para produccion con mucho trafico.
async function translateWithMyMemory(text, sourceLang, targetLang) {
  const params = new URLSearchParams({
    q: text,
    langpair: `${sourceLang}|${targetLang}`,
  });
  if (MYMEMORY_EMAIL) params.set("de", MYMEMORY_EMAIL);

  const res = await fetch(`https://api.mymemory.translated.net/get?${params.toString()}`);
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`MyMemory error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  if (data.responseStatus && data.responseStatus !== 200) {
    throw new Error(`MyMemory error: ${data.responseDetails || data.responseStatus}`);
  }
  return data.responseData?.translatedText || "";
}

// --- Alternativa auto-hospedada e ilimitada: LibreTranslate via Docker (ver docker-compose.yml) ---
// La nube oficial de LibreTranslate ya no es gratis (requiere key de pago); self-hosted si lo es.
async function translateWithLibreTranslate(text, sourceLang, targetLang) {
  const body = {
    q: text,
    source: sourceLang,
    target: targetLang,
    format: "text",
  };
  if (LIBRETRANSLATE_API_KEY) body.api_key = LIBRETRANSLATE_API_KEY;

  const res = await fetch(`${LIBRETRANSLATE_URL}/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`LibreTranslate error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return data.translatedText || "";
}

// --- Premium: DeepL API (el usuario aporta su propia API key desde el cliente) ---
async function translateWithDeepL(text, sourceLang, targetLang, apiKey) {
  if (!apiKey) throw new Error("Falta la API key de DeepL");

  // DeepL usa códigos en mayúsculas y variantes regionales para algunos idiomas (p.ej. EN-US / PT-PT).
  const DEEPL_TARGET = { en: "EN-US", pt: "PT-PT" };
  const source = sourceLang.toUpperCase();
  const target = DEEPL_TARGET[targetLang] || targetLang.toUpperCase();

  // Las claves "free" de DeepL terminan en ":fx" y usan el host api-free.deepl.com.
  const host = apiKey.endsWith(":fx") ? "api-free.deepl.com" : "api.deepl.com";

  const res = await fetch(`https://${host}/v2/translate`, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: [text], source_lang: source, target_lang: target }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`DeepL error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return data.translations?.[0]?.text || "";
}

// provider: "mymemory" (gratis, por defecto, cero configuracion) | "libretranslate" (self-hosted,
// requiere LIBRETRANSLATE_URL propio) | "deepl" (premium, requiere apiKey del cliente)
async function translateText(text, sourceLang, targetLang, provider = "mymemory", apiKey = "") {
  if (!text || !text.trim()) return "";
  if (sourceLang === targetLang) return text;

  if (provider === "deepl") {
    return translateWithDeepL(text, sourceLang, targetLang, apiKey);
  }
  if (provider === "libretranslate") {
    return translateWithLibreTranslate(text, sourceLang, targetLang);
  }
  return translateWithMyMemory(text, sourceLang, targetLang);
}

module.exports = { translateText };
