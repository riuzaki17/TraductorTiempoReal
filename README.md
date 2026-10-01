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
                    LibreTranslate (gratis, self-hosted)
                       o DeepL (premium, API key propia)
```

Solo viaja **texto** entre los dos móviles (no audio): cada móvil hace su propio
reconocimiento de voz y su propia síntesis de voz en el navegador, gratis y sin
depender de un servicio de pago por minuto de audio.

Dos cosas intercambiables entre **gratis** y **premium** (toggle en "Ajustes avanzados"):

| | Gratis (por defecto) | Premium |
|---|---|---|
| Traducción | LibreTranslate self-hosted (ilimitado) | DeepL API (tu propia key) |
| Verificación de voz (modo auriculares) | Heurística de huella espectral (sin key) | Picovoice Eagle (tu propia AccessKey) |

## Requisitos

- Node.js 18+
- Docker (para LibreTranslate self-hosted; es la opción gratis)
- Chrome en Android en ambos móviles (el MVP ignora iPhone: Safari/iOS no soporta
  bien el reconocimiento de voz del navegador)

## Puesta en marcha (modo gratis)

```bash
# 1. Traducción (gratis, self-hosted). Tarda un rato la primera vez (descarga modelos).
docker compose up -d

# 2. Backend
cd server
npm install
npm start
```

Abre `http://localhost:3000` en el navegador.

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
