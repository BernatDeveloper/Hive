# Brief — Auditoría, PWA instalable y preparación para deploy (sin desplegar)

> **Para Claude Code:** trabaja **fase por fase, en orden**. Antes de cada cambio, **lee los archivos reales** del repo — los fragmentos de aquí son de referencia y hay que adaptarlos al código existente.
>
> **⛔ NO despliegues.** No crees ni configures servicios en Railway/Vercel, no conectes repos, no crees volúmenes, no ejecutes comandos de deploy y no toques credenciales. Tu trabajo es **dejar el código listo** para que el deploy lo haga yo a mano después. Si algo requiere una acción en Railway o Vercel, **anótalo en una lista "Pendiente para mí"** al final, no lo hagas.
>
> **La Fase A es solo un informe: no modifiques código todavía.** Espera mi visto bueno antes de la Fase B. Marca cada `- [x]` al completarlo y verifica el criterio de aceptación de cada fase.

**Contexto:** app de organización colaborativa en tiempo real. Salas con contraseña que comparten calendario, listas y notas. Cliente React 19 + Vite + TS + FullCalendar + Socket.io-client. Servidor Node v22 + Express 5 + Socket.io 4 + better-sqlite3 (SQLite en `server/calendario.db`). Sincronización por Socket.io (solo existe `GET /health`). Se acaban de implementar notificaciones Web Push con recordatorio configurable por evento (`client/public/sw.js`, `client/src/push.ts`, columnas `reminder_offset`/`reminder_sent`, tabla `push_subscription`, scheduler en el servidor).

**Objetivo:** (A) revisar que todo esté correcto, (B) hacer la app instalable (PWA), (C) dejar el código **preparado** para deploy (Vercel front + Railway back con SQLite en volumen), **sin desplegar**.

## Global Constraints

- **pnpm siempre**, nunca npm ni yarn.
- Servidor en **JavaScript ESM**; cliente en **TypeScript**.
- Código en inglés; texto de UI en español.
- Datos por **Socket.io** (no REST salvo `GET /health`).
- Secretos solo en variables de entorno; nunca commitear `.env`.
- Se mantiene SQLite (no se migra a Postgres).
- **Ningún valor de deploy hardcodeado**: dominios, URLs y rutas van por variables de entorno.

---

## Fase A — Auditoría (SOLO INFORME, no cambies código)

Devuélveme un informe **agrupado por archivo**, marcando cada hallazgo como `🔴 bloqueante` / `🟡 mejora` / `⚪ nit`. Al final, un veredicto general (¿está listo para deploy?) y las 3 mejoras que más recomiendas.

**Notificaciones push**
- [x] `subscribe-push` / `unsubscribe-push`: validación del payload, `ON CONFLICT(endpoint)` correcto, y que `unsubscribe` borra por `endpoint`.
- [x] Limpieza de suscripciones muertas al recibir `404`/`410` en `webpush.sendNotification`.
- [x] Scheduler: ventana de tiempo (evita avisar eventos muy pasados) y que `reminder_sent` se marca siempre (incluido el caso "demasiado viejo").
- [x] `reminder_sent` se resetea al editar un evento (si cambian `start` o `reminder_offset`) y en `updateSeries` para toda la serie.
- [x] Eventos de día completo: `effectiveStart` parsea bien la fecha sin hora y aplica las 09:00.
- [x] Consistencia de zona horaria entre cómo se guarda `start` y cómo lo interpreta el scheduler (idealmente ISO en UTC).
- [x] No hay avisos duplicados con `useEventReminders` (su parte de `Notification` está desactivada).
- [x] Service worker: scope `/`, registro correcto, `applicationServerKey` bien decodificada.
- [x] UX cuando `Notification.permission === 'denied'`.
- [x] Claves VAPID leídas de entorno, no hardcodeadas ni commiteadas.

**General**
- [x] Validación de payloads de socket antes de escribir en DB.
- [x] Hash de contraseñas: `scryptSync` con salt aleatorio y `timingSafeEqual`.
- [x] Orígenes CORS de Socket.io correctos y sin `*`.
- [x] Manejo de errores en escrituras de DB (que un fallo no tumbe el server).
- [x] Inserción en batch de eventos recurrentes envuelta en `db.transaction()`.
- [x] Listeners de socket sin fugas (`socket.once` + cleanup en flujos de auth).
- [x] Limpieza de salas inactivas (>1 año) y cascada a `push_subscription`, `event`, `list`, `note`.
- [x] Tipos del cliente alineados con lo que emite el servidor (incluido `reminder_offset`).

**No cambies nada en esta fase.** Solo el informe.

---

## Fase B — PWA instalable

**Files:** `client/public/manifest.webmanifest` (nuevo), `client/public/icon-192.png` + `client/public/icon-512.png` (nuevos), `client/index.html`, `client/src/main.tsx`, `client/public/sw.js`.

- [x] Crear `client/public/manifest.webmanifest`:

```json
{
  "name": "Calendario Compartido",
  "short_name": "Calendario",
  "description": "Organización colaborativa en tiempo real: calendario, listas y notas.",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#F5F5F7",
  "theme_color": "#0071E3",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [x] Generar `icon-192.png` e `icon-512.png` (PNG cuadrados). Si no hay assets, crea un placeholder simple (`#0071E3` con una "C" centrada) y anótalo en "Pendiente para mí" para sustituirlo por el icono real.

- [x] En `client/index.html`, dentro de `<head>`:

```html
<link rel="manifest" href="/manifest.webmanifest" />
<meta name="theme-color" content="#0071E3" />
<link rel="apple-touch-icon" href="/icon-192.png" />
```

- [x] Registrar el service worker **al cargar la app** (hoy solo se registra al suscribirse a push). En `client/src/main.tsx`:

```ts
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(console.error)
  })
}
```

- [x] En `client/src/push.ts`, simplificar `subscribeToPush` para reutilizar el SW ya registrado con `await navigator.serviceWorker.ready` en lugar de volver a llamar a `register('/sw.js')`.

- [x] Añadir handlers mínimos a `client/public/sw.js` (además de los de push):

```js
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => { return }) // passthrough, no interfiere con Socket.io
```

**Aceptación:** en Chrome DevTools → Application → Manifest no hay errores y aparece "Installable"; el navegador ofrece "Instalar app"; el SW figura activo.

---

## Fase C — Preparación de código para deploy (SOLO código, NO desplegar)

Deja el código configurable por entorno para que yo pueda desplegarlo luego. **No crees nada en Railway/Vercel.**

### C.1 — Ruta de la DB configurable

- [x] En `server/db.js`, al crear la instancia:

```js
import Database from 'better-sqlite3'
const dbPath = process.env.DB_PATH || './calendario.db'
const db = new Database(dbPath)
```

En local (sin `DB_PATH`) usa `./calendario.db`; en producción apuntará al volumen vía variable de entorno.

### C.2 — Puerto y host

- [x] En `server/index.js`:

```js
const PORT = process.env.PORT || 3001
server.listen(PORT, '0.0.0.0', () => console.log(`Server on ${PORT}`))
```

### C.3 — CORS configurable por entorno (sin hardcodear dominios)

- [x] En `server/index.js`, el origen de producción se lee de `CLIENT_ORIGIN`; localhost queda para dev y se acepta cualquier subdominio `*.vercel.app` (previews):

```js
const ALLOWED = [
  'http://localhost:5173',
  'http://localhost:4173',
  process.env.CLIENT_ORIGIN // dominio de producción; lo defino yo en el deploy
].filter(Boolean)

const io = new Server(server, {
  cors: {
    origin(origin, cb) {
      if (!origin) return cb(null, true) // health checks, curl
      const host = new URL(origin).hostname
      if (ALLOWED.includes(origin) || /\.vercel\.app$/.test(host)) return cb(null, true)
      cb(new Error('Not allowed by CORS'))
    }
  }
})
```

### C.4 — URL del socket configurable en el cliente

- [x] En `client/src/socket.ts`, dejar de usar localhost fijo:

```ts
import { io } from 'socket.io-client'
export const socket = io(import.meta.env.VITE_SOCKET_URL /*, { autoConnect: false } si aplica */)
```

- [x] En local, `VITE_SOCKET_URL` puede apuntar a `http://localhost:3001` en un `.env.local` (no commitear).

### C.5 — Documentar variables de entorno

- [x] Crear/actualizar `.env.example` en `server/` y `client/` con las claves (sin valores reales):

```
# server/.env.example
DB_PATH=
PORT=
CLIENT_ORIGIN=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=

# client/.env.example
VITE_SOCKET_URL=
VITE_VAPID_PUBLIC_KEY=
```

- [x] Verifica que `.env` y `.env.local` estén en `.gitignore`.

**Aceptación:** la app arranca en local igual que antes usando los defaults/`.env.local`; no queda ningún dominio, URL ni ruta de deploy hardcodeada en el código; todo lo que yo tendré que hacer en Railway/Vercel está recogido en la lista "Pendiente para mí".

---

## Pendiente para mí (no lo hagas tú)

Al terminar, recopila aquí lo que me toca a mí fuera del repo, p. ej.: generar claves VAPID, sustituir los iconos placeholder, crear los servicios y el volumen en Railway, conectar los repos, y definir las variables de entorno en cada plataforma. (Yo lo haré con una guía aparte.)

- **Fase B:** `client/public/icon-192.png` e `icon-512.png` — icono de calendario estilo flat design: fondo cuadrado dorado con esquinas redondeadas (tipo icono de app), calendario grande y centrado con márgenes uniformes, cabecera coral, 4 aros azul-grisáceos, cuerpo gris claro y cuadraditos coral en patrón escalonado diagonal, con sombra larga hacia la esquina inferior derecha. Generado a mano con Node/zlib al no haber ImageMagick/Python en este entorno. Si en algún momento tienes un icono de marca "de verdad" para reemplazarlo, mantén los mismos nombres y tamaños (192×192 y 512×512) para que el manifest siga funcionando sin tocar código.

- **Fase C — Railway (servidor):**
  - Crear el servicio + volumen persistente montado donde apunte `DB_PATH` (si no se define, el server usa `./calendario.db` relativo al working dir del contenedor — con un volumen efímero se perdería la DB en cada redeploy).
  - Definir variables de entorno: `DB_PATH`, `PORT` (Railway suele inyectarlo solo), `CLIENT_ORIGIN` (dominio real de Vercel), `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (las VAPID ya generadas están en `server/.env`, local y no commiteado).

- **Fase C — Vercel (cliente):**
  - Conectar el repo, definir `VITE_SOCKET_URL` (URL pública del server en Railway) y `VITE_VAPID_PUBLIC_KEY` (la misma clave pública que en el servidor).
  - Los previews de Vercel (`*.vercel.app`) ya están permitidos en el CORS del servidor sin configuración extra.

- **Fase C — General:** el CORS de Socket.io/Express ahora rechaza cualquier origen que no esté en la allowlist — si el dominio final de producción no es exactamente el de `CLIENT_ORIGIN` (p. ej. usas un dominio propio en vez del `*.vercel.app` por defecto), acuérdate de fijar `CLIENT_ORIGIN` con esa URL exacta o las conexiones desde el navegador se rechazarán.

- **Remediación Bloque 4 (zona horaria) — Railway:** define `TZ=Europe/Madrid` (o la zona real de los miembros de la sala) como variable de entorno del servicio del backend. Solo afecta a los recordatorios de eventos de **día completo** (ancla las 09:00 a esa zona); los eventos con hora ya viajan como instante UTC y no dependen de la zona del proceso. Documentado con comentario en `server/.env.example`.
