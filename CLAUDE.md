# Calendario Compartido

App de organización colaborativa en tiempo real. Los usuarios crean salas protegidas con contraseña y comparten módulos (calendario, listas, y próximamente notas).

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

## Arquitectura general

- Acceso por sala: nombre custom + contraseña obligatoria (mínimo 4 chars)
- Toda la sincronización es por Socket.io (no REST para datos de app)
- SQLite guarda los datos en `server/calendario.db`
- Limpieza automática: salas sin actividad en más de 1 año se eliminan al arrancar el servidor y cada 24h

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
| start | TEXT | ISO datetime |
| end | TEXT | ISO datetime |
| description | TEXT | default '' |
| updated_at | TEXT | updated on each write, used for cleanup |

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
| `create-event` | `{ room, event }` | `event-created` (room broadcast) |
| `update-event` | `{ room, event }` | `event-updated` (room broadcast) |
| `delete-event` | `{ room, id }` | `event-deleted` (room broadcast) |
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

## Flujo de usuario

1. Pantalla de inicio → "Crear sala" o "Unirse a sala"
2. Crear: nombre + contraseña + confirmación → `create-room` → auto-join → Dashboard
3. Unirse: nombre + contraseña → `join-room` → Dashboard
4. Dashboard: grid de módulos (Calendario y Listas activos, Notas próximamente)
5. Click en módulo → abre el módulo (← Dashboard para volver)
6. Ajustes ⚙ → modal de colores por sala (guardados en `room_styles`)

## Estructura de componentes

```
App
├── RoomEntry           # home/create/join screen
└── Dashboard           # main container with room CSS vars + lists/listItems state
    ├── RoomSettings    # color modal (emits update-room-style)
    ├── Calendar        # calendar module (FullCalendar + EventModal)
    │   └── EventModal  # create/edit/delete event
    ├── Lists           # lists module (sidebar + detail panel)
    └── Notes           # notes module (sidebar + editor panel, auto-save 600ms)
```

## Sistema de colores por sala

El Dashboard aplica los colores de la sala como CSS custom properties inline:
```
--primary  → primary_color     (botones, highlights del calendario)
--bg       → background_color  (fondo principal)
--text     → text_color        (texto)
--surface  → sidebar_color     (tarjetas, header, modales)
```
Si una propiedad es null, el componente usa el valor por defecto (paleta oscura indigo).

## Tipos TypeScript (client)

```typescript
interface Event {
  id: string; room: string; title: string
  start: string; end: string; description: string
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
- `socket.once` + cleanup manual para evitar listeners huérfanos en flujos de autenticación

## Estructura de archivos (client/src)

```
features/
  auth/         RoomEntry, HomeScreen, CreateRoomForm, JoinRoomForm + auth.css
  dashboard/    Dashboard + dashboard.css, ModuleGrid + module-grid.css
  calendar/     Calendar + calendar.css, EventModal
  lists/        Lists + lists.css
  settings/     RoomSettings + room-settings.css
  notes/        Notes + notes.css
shared/
  modal.css     estilos base del modal (usado por EventModal y RoomSettings)
hooks/          useIsMobile
index.css       reset, tokens :root, body, inputs, botones, scrollbars (solo global)
```

## Para deploy

- Actualizar origen CORS en `server/index.js` con la URL real del cliente
- Actualizar URL del socket en `client/src/socket.ts` con la URL real del servidor
