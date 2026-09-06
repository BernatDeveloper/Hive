# Calendario Compartido

App de organización colaborativa en tiempo real. Los usuarios crean salas protegidas con contraseña y comparten módulos (calendario, listas y notas).

## Stack

- **client/**: React 19 + Vite + TypeScript + FullCalendar v6 + Socket.io-client
- **server/**: Node.js v22 + Express v5 + Socket.io v4 + better-sqlite3
- **pnpm** en ambos (nunca npm ni yarn)

## Comandos

```bash
# Servidor (puerto 3001)
cd server && node index.js

# Cliente (puerto 5173)
cd client && pnpm dev

# Tests del servidor (node:test, sin dependencias de test extra salvo socket.io-client)
cd server && pnpm test
```

### Nota Windows: build nativo de better-sqlite3

`server/package.json` declara `pnpm.onlyBuiltDependencies: ["better-sqlite3"]`, pero en pnpm 11 esto no basta por sí solo — `pnpm install` puede devolver `ERR_PNPM_IGNORED_BUILDS` y dejar el addon nativo sin compilar (el server falla con `Could not locate the bindings file`). Si pasa:

```bash
cd server
pnpm approve-builds   # interactivo: espacio para marcar, Enter, y luego 'y'
```

Si no hay TTY disponible (entorno no interactivo), como alternativa se puede forzar la descarga del binario precompilado directamente:
```bash
node node_modules/.pnpm/prebuild-install@*/node_modules/prebuild-install/bin.js --target node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3
```
(ejecutar dentro de `node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3`).

## Arquitectura general

- Acceso por sala: nombre custom + contraseña obligatoria. Salas **nuevas**: mínimo 8 chars, validado en cliente (`CreateRoomForm` + indicador de fortaleza) y en servidor (`MIN_PASSWORD` en `sockets/validate.js`). `join-room` no re-valida longitud (salas antiguas con contraseñas cortas siguen funcionando)
- Toda la sincronización es por Socket.io (no REST para datos de app; solo existe `GET /health`)
- SQLite guarda los datos en `server/calendario.db`
- Limpieza automática: salas sin actividad en más de 1 año se eliminan al arrancar el servidor y cada 24h
- CORS de Socket.io: en dev acepta cualquier puerto de `localhost`/`127.0.0.1` (`isOriginAllowed` en `server/config/cors.js`); en producción solo `ALLOWED_ORIGINS` (`CLIENT_ORIGIN`) y `*.vercel.app` — mantener `CLIENT_ORIGIN` en sync con la URL real del cliente

## Base de datos (SQLite)

Modo **WAL** (`db/connection.js`) — mejores lecturas concurrentes; deja ficheros
`calendario.db-wal` y `calendario.db-shm` (gitignored). Índices creados en
`db/migrations.js`.

### Tabla `room`
| column | type | notes |
|--------|------|-------|
| name | TEXT PK | room name chosen by the user |
| password_hash | TEXT | scrypt with random salt |
| created_at | TEXT | ISO datetime |

### Tabla `room_style`
| column | type | notes |
|--------|------|-------|
| room | TEXT PK FK→room.name | ON DELETE CASCADE |
| primary_color | TEXT | hex, nullable |
| background_color | TEXT | hex, nullable |
| text_color | TEXT | hex, nullable |
| sidebar_color | TEXT | hex, nullable |
| event_colors | TEXT | JSON array de hex (paleta de colores de evento); `[]` si null |

- Fila opcional: si no existe, el cliente usa los colores por defecto y `event_colors: []`
- Permite añadir más propiedades de estilo sin tocar la tabla `room`

### Tabla `event`
| column | type | notes |
|--------|------|-------|
| id | TEXT PK | UUID generated on server |
| room | TEXT | room name |
| title | TEXT | |
| start | TEXT | ISO datetime (con o sin hora) |
| end | TEXT | ISO datetime |
| description | TEXT | default '' |
| category | TEXT | **legacy**, default `'otro'`; el cliente ya no la usa (la migración a `color` la leyó una vez para el backfill). No se borra |
| color | TEXT | nullable; hex `#rrggbb`. null = hereda el `primary_color` de la sala |
| recurrence_rule | TEXT | nullable; `daily/weekly/monthly/monthly-first/monthly-last/annual` |
| recurrence_id | TEXT | nullable; UUID compartido por todas las instancias de una serie (comparten también `color`) |
| updated_at | TEXT | updated on each write, used for cleanup |

- `server/db/migrations.js` migra automáticamente (`ALTER TABLE`) las columnas `category`, `color`, `recurrence_rule`, `recurrence_id`, `reminder_offset`, `reminder_sent` (event) y `event_colors` (room_style) si faltan
- Al añadir `event.color` hace **backfill** desde `category` (mapa hex de las categorías antiguas; `'otro'` → null)

### Tabla `list`
| column | type | notes |
|--------|------|-------|
| id | TEXT PK | UUID generated on server |
| room | TEXT FK→room.name | ON DELETE CASCADE |
| title | TEXT | list name |
| created_at | TEXT | ISO datetime |
| updated_at | TEXT | ISO datetime |

### Tabla `note`
| column | type | notes |
|--------|------|-------|
| id | TEXT PK | UUID generated on server |
| room | TEXT FK→room.name | ON DELETE CASCADE |
| title | TEXT | default 'Sin título' |
| body | TEXT | default '' |
| created_at | TEXT | ISO datetime |
| updated_at | TEXT | updated on each write, used for cleanup |

### Tabla `list_item`
| column | type | notes |
|--------|------|-------|
| id | TEXT PK | UUID generated on server |
| list_id | TEXT FK→list.id | ON DELETE CASCADE |
| room | TEXT | room name (for efficient room-level queries) |
| text | TEXT | item content |
| checked | INTEGER | 0/1, converted to boolean on read |
| created_at | TEXT | ISO datetime |
| updated_at | TEXT | ISO datetime |

## Eventos Socket.io

| Client emits | Payload | Server responds |
|--------------|---------|-----------------|
| `create-room` | `{ name, password }` | `room-created` / `room-error` |
| `join-room` | `{ name, password }` | `access-granted` / `access-denied` |
| `update-room-style` | `{ name, styles }` | `style-updated` (room broadcast) |
| `create-event` | `{ room, event }` | `event-created` si es evento único; `events-created` (array) si `event.recurrence_rule` genera una serie |
| `update-event` | `{ room, event, scope? }` | evento único → `event-updated`. Instancia de serie según `scope`: `single` → `event-updated` (desengancha la instancia); `future` → `series-updated` (`{ events }`, subconjunto con `recurrence_id` nuevo); `all` (defecto) → `series-updated` |
| `delete-event` | `{ room, id, scope? }` | evento único → `event-deleted`. Instancia de serie: `single` → `event-deleted`; `future` → `events-deleted` (`{ ids }`); `all` (defecto) → `series-deleted` (`{ recurrence_id }`). Ack `{ undoToken, label }` (ventana de deshacer) |
| `create-note` | `{ room, title }` | `note-created` (room broadcast) |
| `update-note` | `{ room, note: { id, title, body, updated_at } }` | **ack** `{ status: 'ok'\|'conflict'\|'not-found', note? }` al emisor; en `'ok'` además `note-updated` (room broadcast). `updated_at` = versión base para concurrencia optimista |
| `delete-note` | `{ room, id }` | `note-deleted` (broadcast) + ack `{ undoToken, label }` |
| `create-list` | `{ room, title }` | `list-created` (room broadcast) |
| `delete-list` | `{ room, id }` | `list-deleted` (broadcast) + ack `{ undoToken, label }` (borra en cascada los ítems; el undo los restaura) |
| `create-list-item` | `{ room, listId, text }` | `list-item-created` (room broadcast) |
| `toggle-list-item` | `{ room, id, checked }` | `list-item-updated` (room broadcast) |
| `delete-list-item` | `{ room, id }` | `list-item-deleted` (room broadcast) |
| `undo-delete` | `{ room, token }` | re-inserta lo borrado y difunde su `*-created`; ack `{ ok, expired? }` |
| `get-presence` | `—` | `presence` (`{ count }`) al emisor |
| `subscribe-push` / `unsubscribe-push` | `{ room, subscription }` / `{ endpoint }` | `push-subscribed` / `push-unsubscribed` / `push-error` |

Además, el servidor difunde `presence` (`{ count }`) a la sala al entrar/salir
cualquier socket (`sockets/presence.js`).

### Payload `access-granted`
```typescript
{
  room: { name, created_at, primary_color, background_color, text_color, sidebar_color, event_colors: string[] },
  events: Event[],
  lists: List[],
  listItems: ListItem[],
  notes: Note[]
}
```

El payload `styles` de `update-room-style` puede incluir `event_colors: string[]` (la paleta); si se omite, el servidor conserva la guardada. Se sanea a hex `#rrggbb`, sin duplicados, tope 8.

## Eventos recurrentes

Al crear un evento con `recurrence_rule !== 'none'`, el servidor (`generateRecurrenceInstances` en `server/services/recurrence.js`) genera todas las instancias de golpe y `createEventsBatch` (`server/db/events.js`) las inserta en batch, compartiendo un `recurrence_id`:

| Regla | Horizonte generado |
|-------|---------------------|
| `daily` | 365 días |
| `weekly` | 104 semanas (2 años) |
| `monthly` | 36 meses, mismo día del mes |
| `monthly-first` | 36 meses, primer día de cada mes |
| `monthly-last` | 36 meses, último día de cada mes |
| `annual` | 10 años |

- Al editar/borrar una instancia de serie, el `EventModal` ofrece **alcance**: `single` (solo esa — la desengancha: `recurrence_id`/`recurrence_rule` → NULL), `future` (esa y las siguientes por `start` — reciben un `recurrence_id` nuevo, parte la serie) o `all` (defecto — `updateSeries`/`deleteSeries` por `recurrence_id`). Las instancias comparten `color`.
- El selector de recurrencia solo aparece al crear (no al editar un evento ya existente ni una serie)

## Colores de evento

No hay categorías. Cada sala define su **paleta** de colores de evento en Ajustes (`RoomSettings` → "Colores de eventos", persistida en `room_style.event_colors`). Al crear/editar un evento se elige un color de esa paleta o "Por defecto" (`color: null` → hereda el `primary_color` de la sala). Se usa para:
- Fondo del evento en FullCalendar (texto blanco/oscuro según contraste, `readableTextColor` en `client/src/shared/color.ts`) y punto en el panel de próximos eventos
- Swatches de selección en `EventModal` ("Por defecto" + `room.event_colors`)
- Chips de filtro por color en `EventsPanel` (ocultos si la paleta está vacía)
- Constantes de recurrencia/recordatorio: `client/src/features/calendar/options.ts` (ex-`categories.ts`)

## Flujo de usuario

1. Pantalla de inicio → "Crear sala" o "Unirse a sala"
2. Crear: nombre + contraseña (mín. 8, con indicador de fortaleza) + confirmación → `create-room` → auto-join → Dashboard
3. Unirse: nombre + contraseña → `join-room` → Dashboard
   - Si el servidor no responde en 8s (o `connect_error`), el formulario muestra "No se puede conectar con el servidor…" y reactiva el botón (`awaitAuthResponse` en `socket/authFlow.ts`)
4. Dashboard: grid de módulos (Calendario, Listas y Notas, todos activos)
5. Click en módulo → abre el módulo (← Dashboard para volver; en móvil, el header muestra un menú hamburguesa con Ajustes/Salir)
6. Ajustes ⚙ → modal de colores por sala con presets claro/oscuro, preview en vivo y **paleta de colores de evento** (guardados en `room_style`)
7. Notificaciones push: si el usuario activa "Avisos en este dispositivo" (Ajustes de sala), recibe un aviso del sistema para cada evento según el recordatorio elegido en el modal, aunque la app esté cerrada — ver `NOTIFICACIONES.md`
8. Presencia: el header del Dashboard muestra un punto + número si hay más de un dispositivo conectado a la sala
9. Tras un deploy: el SW nuevo espera; un banner "Hay una versión nueva — Recargar" (`src/pwa.ts`) lo activa (`skipWaiting` bajo demanda) y recarga
10. Calendario → botón ⬇ en el panel de "Próximos": descarga un `.ics` con todos los eventos (`features/calendar/ics.ts`, generado en cliente)
11. Al borrar evento/lista/nota/ítem: toast "«X» eliminado — Deshacer" durante 10s (`useUndo` + `UndoToast` en Dashboard). El servidor guarda una copia (`services/undo.js`, ventana de 12s) y re-inserta con `undo-delete`

## Estructura de componentes

```
SocketProvider           # context de estado de conexión
└── App                  # + useServiceWorkerUpdate() → banner "versión nueva"
    ├── ConnectionBanner # barra fija "Sin conexión…" cuando el socket lleva >3s sin conectar
    ├── RoomEntry        # home/create/join — auth con timeout de red (awaitAuthResponse)
    └── Dashboard        # composición: useRoomStyle/useEvents/useLists/useNotes/useRoomLost/usePresence + navegación (header con indicador de presencia)
        ├── RoomSettings # color modal con presets + preview (emits update-room-style, subscribe-push)
        ├── Calendar     # calendar module — recibe events + onCreate/Update/DeleteEvent por props
        │   ├── EventsPanel  # sidebar: próximos eventos agrupados por día, filtro por color
        │   └── EventModal   # create/edit/delete evento — color de la paleta, recurrencia, hora opcional
        ├── Lists        # lists module (sidebar + detail panel) — datos + callbacks por props
        └── Notes        # notes module (sidebar + editor panel, auto-save 600ms) — datos + callbacks por props
```

- `Calendar`, `Lists` y `Notes` son responsive: por debajo del breakpoint móvil (`useIsMobile`, 640px) muestran un solo panel a la vez (toggle sidebar ↔ detalle/calendario) en vez del layout de dos columnas de escritorio

## Concurrencia en notas (auto-save)

`update-note` usa **concurrencia optimista** por `updated_at`. El editor guarda con
el `updated_at` de la versión sobre la que empezó a escribir (`baseRef` en `Notes.tsx`);
el servidor (`db/notes.js`) responde por ack:
- `ok` → aplica y difunde `note-updated`; el editor avanza su versión base
- `conflict` → **no** aplica; devuelve la versión actual y el editor muestra un
  banner "Otra persona editó esta nota" con "Cargar la versión actual"
- Un editor que **no** tiene cambios sin guardar adopta en vivo las ediciones
  ajenas (`note-updated`) — funciona como lector en tiempo real
- `updated_at` de notas se fuerza estrictamente creciente (`nextTimestamp`) para
  que dos guardados en el mismo ms no compartan testigo de versión

Los eventos no llevan este control: se editan con guardado explícito (modal), no
auto-save, así que la superficie de colisión es mínima (edición de series → Fase 5).

## Sistema de colores por sala

El Dashboard calcula CSS custom properties inline a partir de los colores de la sala, derivando extras según si el fondo es oscuro o claro (`isColorDark`):
```
--primary   → primary_color     (botones, highlights, color de evento por defecto)
--bg        → background_color  (fondo principal)
--text      → text_color        (texto)
--surface   → sidebar_color     (tarjetas, header, modales)
--border    → derivado: rgba blanco/negro según luminosidad del fondo
--surface-2 → derivado: superficie secundaria (hover, inputs)
--muted     → derivado: texto secundario
```
Si una propiedad es null, el componente usa el valor por defecto (paleta clara tipo Apple: `#0071E3` / `#F5F5F7` / `#1D1D1F` / `#FFFFFF`). `RoomSettings` ofrece presets "Claro" y "Oscuro" que rellenan las 4 propiedades base de golpe.

## Tipos TypeScript (client)

```typescript
type RecurrenceRule = 'none' | 'daily' | 'weekly' | 'monthly' | 'monthly-first' | 'monthly-last' | 'annual'

interface Event {
  id: string; room: string; title: string
  start: string; end: string; description: string
  color: string | null   // hex #rrggbb; null = hereda primary_color
  recurrence_rule: RecurrenceRule | null
  recurrence_id: string | null
  reminder_offset: number | null; reminder_sent: 0 | 1
}

interface Room {
  name: string; created_at?: string
  primary_color: string | null; background_color: string | null
  text_color: string | null; sidebar_color: string | null
  event_colors: string[]   // paleta de la sala
}

interface List {
  id: string; room: string; title: string; created_at: string
}

interface ListItem {
  id: string; list_id: string; room: string
  text: string; checked: boolean
}

interface Note {
  id: string; room: string; title: string
  body: string; created_at: string; updated_at: string
}
```

## Convenciones

- Código en inglés (variables, socket events, function names, CSS classes)
- Texto de UI para el usuario en español
- TypeScript en el cliente, JavaScript ESM en el servidor
- Contraseñas hasheadas con `crypto.scrypt` **async** (`promisify`, Node built-in) — formato `<salt hex>:<hash hex>` (64 bytes); `createRoom`/`verifyRoomAccess` y sus handlers son `async`
- `socket.once` + cleanup manual para evitar listeners huérfanos en flujos de autenticación (`RoomEntry`); los hooks por dominio usan `socket.on` + cleanup en `useEffect`
- La instancia del socket vive en `client/src/socket/` (URL de `VITE_SOCKET_URL`, fallback `http://localhost:3001`)
- Iconos como componentes SVG inline (sin librería de iconos externa)

## Estructura de archivos (client/src)

```
features/
  auth/         RoomEntry, HomeScreen, CreateRoomForm, JoinRoomForm + auth.css, password-strength.ts (MIN_PASSWORD=8 + heurística)
  dashboard/    Dashboard + dashboard.css, ModuleGrid + module-grid.css, useRoomLost (access-denied → onLeave), useUndo + UndoToast (toast de deshacer borrado)
  calendar/     Calendar + calendar.css, EventModal, EventsPanel, options.ts (recurrencia/recordatorio), useEvents, ics.ts (export .ics: 1 VEVENT+RRULE por serie, individual para el resto)
  lists/        Lists + lists.css, useLists
  settings/     RoomSettings + room-settings.css, useRoomStyle (colors + cssVars)
  notes/        Notes + notes.css, useNotes (concurrencia optimista por updated_at, ack de update-note)
socket/
  client.ts             el io() singleton (reconnection explícita, timeout 8s) + rememberRoom/forgetRoom + re-join al reconectar
  queue.ts              cola de escrituras offline: emitWrite / emitWriteAck encolan si no hay conexión y vacían en orden al recibir `access-granted`
  usePendingWrites.ts   hook → nº de escrituras encoladas
  SocketProvider.tsx    context: estado de conexión ('connecting'|'connected'|'disconnected')
  useConnection.ts      hook → estado de conexión
  usePresence.ts        hook → nº de dispositivos en la sala (>= 1); pide `get-presence` al montar
  ConnectionBanner.tsx  barra fija "Sin conexión…" tras 3s de gracia (+ "N cambios sin sincronizar" si hay cola), montada en App
  authFlow.ts           awaitAuthResponse(): listeners `once` + timeout de red (8s) + connect_error, con cleanup único
  connection-context.ts / connection-banner.css / index.ts (barrel)
pwa.ts          useServiceWorkerUpdate(): registra el SW, detecta versión en espera, apply() = skipWaiting + reload
app.css         estilos del banner de actualización
shared/
  modal.css     estilos base del modal (usado por EventModal y RoomSettings)
  color.ts      isColorDark / readableTextColor (usado por useRoomStyle, Calendar, EventModal)
hooks/
  useIsMobile           breakpoint responsive (default 640px)
push.ts         helpers de suscripción a Web Push (subscribeToPush, getCurrentSubscription)
index.css       reset, tokens :root, body, inputs, botones, scrollbars (solo global)
```

- **Hooks por dominio** (`useEvents`, `useLists`, `useNotes`, `useRoomStyle`): cada
  uno posee su `useState` (sembrado con los `initial*` de `access-granted`),
  registra sus `socket.on(...)` + cleanup, se auto-refresca desde `access-granted`
  en reconexión, y expone acciones tipadas que envuelven `emitWrite`/`emitWriteAck`
  (cola offline). Los componentes de módulo (`Calendar`, `Lists`, `Notes`) reciben
  datos + callbacks por props y **no importan `socket` ni reciben `room`**.
- `Dashboard` es composición pura (~130 líneas): monta los 4 hooks + navegación.
- `<App>` va envuelto en `<SocketProvider>` (en `main.tsx`).

## Estructura de archivos (server)

```
index.js              bootstrap: env → webpush → initDb → app/io → handlers → schedulers → listen
config/
  env.js              process.loadEnvFile() + valida VAPID_* (falla rápido, exit 1) + objeto `config`
  webpush.js          webpush.setVapidDetails con config.vapid
  cors.js             ALLOWED_ORIGINS, isOriginAllowed, corsOrigin (firma (origin, cb))
lib/
  logger.js           logger mínimo con niveles (error/warn/info/debug, umbral `LOG_LEVEL`, default info)
  rateLimit.js        createRateLimiter({ windowMs, max }) — ventana deslizante en memoria
db/
  connection.js       instancia better-sqlite3 (export `db`) + PRAGMA journal_mode=WAL, foreign_keys=ON
  schema.js           createSchema() — CREATE TABLE IF NOT EXISTS
  migrations.js       runMigrations() — ALTER TABLE con comprobación + índices (por `room` en event/list/list_item/note/push_subscription, `list_item(list_id)`, `event(reminder_sent,start)`)
  index.js            initDb() = createSchema + runMigrations; barrel de las queries
  rooms.js / events.js / lists.js / notes.js / push.js   queries por dominio
auth/
  password.js         hashPassword / verifyPassword (scrypt)
services/
  recurrence.js       generateRecurrenceInstances (+ helpers de fecha) — puro, sin DB
  reminders.js        sendPushToRoom, scheduler de recordatorios (setInterval 60s)
  cleanup.js          cleanInactiveRooms + startCleanupScheduler (setInterval 24h)
  undo.js             stash/pop — tombstones de borrados en memoria (ventana 12s)
http/
  app.js              createApp() — express + cors + json + health
  io.js               createIo(httpServer) — new Server con cors de config/cors.js
  health.js           GET /health
sockets/
  index.js            registerSocketHandlers(io) — io.on('connection') registra los 7 grupos
  helpers.js          isNonEmptyString, isAuthedFor, markAuthed, broadcast(io, room, ev, payload)
  handler.js          safeOn / safeAuthedOn — try/catch + logger + emit de error; reenvían el ack de socket.io al handler; safeAuthedOn además exige isAuthedFor(payload.room)
  validate.js         MAX (longitudes) + MIN_PASSWORD, str/optStr/isObject/isDateish, isValidEventInput, isValidPushSubscription
  presence.js         `presence`/`get-presence` (nº de sockets por sala vía io.sockets.adapter.rooms) + handler `disconnecting`
  undo.js             `undo-delete` → restaura desde la ventana de `services/undo.js`
  rooms.js / events.js / lists.js / notes.js / push.js   un registrador de handlers por dominio
test/
  setup.js            --import de `pnpm test`: env de prueba + DB_PATH temporal por proceso (se borra al salir)
  helpers.js          startTestServer() (compone app/io/handlers sin index.js ni webpush), connect(), once()
  handlers.test.js    integración socket: create/join-room, auth por sala, CRUD de eventos, serie, payload inválido, rate limit
  notes.test.js       concurrencia optimista de notas: ok / conflict / dos editores / LWW sin updated_at / not-found
  series.test.js      alcances de edición/borrado de series: single / future / all + compat sin scope
  presence.test.js    presence sube al entrar, baja al salir, get-presence bajo demanda
  undo.test.js        undo de evento/serie/lista(+ítems)/nota; token caducado; undo de otra sala rechazado
services/recurrence.test.js   unit: generateRecurrenceInstances (todas las reglas/horizontes, propagación, spans, hora)
```

- **Tests** (`node:test`, Node 22): `cd server && pnpm test`. `pnpm-workspace.yaml`
  lleva `verifyDepsBeforeRun: false` porque el chequeo previo de pnpm 11 en Windows
  falla con `ERR_PNPM_IGNORED_BUILDS` de better-sqlite3 aunque el `.node` ya exista.

- **Errores de handler:** cada handler se registra con `safeOn`/`safeAuthedOn`; una
  excepción se loguea (`logger.error('socket:<event>', err)`) y emite su evento de
  error al cliente (`event-error`/`list-error`/`note-error`/`room-error`/`access-denied`/`push-error`),
  nunca tumba el proceso. Nada de `console.*` en el server salvo el mensaje fatal de `env.js`.
- **Autorización por sala:** los 12 handlers de escritura/lectura de datos van por
  `safeAuthedOn` → un socket que no hizo `join-room`/`create-room` para esa sala no
  puede actuar sobre ella (rechazo silencioso). `update-room-style` lo comprueba a
  mano (su clave de sala es `name`). `unsubscribe-push` exige solo estar autenticado
  en alguna sala (el `endpoint` es opaco).
- **Rate limiting:** `create-room` y `join-room` limitan a 10 intentos por IP y
  minuto (`sockets/rooms.js`). La IP viene de `socket.handshake.address`, o de
  `X-Forwarded-For` solo si `TRUST_PROXY=true`.
- **Validación de payloads:** cada handler valida forma y longitudes en el borde
  (`sockets/validate.js`); un payload inválido → `return` sin persistir.

## Para deploy

- Actualizar origen CORS: variable de entorno `CLIENT_ORIGIN` (leída en `server/config/env.js`, usada por `server/config/cors.js`)
- Actualizar URL del socket en `client/src/socket.ts` (variable `VITE_SOCKET_URL`, con fallback a `http://localhost:3001`) con la URL real del servidor
