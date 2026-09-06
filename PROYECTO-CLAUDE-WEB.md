# Instrucciones del proyecto — Calendario Compartido

> Pega este contenido en **Instrucciones del proyecto** (o súbelo como documento de
> conocimiento) de un proyecto de Claude en claude.ai. Resume el `CLAUDE.md` del
> repo para que Claude tenga contexto sin acceso al código.

---

## Qué es

App de organización colaborativa **en tiempo real**. Los usuarios crean **salas
protegidas con contraseña** y comparten tres módulos: **Calendario**, **Listas** y
**Notas**. No hay identidad de usuario: la unidad de acceso y de datos es la sala.

## Cómo trabajar en este proyecto

- **No tienes acceso al repositorio.** Pide siempre el contenido real del archivo
  antes de proponer cambios; no asumas la estructura interna de un componente.
- Al proponer código, indica **ruta completa** del archivo (`client/src/...` o
  `server/...`) y respeta el estilo existente que se te pase.
- Cambios grandes o que tocan varios archivos: primero **plan por fases**, luego
  implementación fase a fase con criterio de aceptación.
- **Idioma:** código (variables, eventos socket, funciones, clases CSS) en
  **inglés**; texto de UI para el usuario en **español**.
- **Cliente en TypeScript**, **servidor en JavaScript ESM**.
- **pnpm siempre**, nunca npm ni yarn.
- Iconos como componentes SVG inline, sin librería de iconos externa.
- Contraseñas: `crypto.scrypt` async (`promisify`, Node built-in); `createRoom`/`verifyRoomAccess` y sus handlers son `async`.

## Stack

| Parte | Tecnología |
|-------|------------|
| `client/` | React 19 + Vite + TypeScript + FullCalendar v6 + Socket.io-client + PWA (service worker) |
| `server/` | Node.js v22 + Express v5 + Socket.io v4 + better-sqlite3 + web-push |
| Puertos | server `3001`, client dev `5173`, client preview `4173` |
| Comandos | `cd server && node index.js` · `cd client && pnpm dev` · `cd server && pnpm test` |
| Tests | `node:test` (Node 22) en `server/`: `services/recurrence.test.js` (unit) + `test/handlers.test.js` (integración socket) |

## Arquitectura general

- Acceso por sala: **nombre custom + contraseña obligatoria**. Salas nuevas: mínimo 8 chars (cliente + servidor, `MIN_PASSWORD`); `join-room` no re-valida longitud.
- **Toda la sincronización de datos va por Socket.io.** No hay REST para datos de
  app; el único endpoint HTTP es `GET /health`.
- SQLite en `server/calendario.db`.
- Limpieza automática: salas sin actividad > 1 año se borran al arrancar el
  servidor y cada 24h.
- CORS de Socket.io (`isOriginAllowed` en `server/index.js`): en dev acepta
  cualquier puerto de `localhost`/`127.0.0.1`; en producción solo
  `ALLOWED_ORIGINS` (env `CLIENT_ORIGIN`) y `*.vercel.app`.
- Web Push: claves VAPID; la **pública** se inyecta en el cliente por build
  (`VITE_VAPID_PUBLIC_KEY`), la **privada** solo vive en el servidor
  (`VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`). Push exige HTTPS en producción
  (localhost exento). El service worker es `client/public/sw.js` (scope `/`).

## Base de datos (SQLite)

Modo **WAL** (`db/connection.js`). `server/db/schema.js` crea las tablas con
`CREATE TABLE IF NOT EXISTS`; `server/db/migrations.js` **migra columnas nuevas
con `ALTER TABLE`** comprobando antes si existen (`event`: `category`, `color`,
`recurrence_rule`, `recurrence_id`, `reminder_offset`, `reminder_sent`;
`room_style`: `event_colors`) y crea los índices (por `room` en las tablas de
datos, `list_item(list_id)`, `event(reminder_sent,start)`).

- **room**: `name` (PK), `password_hash` (scrypt + salt aleatoria), `created_at`
- **room_style**: `room` (PK, FK→room, ON DELETE CASCADE), `primary_color`,
  `background_color`, `text_color`, `sidebar_color` (hex nullable),
  `event_colors` (JSON array de hex — paleta de colores de evento). Fila
  opcional: si no existe, colores por defecto y `event_colors: []`.
- **event**: `id` (UUID), `room`, `title`, `start`, `end`, `description` (`''`),
  `color` (hex `#rrggbb` o null → hereda `primary_color`), `category` (legacy, el
  cliente ya no la usa), `recurrence_rule` (nullable), `recurrence_id` (nullable,
  UUID compartido por la serie — también comparten `color`), `reminder_offset`
  (minutos antes del inicio; null = sin aviso), `reminder_sent` (0/1), `updated_at`
- **list**: `id` (UUID), `room` (FK→room, CASCADE), `title`, `created_at`,
  `updated_at`
- **list_item**: `id` (UUID), `list_id` (FK→list, CASCADE), `room`, `text`,
  `checked` (INTEGER 0/1 → boolean al leer), `created_at`, `updated_at`
- **note**: `id` (UUID), `room` (FK→room, CASCADE), `title` (`'Sin título'`),
  `body` (`''`), `created_at`, `updated_at`
- **push_subscription**: `id` (UUID), `room` (FK→room, CASCADE), `endpoint`
  (UNIQUE), `p256dh`, `auth`, `created_at`

## Eventos Socket.io

| Client emite | Payload | Respuesta servidor |
|--------------|---------|--------------------|
| `create-room` | `{ name, password }` | `room-created` / `room-error` |
| `join-room` | `{ name, password }` | `access-granted` / `access-denied` |
| `update-room-style` | `{ name, styles }` | `style-updated` (broadcast a la sala) |
| `create-event` | `{ room, event }` | `event-created` (único) o `events-created` (array, si `recurrence_rule` genera serie) |
| `update-event` | `{ room, event, scope? }` | único → `event-updated`. Serie según `scope`: `single` → `event-updated` (desengancha); `future` → `series-updated` (recurrence_id nuevo); `all` (defecto) → `series-updated` |
| `delete-event` | `{ room, id, scope? }` | único → `event-deleted`. Serie: `single` → `event-deleted`; `future` → `events-deleted {ids}`; `all` → `series-deleted` |
| `get-presence` | `—` | `presence {count}` (+ broadcast al entrar/salir cualquiera) |
| `create-note` | `{ room, title }` | `note-created` (broadcast) |
| `update-note` | `{ room, note: {id,title,body,updated_at} }` | **ack** `{ status:'ok'\|'conflict'\|'not-found', note? }`; en `ok` además `note-updated` (broadcast). Concurrencia optimista por `updated_at` |
| `delete-note` | `{ room, id }` | `note-deleted` (broadcast) |
| `create-list` | `{ room, title }` | `list-created` (broadcast) |
| `delete-list` | `{ room, id }` | `list-deleted` (broadcast) |
| `create-list-item` | `{ room, listId, text }` | `list-item-created` (broadcast) |
| `toggle-list-item` | `{ room, id, checked }` | `list-item-updated` (broadcast) |
| `delete-list-item` | `{ room, id }` | `list-item-deleted` (broadcast) |
| `subscribe-push` | `{ room, subscription }` | `push-subscribed` / `push-error` |
| `unsubscribe-push` | `{ endpoint }` | `push-unsubscribed` |

**Payload `access-granted`:**
```typescript
{
  room: { name, created_at, primary_color, background_color, text_color, sidebar_color },
  events: Event[], lists: List[], listItems: ListItem[], notes: Note[]
}
```

Convención de auth: `socket.once` + cleanup manual para evitar listeners huérfanos.

## Eventos recurrentes

`generateRecurrenceInstances` en `server/db.js` genera **todas** las instancias de
golpe al crear, insertadas en batch con un `recurrence_id` compartido:

| Regla | Horizonte |
|-------|-----------|
| `daily` | 365 días |
| `weekly` | 104 semanas |
| `monthly` | 36 meses (mismo día) |
| `monthly-first` | 36 meses (día 1) |
| `monthly-last` | 36 meses (último día) |
| `annual` | 10 años |

- Al editar/borrar una instancia de serie, el modal ofrece **alcance**: `single`
  (solo esa, la desengancha), `future` (esa y las siguientes, `recurrence_id`
  nuevo) o `all` (defecto).
- El selector de recurrencia **solo aparece al crear**, no al editar.
- Al editar `start` o `reminder_offset` de un evento ya "avisado", el servidor
  hace `resetReminderSent` (en series, resetea todas las instancias).

## Colores de evento

No hay categorías. Cada sala define su **paleta** de colores en Ajustes
(`RoomSettings` → "Colores de eventos", persistida en `room_style.event_colors`,
viaja en `update-room-style`). Al crear/editar un evento se elige un color de la
paleta o "Por defecto" (`color: null` → hereda el `primary_color`). El texto del
evento se pinta blanco u oscuro según contraste (`shared/color.ts`). El filtro de
`EventsPanel` es por color (oculto si la paleta está vacía). Constantes de
recurrencia/recordatorio en `client/src/features/calendar/options.ts`.

## Notificaciones push

Recordatorio configurable por evento (5 min → 2 días antes) vía Web Push, aunque
la app esté cerrada. Scheduler en `server/services/reminders.js` (`setInterval` cada 60 s)
revisa eventos con `reminder_offset` pendientes. Suscripciones ancladas a la
**sala** → un aviso llega a todos los dispositivos suscritos. Eventos de día
completo (fecha sin hora): la hora efectiva del aviso son las **09:00 locales**.
Detalle completo en `NOTIFICACIONES.md`.

## Estructura de componentes

```
SocketProvider           # context de estado de conexión ('connecting'|'connected'|'disconnected')
└── App
    ├── ConnectionBanner # barra fija "Sin conexión…" cuando el socket lleva >3s sin conectar
    ├── RoomEntry        # home / create / join — auth con timeout de red de 8s (awaitAuthResponse)
    └── Dashboard        # composición: useRoomStyle/useEvents/useLists/useNotes/useRoomLost/usePresence (indicador en el header)
        ├── RoomSettings # colores de sala + paleta de colores de evento (emits update-room-style)
        ├── Calendar     # recibe events + paletteColors + onCreate/Update/DeleteEvent por props (no toca socket)
        │   ├── EventsPanel  # sidebar: próximos eventos por día, filtro por color
        │   └── EventModal   # crear/editar/borrar evento — color de la paleta, recurrencia, hora opcional, recordatorio
        ├── Lists        # datos + callbacks por props
        └── Notes        # editor con auto-save 600ms + concurrencia optimista (banner de conflicto) — datos + callbacks por props
```

Cada hook de dominio (`useEvents`, `useLists`, `useNotes`, `useRoomStyle`) posee su
`useState` sembrado con los `initial*`, registra sus `socket.on(...)` con cleanup,
se auto-refresca desde `access-granted` en reconexión, y expone acciones que
envuelven `socket.emit`.

`Calendar`, `Lists` y `Notes` son responsive: por debajo de 640px (`useIsMobile`)
muestran un solo panel a la vez en vez del layout de dos columnas.

## Sistema de colores por sala

El Dashboard calcula CSS custom properties inline a partir de los colores de la
sala, derivando extras según si el fondo es oscuro o claro (`isColorDark`):

```
--primary   → primary_color      (botones, highlights, color de evento por defecto)
--bg        → background_color    (fondo principal)
--text      → text_color          (texto)
--surface   → sidebar_color       (tarjetas, header, modales)
--border    → derivado (rgba blanco/negro según luminosidad del fondo)
--surface-2 → derivado (superficie secundaria: hover, inputs)
--muted     → derivado (texto secundario)
```

Si una propiedad es null → valor por defecto (paleta clara tipo Apple:
`#0071E3` / `#F5F5F7` / `#1D1D1F` / `#FFFFFF`). `RoomSettings` ofrece presets
"Claro" y "Oscuro" que rellenan las 4 propiedades base de golpe.

## Tipos TypeScript (client)

```typescript
type RecurrenceRule = 'none' | 'daily' | 'weekly' | 'monthly' | 'monthly-first' | 'monthly-last' | 'annual'

interface Event {
  id: string; room: string; title: string
  start: string; end: string; description: string
  color: string | null   // hex #rrggbb; null = hereda primary_color
  recurrence_rule: RecurrenceRule | null
  recurrence_id: string | null
  reminder_offset: number | null   // minutos antes del inicio; null = sin aviso
  reminder_sent: 0 | 1
}

interface Room {
  name: string; created_at?: string
  primary_color: string | null; background_color: string | null
  text_color: string | null; sidebar_color: string | null
  event_colors: string[]   // paleta de la sala
}

interface List     { id: string; room: string; title: string; created_at: string }
interface ListItem { id: string; list_id: string; room: string; text: string; checked: boolean }
interface Note     { id: string; room: string; title: string; body: string; created_at: string; updated_at: string }
```

## Estructura de archivos (client/src)

```
features/
  auth/         RoomEntry, HomeScreen, CreateRoomForm, JoinRoomForm + auth.css, password-strength.ts
  dashboard/    Dashboard + dashboard.css, ModuleGrid + module-grid.css
  calendar/     Calendar + calendar.css, EventModal, EventsPanel, options.ts (recurrencia/recordatorio), ics.ts (export .ics)
  lists/        Lists + lists.css
  settings/     RoomSettings + room-settings.css
  notes/        Notes + notes.css
  cada feature incluye su hook de dominio: useEvents, useLists, useNotes, useRoomStyle,
  useRoomLost — poseen el estado, los socket.on con cleanup, y las acciones (socket.emit)
socket/         client.ts (io singleton + rememberRoom/forgetRoom + re-join), SocketProvider
                (context de estado de conexión), useConnection, usePresence
                (nº de dispositivos en la sala), ConnectionBanner (barra "Sin
                conexión" tras 3s), authFlow.ts (awaitAuthResponse: timeout de
                red 8s en el login), index.ts (barrel)
pwa.ts          useServiceWorkerUpdate(): registro del SW + prompt "versión nueva"
shared/         modal.css (base de modal), color.ts (isColorDark / readableTextColor)
hooks/          useIsMobile (breakpoint 640px)
push.ts         helpers Web Push (subscribeToPush, getCurrentSubscription)
types.ts        tipos compartidos
index.css       reset, tokens :root, body, inputs, botones, scrollbars (solo global)

server/
  index.js            bootstrap (env → webpush → initDb → app/io → handlers → schedulers)
  config/             env.js (valida VAPID_*, exit 1 si falta), webpush.js, cors.js
  lib/                logger.js (niveles, LOG_LEVEL), rateLimit.js (ventana deslizante)
  sockets/presence.js presence / get-presence (nº de sockets por sala)
  db/                 connection.js, schema.js, migrations.js, index.js (initDb + barrel),
                      rooms.js, events.js, lists.js, notes.js, push.js
  auth/password.js    hash + verify (scrypt async)
  services/           recurrence.js (puro), reminders.js (scheduler + push), cleanup.js
  http/               app.js (createApp), io.js (createIo), health.js (GET /health)
  sockets/            index.js (registra), helpers.js, validate.js (formas/longitudes),
                      handler.js (safeOn / safeAuthedOn), + un módulo por dominio
```

Seguridad de socket: `safeAuthedOn` exige `join-room` para la sala antes de
escribir/leer datos; `create-room`/`join-room` con rate limit por IP (10/min);
cada handler valida forma y longitudes del payload en el borde.

## Para deploy

- Origen CORS: variable de entorno `CLIENT_ORIGIN` (leída en `server/config/env.js`,
  usada por `server/config/cors.js`).
- URL del socket: variable `VITE_SOCKET_URL` en el build del cliente
  (`client/src/socket.ts`, con fallback a `http://localhost:3001`).
- Configurar `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` en el
  servidor y `VITE_VAPID_PUBLIC_KEY` en el build del cliente.
- `sw.js` servido desde la raíz del dominio del cliente (scope `/`).
- En Windows, el build nativo de better-sqlite3 puede fallar con
  `ERR_PNPM_IGNORED_BUILDS`; ver el `CLAUDE.md` del repo para el workaround
  (`pnpm approve-builds` o descarga directa del prebuild).
```
