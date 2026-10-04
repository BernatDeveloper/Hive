# Plan de implementación — Notificaciones Push del Calendario

> **Para Claude Code:** implementa este plan **fase por fase, en orden**. Antes de tocar cada archivo, **léelo de verdad** en el repo — los fragmentos de código de abajo son de referencia y hay que adaptarlos al código real existente (nombres de funciones, estilo, imports). No asumas la estructura: verifícala. Marca cada `- [ ]` al completarlo y comprueba el criterio de aceptación de cada fase antes de pasar a la siguiente. Colócame este archivo en `docs/` del repo si quieres conservarlo.

**Objetivo:** avisar de eventos del calendario aunque la app esté cerrada, mediante Web Push, con un recordatorio configurable por evento (5 min → 2 días antes).

**Arquitectura:** service worker + Web Push (VAPID) en el cliente; librería `web-push` + un scheduler (`setInterval` cada 60 s) en el servidor que revisa qué eventos deben avisar. El recordatorio se guarda en el propio evento (`reminder_offset` en minutos). Las suscripciones push cuelgan de la **sala** (la app no tiene identidad de usuario), así que un aviso llega a todos los dispositivos suscritos en esa sala.

**Tech stack:** cliente React 19 + Vite + TypeScript; servidor Node v22 + Express v5 + Socket.io v4 + better-sqlite3; `web-push` (nuevo). API nativas `ServiceWorker` / `PushManager` en el cliente (sin librerías extra).

## Global Constraints

- **pnpm siempre**, nunca npm ni yarn.
- Servidor en **JavaScript ESM**; cliente en **TypeScript**.
- Código (variables, eventos socket, funciones, clases CSS) **en inglés**; texto de UI **en español**.
- Toda la sincronización de datos va por **Socket.io** (no REST; solo existe `GET /health`). El registro de suscripciones también va por Socket.io.
- La clave VAPID **pública** se inyecta en el cliente por build (`VITE_VAPID_PUBLIC_KEY`); la **privada** solo vive en el servidor.
- **Web Push exige HTTPS** en producción (localhost está exento en desarrollo).
- Mantener el CORS de Socket.io en `server/index.js` en sync con el puerto/URL real del cliente.
- Iconos como SVG inline; sin librerías de iconos externas.

## Decisiones ya tomadas (no re-litigar)

1. **Suscripción por sala**: un evento avisa a **todos** los dispositivos suscritos de la sala.
2. **Eventos de día completo** (fecha sin hora): la hora efectiva del aviso son las **09:00 locales** de ese día.
3. **`useEventReminders`**: se desactiva su parte de `Notification` para no duplicar avisos con el push del servidor (Fase 7).

## Mapa de archivos

| Acción | Archivo | Responsabilidad |
|--------|---------|-----------------|
| Modificar | `server/package.json` | añadir dependencia `web-push` |
| Modificar | `server/db.js` | tabla `push_subscription`, columnas `reminder_offset`/`reminder_sent`, funciones de acceso |
| Modificar | `server/index.js` | setup VAPID, handlers socket push, arranque del scheduler |
| Crear | `server/reminders.js` | scheduler + envío push (aislar de `index.js`) |
| Crear | `client/public/sw.js` | service worker: recibe push y muestra notificación |
| Crear | `client/src/push.ts` | helpers de suscripción/permiso |
| Modificar | `client/src/socket.ts` (o donde vivan los tipos) | tipo `Event.reminder_offset`, helpers de emit si aplica |
| Modificar | `client/src/features/calendar/EventModal.*` | selector de recordatorio |
| Modificar | `client/src/features/dashboard/Dashboard.*` **o** `settings/RoomSettings.*` | toggle "Notificaciones en este dispositivo" |
| Modificar | `client/src/hooks/useEventReminders.*` | quitar/gate la llamada a `Notification` |

---

## Fase 0 — Dependencias, VAPID y entorno

**Files:** `server/package.json`, `.env` (servidor), `.env` de Vite (cliente)

- [x] Instalar la librería en el servidor:

```bash
cd server && pnpm add web-push
```

- [x] Generar las claves VAPID (una sola vez) y copiar la salida:

```bash
cd server && npx web-push generate-vapid-keys
```

- [x] Añadir al entorno del **servidor** (`server/.env`, ignorado por git):

```
VAPID_PUBLIC_KEY=<clave pública>
VAPID_PRIVATE_KEY=<clave privada>   # secreta
VAPID_SUBJECT=mailto:faenabernat@gmail.com
```

- [x] Añadir al entorno del **cliente** (`client/.env`, ignorado por git; prefijo `VITE_` para que Vite lo exponga):

```
VITE_VAPID_PUBLIC_KEY=<misma clave pública>
```

**Aceptación:** `pnpm ls web-push` en `server/` lo lista; las 3 vars del servidor y la del cliente existen; la pública coincide en ambos lados.

---

## Fase 1 — Capa de base de datos

**Files:** `server/db.js`

**Produces (funciones que consumirán fases posteriores):**
`savePushSubscription(room, subscription)`, `deletePushSubscription(endpoint)`, `getRoomSubscriptions(room) -> rows`, `getPendingReminderEvents() -> events`, `markReminderSent(id)`, `resetReminderSent(id)`.

- [x] Crear la tabla junto al resto de `CREATE TABLE IF NOT EXISTS`:

```sql
CREATE TABLE IF NOT EXISTS push_subscription (
  id         TEXT PRIMARY KEY,
  room       TEXT NOT NULL REFERENCES room(name) ON DELETE CASCADE,
  endpoint   TEXT UNIQUE NOT NULL,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

- [x] Migrar las columnas nuevas de `event` con `ALTER TABLE` (mismo patrón que ya usas para `category`/`recurrence_rule`/`recurrence_id` — comprobar primero si la columna existe):

```js
if (!eventColumns.includes('reminder_offset')) {
  db.exec(`ALTER TABLE event ADD COLUMN reminder_offset INTEGER`)
}
if (!eventColumns.includes('reminder_sent')) {
  db.exec(`ALTER TABLE event ADD COLUMN reminder_sent INTEGER DEFAULT 0`)
}
```

- [x] (Opcional, rendimiento) índice para el scheduler:

```sql
CREATE INDEX IF NOT EXISTS idx_event_reminder ON event(reminder_sent, start);
```

- [x] Funciones de suscripciones (usa `crypto.randomUUID()` como en el resto de tablas):

```js
export function savePushSubscription(room, subscription) {
  const { endpoint, keys } = subscription
  db.prepare(`
    INSERT INTO push_subscription (id, room, endpoint, p256dh, auth, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET
      room = excluded.room, p256dh = excluded.p256dh, auth = excluded.auth
  `).run(crypto.randomUUID(), room, endpoint, keys.p256dh, keys.auth, new Date().toISOString())
}

export function deletePushSubscription(endpoint) {
  db.prepare(`DELETE FROM push_subscription WHERE endpoint = ?`).run(endpoint)
}

export function getRoomSubscriptions(room) {
  return db.prepare(`SELECT endpoint, p256dh, auth FROM push_subscription WHERE room = ?`).all(room)
}
```

- [x] Funciones de recordatorios. `getPendingReminderEvents` acota por ventana en SQL y deja el cálculo fino del `fireTime` al scheduler (Fase 3). `MAX_OFFSET_MS` = 2 días + margen:

```js
export function getPendingReminderEvents() {
  const now = Date.now()
  const horizon = new Date(now + 2 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString()
  const past = new Date(now - 6 * 60 * 60 * 1000).toISOString()
  return db.prepare(`
    SELECT id, room, title, start, reminder_offset
    FROM event
    WHERE reminder_offset IS NOT NULL AND reminder_sent = 0
      AND start <= ? AND start >= ?
  `).all(horizon, past)
}

export function markReminderSent(id) {
  db.prepare(`UPDATE event SET reminder_sent = 1 WHERE id = ?`).run(id)
}

export function resetReminderSent(id) {
  db.prepare(`UPDATE event SET reminder_sent = 0 WHERE id = ?`).run(id)
}
```

**Aceptación:** arrancar el servidor no lanza errores de migración; inspeccionar `hive.db` (`.schema event` y `.schema push_subscription`) muestra las columnas y la tabla nuevas.

---

## Fase 2 — Setup de push y handlers de socket

**Files:** `server/index.js`

**Consumes:** `savePushSubscription`, `deletePushSubscription` (Fase 1).

- [x] Configurar VAPID al arrancar:

```js
import webpush from 'web-push'

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
)
```

- [x] Añadir los handlers dentro del bloque de conexión de socket, junto a los demás. `subscription` es lo que devuelve `pushManager.subscribe().toJSON()` → `{ endpoint, keys: { p256dh, auth } }`:

```js
socket.on('subscribe-push', ({ room, subscription }) => {
  try {
    savePushSubscription(room, subscription)
    socket.emit('push-subscribed')
  } catch (e) {
    socket.emit('push-error', { message: 'No se pudo registrar el dispositivo' })
  }
})

socket.on('unsubscribe-push', ({ endpoint }) => {
  deletePushSubscription(endpoint)
  socket.emit('push-unsubscribed')
})
```

**Aceptación:** con el cliente aún sin tocar, emitir `subscribe-push` a mano (o vía DevTools) inserta una fila en `push_subscription` y responde `push-subscribed`.

---

## Fase 3 — Scheduler de recordatorios

**Files:** `server/reminders.js` (nuevo), `server/index.js` (arranque)

**Consumes:** `getPendingReminderEvents`, `markReminderSent`, `getRoomSubscriptions`, `deletePushSubscription`.
**Produces:** `startReminderScheduler()`, `sendPushToRoom(room, payload)`.

- [x] Crear `server/reminders.js`:

```js
import webpush from 'web-push'
import {
  getPendingReminderEvents, markReminderSent,
  getRoomSubscriptions, deletePushSubscription
} from './db.js'

// Hora efectiva del evento: si es fecha sin hora ("YYYY-MM-DD"), 09:00 locales.
function effectiveStart(ev) {
  const isDateOnly = ev.start.length === 10
  const iso = isDateOnly ? `${ev.start}T09:00:00` : ev.start
  return new Date(iso).getTime()
}

function reminderBody(minutes) {
  if (minutes >= 1440) return `Es dentro de ${Math.round(minutes / 1440)} día(s)`
  if (minutes >= 60)   return `Empieza en ${Math.round(minutes / 60)} hora(s)`
  return `Empieza en ${minutes} minutos`
}

export async function sendPushToRoom(room, payload) {
  const subs = getRoomSubscriptions(room)
  await Promise.all(subs.map(async (s) => {
    const subscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }
    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload))
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) deletePushSubscription(s.endpoint)
    }
  }))
}

function runReminderTick() {
  const now = Date.now()
  for (const ev of getPendingReminderEvents()) {
    const fireTime = effectiveStart(ev) - ev.reminder_offset * 60_000
    if (now >= fireTime && now - fireTime < 6 * 60 * 60_000) {
      sendPushToRoom(ev.room, {
        title: ev.title,
        body: reminderBody(ev.reminder_offset),
        url: '/',
        eventId: ev.id
      })
      markReminderSent(ev.id)
    } else if (fireTime < now - 6 * 60 * 60_000) {
      markReminderSent(ev.id) // demasiado viejo: marcar para no reintentar
    }
  }
}

export function startReminderScheduler() {
  setInterval(runReminderTick, 60_000)
  runReminderTick() // primera pasada inmediata
}
```

- [x] En `server/index.js`, llamar a `startReminderScheduler()` al arrancar, junto a la limpieza de salas.

**Aceptación:** crear un evento con `reminder_offset` cuyo `fireTime` sea ~inmediato y una suscripción real activa → llega la notificación y la fila queda con `reminder_sent = 1`.

---

## Fase 4 — Reset del flag al editar

**Files:** `server/index.js` (handlers `update-event` y la ruta de series)

**Consumes:** `resetReminderSent` (Fase 1).

- [x] En `update-event`: si cambian `start` **o** `reminder_offset` respecto a lo almacenado, tras persistir llamar a `resetReminderSent(id)` (el aviso vuelve a ser válido).
- [x] En `updateSeries` (cuando llega `series-updated`): resetear `reminder_sent = 0` en **todas** las instancias de la serie (el offset se aplica a toda la serie).

**Aceptación:** editar la hora de un evento ya "avisado" hace que vuelva a avisar; editar una serie resetea todas sus instancias.

---

## Fase 5 — Service worker y helpers de push (cliente)

**Files:** `client/public/sw.js` (nuevo), `client/src/push.ts` (nuevo)

- [x] `client/public/sw.js` (servido desde la raíz para que el scope sea `/`):

```js
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'Recordatorio', {
      body: data.body || '',
      tag: data.eventId,
      data: { url: data.url || '/' }
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => 'focus' in w)
      return open ? open.focus() : clients.openWindow(url)
    })
  )
})
```

- [x] `client/src/push.ts`:

```typescript
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return null

  const reg = await navigator.serviceWorker.register('/sw.js')
  const existing = await reg.pushManager.getSubscription()
  if (existing) return existing

  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
  })
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration()
  return reg ? reg.pushManager.getSubscription() : null
}
```

**Aceptación:** en DevTools → Application → Service Workers aparece `sw.js` activo; llamar a `subscribeToPush()` desde la consola pide permiso y devuelve una suscripción.

---

## Fase 6 — UI del cliente

**Files:** `client/src/features/calendar/EventModal.*`, `client/src/features/dashboard/Dashboard.*` (o `settings/RoomSettings.*`), tipos.

- [x] Añadir el campo al tipo `Event`:

```typescript
interface Event {
  // ...campos existentes
  reminder_offset: number | null   // minutos antes del inicio; null = sin aviso
}
```

- [x] Selector de recordatorio en `EventModal` (visible al crear **y** al editar). Setea `reminder_offset`, que ya viaja en los payloads `create-event`/`update-event` existentes:

```typescript
const REMINDER_OPTIONS: { label: string; value: number | null }[] = [
  { label: 'Sin recordatorio', value: null },
  { label: '5 minutos antes',  value: 5 },
  { label: '15 minutos antes', value: 15 },
  { label: '30 minutos antes', value: 30 },
  { label: '1 hora antes',     value: 60 },
  { label: '2 horas antes',    value: 120 },
  { label: '1 día antes',      value: 1440 },
  { label: '2 días antes',     value: 2880 }
]
```

- [x] Toggle "Notificaciones en este dispositivo" (en Dashboard o RoomSettings):
  - Activar → `const sub = await subscribeToPush()`; si no es `null`, `socket.emit('subscribe-push', { room, subscription: sub.toJSON() })`.
  - Desactivar → `const sub = await getCurrentSubscription()`; `await sub?.unsubscribe()`; `socket.emit('unsubscribe-push', { endpoint: sub.endpoint })`.
  - Al montar, reflejar el estado real con `getCurrentSubscription()` + `Notification.permission`.
  - Si `Notification.permission === 'denied'`, mostrar aviso de que hay que reactivarlo desde el navegador (no se puede volver a pedir por código).

**Aceptación:** el modal guarda el recordatorio elegido; el toggle registra/borra la suscripción y refleja bien su estado tras recargar.

---

## Fase 7 — Reconciliar `useEventReminders`

**Files:** `client/src/hooks/useEventReminders.*`

- [x] Quitar (o poner tras un flag) la llamada a `Notification` del hook, para que el push del servidor sea la única fuente de recordatorios y no haya avisos duplicados. Si quieres conservar el hook como banner in-app "tienes eventos hoy", déjalo pero sin invocar `Notification`.

**Aceptación:** con push activo, un evento de "hoy" no genera dos notificaciones.

---

## Fase 8 — Prueba end-to-end

- [ ] Servidor y cliente arrancados (`node index.js` / `pnpm dev`), permiso de notificación concedido y toggle activado.
- [ ] Crear un evento cuyo `start - reminder_offset` caiga dentro del próximo minuto o dos.
- [ ] Con la pestaña **cerrada**, confirmar que llega la notificación del sistema.
- [ ] Click en la notificación → abre/enfoca la app.
- [ ] Probar un evento recurrente: cada instancia avisa por separado.
- [ ] Probar un evento de día completo: avisa según las 09:00 locales.

---

## Notas de deploy

- HTTPS obligatorio para service workers y push (localhost exento en dev).
- Configurar `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` en el servidor y `VITE_VAPID_PUBLIC_KEY` en el build del cliente.
- `sw.js` debe servirse desde la raíz del dominio del cliente (scope `/`).
- Mantener el origen CORS de Socket.io en sync con la URL real del cliente.
