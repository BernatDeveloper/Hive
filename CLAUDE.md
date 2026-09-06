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

- Acceso por sala: nombre custom + contraseña obligatoria (mínimo 4 chars)
- Toda la sincronización es por Socket.io (no REST para datos de app; solo existe `GET /health`)
- SQLite guarda los datos en `server/calendario.db`
- Limpieza automática: salas sin actividad en más de 1 año se eliminan al arrancar el servidor y cada 24h
- CORS de Socket.io: en dev acepta cualquier puerto de `localhost`/`127.0.0.1` (`isOriginAllowed` en `server/config/cors.js`); en producción solo `ALLOWED_ORIGINS` (`CLIENT_ORIGIN`) y `*.vercel.app` — mantener `CLIENT_ORIGIN` en sync con la URL real del cliente

## Base de datos (SQLite)

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

- Fila opcional: si no existe, el cliente usa los colores por defecto
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
| category | TEXT | default `'otro'`, ver `EventCategory` |
| recurrence_rule | TEXT | nullable; `daily/weekly/monthly/monthly-first/monthly-last/annual` |
| recurrence_id | TEXT | nullable; UUID compartido por todas las instancias de una serie |
| updated_at | TEXT | updated on each write, used for cleanup |

- `server/db/migrations.js` migra automáticamente (`ALTER TABLE`) las columnas `category`, `recurrence_rule`, `recurrence_id`, `reminder_offset`, `reminder_sent` si faltan en una DB existente

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
| `update-event` | `{ room, event }` | `event-updated` si es evento único; `series-updated` (`{ events }`) si `event.recurrence_id` está presente — afecta a toda la serie |
| `delete-event` | `{ room, id }` | `event-deleted` si es evento único; `series-deleted` (`{ recurrence_id }`) si pertenece a una serie |
| `create-note` | `{ room, title }` | `note-created` (room broadcast) |
| `update-note` | `{ room, note }` | `note-updated` (room broadcast) |
| `delete-note` | `{ room, id }` | `note-deleted` (room broadcast) |
| `create-list` | `{ room, title }` | `list-created` (room broadcast) |
| `delete-list` | `{ room, id }` | `list-deleted` (room broadcast) |
| `create-list-item` | `{ room, listId, text }` | `list-item-created` (room broadcast) |
| `toggle-list-item` | `{ room, id, checked }` | `list-item-updated` (room broadcast) |
| `delete-list-item` | `{ room, id }` | `list-item-deleted` (room broadcast) |

### Payload `access-granted`
```typescript
{
  room: { name, created_at, primary_color, background_color, text_color, sidebar_color },
  events: Event[],
  lists: List[],
  listItems: ListItem[],
  notes: Note[]
}
```

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

- Editar o eliminar cualquier instancia de una serie (evento con `recurrence_id`) afecta a **todas** las instancias (`updateSeries` / `deleteSeries`)
- El selector de recurrencia solo aparece al crear (no al editar un evento ya existente ni una serie)

## Categorías de evento

Definidas en `client/src/features/calendar/categories.ts` (`CATEGORIES`), cada una con label, icono emoji y color hex: `otro, personal, trabajo, social, cumpleanos, vacaciones, salud`. Se usan para:
- Colorear el evento en FullCalendar y en el panel de próximos eventos (si es `'otro'`, se usa el `primary_color` de la sala en su lugar)
- Pills de selección en `EventModal`
- Chips de filtro en `EventsPanel`

## Flujo de usuario

1. Pantalla de inicio → "Crear sala" o "Unirse a sala"
2. Crear: nombre + contraseña + confirmación → `create-room` → auto-join → Dashboard
3. Unirse: nombre + contraseña → `join-room` → Dashboard
   - Si el servidor no responde en 8s (o `connect_error`), el formulario muestra "No se puede conectar con el servidor…" y reactiva el botón (`awaitAuthResponse` en `socket/authFlow.ts`)
4. Dashboard: grid de módulos (Calendario, Listas y Notas, todos activos)
5. Click en módulo → abre el módulo (← Dashboard para volver; en móvil, el header muestra un menú hamburguesa con Ajustes/Salir)
6. Ajustes ⚙ → modal de colores por sala con presets claro/oscuro y preview en vivo (guardados en `room_style`)
7. Notificaciones push: si el usuario activa "Avisos en este dispositivo" (Ajustes de sala), recibe un aviso del sistema para cada evento según el recordatorio elegido en el modal, aunque la app esté cerrada — ver `NOTIFICACIONES.md`

## Estructura de componentes

```
SocketProvider           # context de estado de conexión
└── App
    ├── ConnectionBanner # barra fija "Sin conexión…" cuando el socket lleva >3s sin conectar
    ├── RoomEntry        # home/create/join — auth con timeout de red (awaitAuthResponse)
    └── Dashboard        # composición: monta useRoomStyle/useEvents/useLists/useNotes/useRoomLost + navegación
        ├── RoomSettings # color modal con presets + preview (emits update-room-style, subscribe-push)
        ├── Calendar     # calendar module — recibe events + onCreate/Update/DeleteEvent por props
        │   ├── EventsPanel  # sidebar: próximos eventos agrupados por día, filtro por categoría
        │   └── EventModal   # create/edit/delete evento — categorías, recurrencia, hora opcional
        ├── Lists        # lists module (sidebar + detail panel) — datos + callbacks por props
        └── Notes        # notes module (sidebar + editor panel, auto-save 600ms) — datos + callbacks por props
```

- `Calendar`, `Lists` y `Notes` son responsive: por debajo del breakpoint móvil (`useIsMobile`, 640px) muestran un solo panel a la vez (toggle sidebar ↔ detalle/calendario) en vez del layout de dos columnas de escritorio

## Sistema de colores por sala

El Dashboard calcula CSS custom properties inline a partir de los colores de la sala, derivando extras según si el fondo es oscuro o claro (`isColorDark`):
```
--primary   → primary_color     (botones, highlights, categoría "otro")
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
type EventCategory = 'otro' | 'personal' | 'trabajo' | 'social' | 'cumpleanos' | 'vacaciones' | 'salud'
type RecurrenceRule = 'none' | 'daily' | 'weekly' | 'monthly' | 'monthly-first' | 'monthly-last' | 'annual'

interface Event {
  id: string; room: string; title: string
  start: string; end: string; description: string
  category: EventCategory
  recurrence_rule: RecurrenceRule | null
  recurrence_id: string | null
}

interface Room {
  name: string; created_at?: string
  primary_color: string | null; background_color: string | null
  text_color: string | null; sidebar_color: string | null
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
- Contraseñas hasheadas con `crypto.scryptSync` (Node built-in, sin dependencias extra)
- `socket.once` + cleanup manual para evitar listeners huérfanos en flujos de autenticación (`RoomEntry`); los hooks por dominio usan `socket.on` + cleanup en `useEffect`
- La instancia del socket vive en `client/src/socket/` (URL de `VITE_SOCKET_URL`, fallback `http://localhost:3001`)
- Iconos como componentes SVG inline (sin librería de iconos externa)

## Estructura de archivos (client/src)

```
features/
  auth/         RoomEntry, HomeScreen, CreateRoomForm, JoinRoomForm + auth.css
  dashboard/    Dashboard + dashboard.css, ModuleGrid + module-grid.css, useRoomLost (access-denied → onLeave)
  calendar/     Calendar + calendar.css, EventModal, EventsPanel, categories.ts, useEvents
  lists/        Lists + lists.css, useLists
  settings/     RoomSettings + room-settings.css, useRoomStyle (colors + cssVars)
  notes/        Notes + notes.css, useNotes
socket/
  client.ts             el io() singleton (reconnection explícita, timeout 8s) + rememberRoom/forgetRoom + re-join al reconectar
  SocketProvider.tsx    context: estado de conexión ('connecting'|'connected'|'disconnected')
  useConnection.ts      hook → estado de conexión
  ConnectionBanner.tsx  barra fija "Sin conexión con el servidor" tras 3s de gracia sin conexión (montada en App)
  authFlow.ts           awaitAuthResponse(): listeners `once` + timeout de red (8s) + connect_error, con cleanup único
  connection-context.ts / connection-banner.css / index.ts (barrel)
shared/
  modal.css     estilos base del modal (usado por EventModal y RoomSettings)
hooks/
  useIsMobile           breakpoint responsive (default 640px)
push.ts         helpers de suscripción a Web Push (subscribeToPush, getCurrentSubscription)
index.css       reset, tokens :root, body, inputs, botones, scrollbars (solo global)
```

- **Hooks por dominio** (`useEvents`, `useLists`, `useNotes`, `useRoomStyle`): cada
  uno posee su `useState` (sembrado con los `initial*` de `access-granted`),
  registra sus `socket.on(...)` + cleanup, se auto-refresca desde `access-granted`
  en reconexión, y expone acciones tipadas que envuelven `socket.emit`. Los
  componentes de módulo (`Calendar`, `Lists`, `Notes`) reciben datos + callbacks
  por props y **no importan `socket` ni reciben `room`**.
- `Dashboard` es composición pura (~130 líneas): monta los 4 hooks + navegación.
- `<App>` va envuelto en `<SocketProvider>` (en `main.tsx`).

## Estructura de archivos (server)

```
index.js              bootstrap: env → webpush → initDb → app/io → handlers → schedulers → listen
config/
  env.js              process.loadEnvFile() + objeto `config` (port, clientOrigin, dbPath, vapid)
  webpush.js          webpush.setVapidDetails con config.vapid
  cors.js             ALLOWED_ORIGINS, isOriginAllowed, corsOrigin (firma (origin, cb))
db/
  connection.js       instancia better-sqlite3 (export `db`) + PRAGMA foreign_keys
  schema.js           createSchema() — CREATE TABLE IF NOT EXISTS
  migrations.js       runMigrations() — ALTER TABLE con comprobación + CREATE INDEX
  index.js            initDb() = createSchema + runMigrations; barrel de las queries
  rooms.js / events.js / lists.js / notes.js / push.js   queries por dominio
auth/
  password.js         hashPassword / verifyPassword (scrypt)
services/
  recurrence.js       generateRecurrenceInstances (+ helpers de fecha) — puro, sin DB
  reminders.js        sendPushToRoom, scheduler de recordatorios (setInterval 60s)
  cleanup.js          cleanInactiveRooms + startCleanupScheduler (setInterval 24h)
http/
  app.js              createApp() — express + cors + json + health
  io.js               createIo(httpServer) — new Server con cors de config/cors.js
  health.js           GET /health
sockets/
  index.js            registerSocketHandlers(io) — io.on('connection') registra los 6 grupos
  helpers.js          isNonEmptyString, isAuthedFor, markAuthed, broadcast(io, room, ev, payload)
  rooms.js / events.js / lists.js / notes.js / push.js   un registrador de handlers por dominio
```

## Para deploy

- Actualizar origen CORS: variable de entorno `CLIENT_ORIGIN` (leída en `server/config/env.js`, usada por `server/config/cors.js`)
- Actualizar URL del socket en `client/src/socket.ts` (variable `VITE_SOCKET_URL`, con fallback a `http://localhost:3001`) con la URL real del servidor
