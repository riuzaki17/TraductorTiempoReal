const fetch = require("node-fetch");

const LIBRETRANSLATE_URL = process.env.LIBRETRANSLATE_URL || "http://localhost:5000";
const LIBRETRANSLATE_API_KEY = process.env.LIBRETRANSLATE_API_KEY || "";

// --- Gratis: LibreTranslate self-hosted (ver docker-compose.yml) ---
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

// provider: "libretranslate" (gratis, por defecto) | "deepl" (premium, requiere apiKey del cliente)
async function translateText(text, sourceLang, targetLang, provider = "libretranslate", apiKey = "") {
  if (!text || !text.trim()) return "";
  if (sourceLang === targetLang) return text;

  if (provider === "deepl") {
    return translateWithDeepL(text, sourceLang, targetLang, apiKey);
  }
  return translateWithLibreTranslate(text, sourceLang, targetLang);
}

module.exports = { translateText };
