# VoiceMeet Translate — MVP

Traducción de voz en tiempo real entre dos móviles: cada participante elige en qué
idioma habla y en qué idioma quiere escuchar al otro.

## Arquitectura

```
[Móvil A]                                    [Móvil B]
 Micrófono                                     Altavoz/auriculares
   │ STT local (Web Speech API)                     ▲
   ▼                                                 │ TTS local (SpeechSynthesis)
 texto ──── WebSocket ──► Servidor Node.js ──────────┘
                             │  (sala + traducción)
                             ▼
                    MyMemory (gratis, sin key, por defecto)
                       o DeepL (premium, API key propia)
```

Solo viaja **texto** entre los dos móviles (no audio): cada móvil hace su propio
reconocimiento de voz y su propia síntesis de voz en el navegador, gratis y sin
depender de un servicio de pago por minuto de audio.

Dos cosas intercambiables entre **gratis** y **premium** (toggle en "Ajustes avanzados"):

| | Gratis (por defecto) | Premium |
|---|---|---|
| Traducción | MyMemory (sin key, ~5000 palabras/día) | DeepL API (tu propia key) |
| Verificación de voz (modo auriculares) | Heurística de huella espectral (sin key) | Picovoice Eagle (tu propia AccessKey) |

### Historial de lo que NO resultó ser gratis (para que no pierdas tiempo)

Durante el desarrollo probamos varias opciones de traducción "gratis" que resultaron
no serlo o no ser fiables, por si te encuentras las mismas referencias buscando por tu cuenta:

- **LibreTranslate nube oficial** (`libretranslate.com`): requiere API key de pago.
  La documentación menciona un tier gratis via `portal.libretranslate.com`, pero en
  la práctica el alta pide método de pago.
- **Instancias comunitarias gratuitas** (`translate.terraprint.co` y similares): no
  tienen garantía de disponibilidad — la que probamos estaba caída (502) al validar.
- **DeepL "API Free"**: el plan recurrente gratuito ya no se puede contratar; las
  keys nuevas solo dan un bono único de caracteres para pruebas.

Lo único verificado en vivo y gratis sin registro ni tarjeta: **MyMemory** (usado por
defecto) y **LibreTranslate self-hosted con Docker** (ilimitado, pero necesitas Docker).

## Idiomas soportados

Español, English, Français, Deutsch, Italiano, Português, 日本語 (`public/js/languages.js`).
Añadir uno nuevo: agregarlo ahí (con su código `srLang` para Web Speech API) y a
`LT_LOAD_ONLY` en `docker-compose.yml` si usas LibreTranslate self-hosted.

## Requisitos

- Node.js 18+
- Chrome en Android en ambos móviles (el MVP ignora iPhone: Safari/iOS no soporta
  bien el reconocimiento de voz del navegador)
- Docker, opcional (solo si quieres LibreTranslate self-hosted en vez de MyMemory)

## Puesta en marcha (modo gratis, cero configuración)

```bash
cd server
npm install
npm start
```

Abre `http://localhost:3000` en el navegador. La traducción funciona de inmediato
con MyMemory, sin registrarte en nada.

### Si necesitas más de ~5000 palabras/día (límite de MyMemory)

La alternativa realmente ilimitada y gratis es LibreTranslate **self-hosted**
(no la nube oficial, que ahora es de pago):

```bash
docker compose up -d   # tarda un rato la primera vez (descarga modelos)
```

Y cambia el proveedor por defecto a `"libretranslate"` en `server/rooms.js`
(`peer.provider`), o añade una opción en el toggle de ajustes si vas a usarlo con
frecuencia. Variables de entorno: `LIBRETRANSLATE_URL` (por defecto
`http://localhost:5000`) y `LIBRETRANSLATE_API_KEY` (solo si tu instancia la exige).

## Probar con dos móviles reales (importante)

El micrófono (`getUserMedia`) y el reconocimiento de voz solo funcionan en un
**contexto seguro (HTTPS)**, excepto en `localhost` del propio ordenador. Para que
dos móviles conectados por WiFi puedan usar el micrófono necesitas HTTPS, no basta
con la IP local por `http://`. Opciones gratis:

- **ngrok** (gratis): `ngrok http 3000` y usa la URL `https://...ngrok-free.app` en
  los dos móviles.
- **Cloudflare Tunnel** (gratis): `cloudflared tunnel --url http://localhost:3000`.
- Desplegar el backend en un hosting gratis con HTTPS incluido (Render, Fly.io).

## Activar el modo premium

En la pantalla de inicio → "Ajustes avanzados":

- **DeepL**: crea una cuenta en [deepl.com/pro-api](https://www.deepl.com/pro-api),
  copia tu API key y actívala en el toggle. (Nota: el antiguo plan "API Free"
  recurrente ya no se puede contratar; las keys nuevas dan un bono único de hasta
  1M de caracteres pensado para pruebas, no una cuota mensual gratis indefinida).
- **Picovoice Eagle**: crea una cuenta gratis en
  [console.picovoice.ai](https://console.picovoice.ai) (tier gratis: 100 min/mes,
  máx. 3 usuarios, uso personal no comercial) y copia tu AccessKey. Además necesitas
  el fichero de modelo:
  ```bash
  git clone --recurse-submodules https://github.com/Picovoice/eagle.git
  cp eagle/lib/common/eagle_params.pv VoiceMeetTranslate/public/models/
  ```

Si el modo premium de voz falla (sin key, sin modelo, sin red), la app cae
automáticamente al modo gratis (heurística de huella espectral).

## Limitaciones conocidas del MVP

- Solo Android/Chrome (STT de Safari/iOS no es fiable).
- La heurística gratis de verificación de voz es más simple que un modelo de
  speaker-verification dedicado: puede fallar con ruido de fondo fuerte o voces
  muy similares.
- Sin auriculares, usa el botón de pulsar-para-hablar (evita el eco entre
  altavoz y micrófono).
- El adaptador de Picovoice Eagle sigue la documentación oficial vigente, pero la
  API de `@picovoice/eagle-web` ha cambiado entre versiones — si Picovoice publica
  cambios, revisar `public/js/speaker-gate-eagle.js`.
