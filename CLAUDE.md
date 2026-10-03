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

# Tests del cliente (vitest — lógica pura: fechas, iCal, colores, contraseña)
cd client && pnpm test
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
- Limpieza automática (`server/services/cleanup.js`, `startCleanupScheduler`, al arrancar y cada 24h): salas sin **ninguna** actividad (evento/ítem/nota) en más de **2 años** se eliminan; eventos cuyo `end` quedó hace más de **3 años** se borran fila a fila (nunca por `recurrence_id`, para no arrastrar instancias futuras de una serie con historial viejo)
- Backup automático (`server/services/backup.js`, `startBackupScheduler`, al arrancar y cada 24h): `VACUUM INTO` a `backups/calendario-YYYY-MM-DD.db` (ruta configurable con `BACKUP_DIR`), conserva las últimas 14 copias
- Apagado ordenado: `SIGTERM`/`SIGINT` cierran `io` (que cierra el HTTP server), hacen `wal_checkpoint(TRUNCATE)` y `db.close()` (`closeDb()` en `db/index.js`) antes de salir, con un timeout de guardia de 5s
- CORS de Socket.io: en dev acepta cualquier puerto de `localhost`/`127.0.0.1` (`isOriginAllowed` en `server/config/cors.js`); en producción solo `ALLOWED_ORIGINS` (`CLIENT_ORIGIN`) y `*.vercel.app` — mantener `CLIENT_ORIGIN` en sync con la URL real del cliente

## Base de datos (SQLite)

Modo **WAL** (`db/connection.js`) — mejores lecturas concurrentes; deja ficheros
`calendario.db-wal` y `calendario.db-shm` (gitignored). El esquema completo
(tablas + índices) vive en `db/schema.js`; `db/migrations.js` es un stub vacío
reservado para el día que haga falta migrar una DB con datos reales (hoy el
proyecto no está desplegado, así que no hay ALTER TABLE que mantener).

### Tabla `room`
| column | type | notes |
|--------|------|-------|
| name | TEXT PK | room name chosen by the user |
| password_hash | TEXT | scrypt with random salt |
| created_at | TEXT | ISO datetime |
| timezone | TEXT | zona IANA (`Intl.supportedValuesOf('timeZone')`); default `'Europe/Madrid'`. Gobierna cuándo disparan los recordatorios push — el display del calendario no cambia |

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
- No guarda paleta de colores de evento: esa paleta es fija y vive en el cliente (`EVENT_COLORS`, ver "Colores de evento"), no es configurable por sala

### Tabla `event`
| column | type | notes |
|--------|------|-------|
| id | TEXT PK | UUID generated on server |
| room | TEXT | room name |
| title | TEXT | |
| start | TEXT | ISO datetime (con o sin hora) |
| end | TEXT | ISO datetime |
| description | TEXT | default '' |
| color | TEXT | nullable; hex `#rrggbb`. null = hereda el `primary_color` de la sala |
| recurrence_rule | TEXT | nullable; `daily/weekly/monthly/monthly-first/monthly-last/annual` |
| recurrence_id | TEXT | nullable; UUID compartido por todas las instancias de una serie (comparten también `color`) |
| reminder_offset | INTEGER | nullable; minutos de antelación del recordatorio push |
| reminder_sent | INTEGER | 0/1; evita reenviar el mismo recordatorio |
| updated_at | TEXT | ISO con milisegundos y `Z` (`toISOString()`), estrictamente creciente (`nextTimestamp`) — testigo de versión para la concurrencia optimista del evento único, además de usarse para cleanup |
| last_editor_name | TEXT | nullable; identidad de dispositivo (Fase 9) de quien creó/editó por última vez — informativa, spoofeable |
| last_editor_color | TEXT | nullable; hex, color de esa identidad |

No existe columna `category`: se eliminó por completo (el color es el único eje de clasificación de un evento — ver "Colores de evento").

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
| last_editor_name | TEXT | nullable; igual que en `event` |
| last_editor_color | TEXT | nullable; igual que en `event` |

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
| `create-room` | `{ name, password, timezone? }` | `room-created` / `room-error`. `timezone` = `Intl.DateTimeFormat().resolvedOptions().timeZone` del creador; si falta o es inválida, `'Europe/Madrid'` |
| `join-room` | `{ name, password, editor_name?, editor_color? }` | `access-granted` / `access-denied`. `editor_name`/`editor_color` = identidad de dispositivo (Fase 9), usada para la presencia de este socket en la sala; ausente o inválida → `'Invitado'` / un hex por defecto |
| `update-room-style` | `{ name, styles }` | `style-updated` (room broadcast) |
| `update-room-timezone` | `{ name, timezone }` | `room-timezone-updated` (`{ name, timezone }`, room broadcast). Evento propio, no mezclado con `update-room-style` |
| `create-event` | `{ room, event }` | `event-created` si es evento único; `events-created` (array) si `event.recurrence_rule` genera una serie. `event.editor_name`/`event.editor_color` (opcionales) se guardan como `last_editor_name`/`last_editor_color` |
| `update-event` | `{ room, event, scope? }` | Evento único (sin `recurrence_id`): concurrencia optimista — `event.expected_updated_at` (opcional) es la versión base; si coincide → `event-updated`; si no → `event-conflict` (`{ current }`) **solo al emisor**, sin persistir; sin `expected_updated_at` → last-write-wins (compat). Instancia de serie según `scope` (siempre LWW, sin control de versión): `single` → `event-updated` (desengancha la instancia); `future` → `series-updated` (`{ events }`, subconjunto con `recurrence_id` nuevo); `all` (defecto) → `series-updated`. En todas las ramas, `event.editor_name`/`event.editor_color` actualizan `last_editor_name`/`last_editor_color` |
| `delete-event` | `{ room, id, scope? }` | evento único → `event-deleted`. Instancia de serie: `single` → `event-deleted`; `future` → `events-deleted` (`{ ids }`); `all` (defecto) → `series-deleted` (`{ recurrence_id }`). Ack `{ undoToken, label }` (ventana de deshacer) |
| `create-note` | `{ room, title, editor_name?, editor_color? }` | `note-created` (room broadcast) |
| `update-note` | `{ room, note: { id, title, body, updated_at, editor_name?, editor_color? } }` | **ack** `{ status: 'ok'\|'conflict'\|'not-found', note? }` al emisor; en `'ok'` además `note-updated` (room broadcast). `updated_at` = versión base para concurrencia optimista |
| `delete-note` | `{ room, id }` | `note-deleted` (broadcast) + ack `{ undoToken, label }` |
| `create-list` | `{ room, title }` | `list-created` (room broadcast) |
| `delete-list` | `{ room, id }` | `list-deleted` (broadcast) + ack `{ undoToken, label }` (borra en cascada los ítems; el undo los restaura) |
| `create-list-item` | `{ room, listId, text }` | `list-item-created` (room broadcast) |
| `toggle-list-item` | `{ room, id, checked }` | `list-item-updated` (room broadcast) |
| `delete-list-item` | `{ room, id }` | `list-item-deleted` (room broadcast) |
| `undo-delete` | `{ room, token }` | re-inserta lo borrado y difunde su `*-created`; ack `{ ok, expired? }` |
| `get-presence` | `—` | `presence` (`{ people: { name, color }[] }`) al emisor |
| `update-identity` | `{ name, identity: { name, color } }` | `presence` (room broadcast, mismo formato que `get-presence`). Refresca en vivo el nombre/color de este socket en la sala (MEJORAS-3) — no persiste nada, no toca `last_editor_*` de eventos/notas (esos son históricos a propósito) |
| `subscribe-push` / `unsubscribe-push` | `{ room, subscription }` / `{ endpoint }` | `push-subscribed` / `push-unsubscribed` / `push-error` |

Además, el servidor difunde `presence` (`{ people: { name, color }[] }`) a la
sala al entrar/salir cualquier socket (`sockets/presence.js`).

### Payload `access-granted`
```typescript
{
  room: { name, created_at, timezone, primary_color, background_color, text_color, sidebar_color },
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

- Al editar/borrar una instancia de serie, el `EventModal` ofrece **alcance**: `single` (solo esa — la desengancha: `recurrence_id`/`recurrence_rule` → NULL), `future` (esa y las siguientes por `start` — reciben un `recurrence_id` nuevo, parte la serie) o `all` (defecto — `updateSeries`/`deleteSeries` por `recurrence_id`). Las instancias comparten `color`.
- El selector de recurrencia solo aparece al crear (no al editar un evento ya existente ni una serie)

## Zona horaria de sala (recordatorios)

Cada sala tiene una `timezone` IANA (`room.timezone`). El **modelo es "hora de
pared, sin instante fijo"** para el cálculo del recordatorio: `effectiveStart`
(`server/services/reminders.js`) toma los dígitos de `event.start` (recortados
a `YYYY-MM-DDTHH:mm`, o `${start}T09:00` si es de día completo) y los
reinterpreta como esa hora de pared **en la zona de la sala**, vía
`zonedWallTimeToInstant` (`server/lib/time.js`). Consecuencia deseada: un
evento "20:00" dispara el push a las 20:00 de la zona configurada, sea cual
sea — si cambias la zona de la sala, el mismo evento recalcula su instante de
disparo sin tocar el evento. **El display del calendario no cambia**: sigue
mostrando la hora de pared tal cual para todos, en cualquier navegador.

- `RoomSettings` tiene un selector de zona (`Intl.supportedValuesOf('timeZone')`)
  que emite `update-room-timezone`.
- `getPendingReminderEvents` (`server/db/events.js`) hace `JOIN` con `room`
  para traer la `timezone` de cada candidato, con una ventana ±18h (más ancha
  que el propio disparo) para no descartar candidatos de borde antes de que
  `effectiveStart` los evalúe zone-aware.

## Concurrencia optimista (eventos y notas)

**Notas** (`update-note`) y **eventos únicos** (`update-event` sin
`recurrence_id`) usan el mismo patrón, por `updated_at`:
- El cliente guarda con la versión base sobre la que empezó a editar
  (`baseRef` en `Notes.tsx`; `event.updated_at` al abrir `EventModal`, enviado
  como `expected_updated_at`)
- El servidor (`db/notes.js` / `db/events.js`) compara esa versión con la
  actual:
  - vigente → aplica y difunde `note-updated`/`event-updated`; avanza la
    versión con `nextTimestamp` (`server/lib/time.js`, ISO ms estrictamente
    creciente — dos guardados en el mismo ms no pueden compartir testigo)
  - obsoleta → **no** aplica; notas responde por **ack** (`{ status: 'conflict', note }`)
    al emisor; eventos emiten **`event-conflict` (`{ current }`) solo al
    emisor** (no hay ack en `update-event`)
  - sin versión base → last-write-wins (compatibilidad)
- Notas: un editor sin cambios sin guardar adopta en vivo las ediciones ajenas
  (lector en tiempo real). Eventos: el modal ya se cierra al guardar
  (optimista), así que el conflicto llega después — `Calendar.tsx` muestra un
  banner "Otra persona cambió «título»…" con "Ver cambios", que reabre
  `EventModal` con la versión del servidor (`Calendar.viewConflict`).
- **Alcance de eventos:** solo la rama de evento único. Las ediciones de serie
  (`single`/`future`/`all`, con `recurrence_id`) siguen en last-write-wins sin
  aviso — no llevan `expected_updated_at`.

## Identidad ligera (sin cuentas)

Nombre + color **por dispositivo**, guardados en `localStorage` (`client/src/features/identity/identity.ts`) — **sin registro, sin servidor**. Es puramente informativa y **spoofeable**: cualquiera en la sala puede ponerse el nombre que quiera. No debe usarse para construir permisos ni un "admin" real.

- `localStorage['identity']`: identidad global `{ name, color }`. `localStorage['identity:<room>']`: override opcional solo para esa sala. `getIdentity(room?)` resuelve: override de esa sala → global → un invitado con color aleatorio de emergencia.
- Alta única: `RoomEntry` intercala una pantalla (`IdentityForm`) antes del primer "Crear sala"/"Unirse a sala" si no hay identidad global aún (`hasIdentity()`); no vuelve a preguntar.
- Editable en cualquier momento desde `RoomSettings` → "Tu identidad" (nombre + `ColorPickerPopover` sobre la paleta de 8 colores + interruptor "Solo en esta sala", que decide si guarda como override de esa sala o como identidad global).
- Se adjunta como `editor_name`/`editor_color` en `join-room` (presencia) y en `create-event`/`update-event`/`create-note`/`update-note` (atribución) — ver más abajo. Servidor: nombre recortado a 40 caracteres, color validado como hex `#rrggbb`; cualquier valor ausente o con forma inválida cae a un valor por defecto (`'Invitado'` / un hex), nunca se rechaza el alta ni la escritura.

### Presencia con nombres

`server/sockets/presence.js` mantiene en memoria `room → Map<socketId, {name, color}>` (poblado en `join-room`, limpiado en `disconnecting`, actualizado en vivo por `update-identity`). El Dashboard muestra hasta 4 avatares con la inicial del nombre (`readableTextColor` para el contraste) + "+N" si hay más (`usePresence` devuelve `PresencePerson[]`, no ya un número); un clic abre un desplegable (`dashboard-presence-popover`) con el nombre y el color de cada persona — se cierra al tocar fuera o con Escape.

Al renombrarse en `RoomSettings`, el guardado emite `update-identity` (además de persistir en `localStorage`) para que el nuevo nombre se vea sin recargar — tanto en el propio header como en el de las demás pestañas de la sala. **Nota de diseño (Fase 9/MEJORAS-3):** `last_editor_name`/`last_editor_color` de eventos y notas son histórico a propósito (quién hizo esa edición en su momento) — `update-identity` no los toca ni debe tocarlos.

El re-join automático al reconectar (`client/src/socket/client.ts`, `socket.on('connect', ...)`) también manda `editor_name`/`editor_color` — leídos con `getIdentity(currentRoom.name)` en el momento de reconectar (no cacheados junto a `currentRoom`, para no reemitir un nombre desactualizado si el usuario se renombró mientras tanto). Sin esto, tras un reinicio del servidor o un corte de red la presencia de ese socket habría vuelto a `'Invitado'`.

### Atribución ("Editado por…")

`event`/`note` guardan `last_editor_name`/`last_editor_color` (se actualizan en cada create/update, incluidas las ramas de serie). `EventModal` (bajo el título, solo al editar) y `Notes` (en la cabecera de la nota seleccionada) muestran "Editado por **X** · hace N" usando `formatRelativeTime` (`client/src/shared/relativeTime.ts`) sobre `updated_at`.

## Colores de evento

No hay categorías ni paleta configurable por sala. Los colores de evento son una **paleta fija global**, igual en todas las salas: `EVENT_COLORS` en `client/src/features/calendar/eventColors.ts` (30 tonos — estilo pastel suave, dos intensidades (claro/medio) por cada una de 15 familias de color, ordenados por matiz; deliberadamente nada de rojo/verde/azul "de libro"). Al crear/editar un evento se elige uno de `EVENT_COLORS` o "Por defecto" (`color: null` → hereda el `primary_color` de la sala). Se usa para:
- Fondo del evento en FullCalendar (texto blanco/oscuro según contraste, `readableTextColor` en `client/src/shared/color.ts`), en vista mes y en vista día por igual (`eventDisplay="block"` — por defecto FullCalendar solo pinta de color los eventos de día completo en vista mes)
- La etiqueta del evento muestra solo el título, nunca la hora (`displayEventTime={false}` en Calendar.tsx) — en vista día la posición en la rejilla ya transmite la hora; en vista mes solo era ruido
- Selector en `EventModal` vía `ColorPickerPopover` ("Por defecto" + `EVENT_COLORS`)
- Constantes de recurrencia/recordatorio: `client/src/features/calendar/options.ts` (ex-`categories.ts`)

No existe `room_style.event_colors` (eliminado): no hay nada que gestionar en Ajustes para esto — "Colores de eventos" ya no es una sección de `RoomSettings`.

### Selector de color como desplegable (`ColorPickerPopover`)

`client/src/shared/ColorPickerPopover.tsx` — botón disparador (anillo/"donut" + nombre del color actual) que abre una lista vertical (anillo + nombre + check en el seleccionado), estilo "elige un color" de Google Calendar/Keep. El anillo (`.color-popover-dot`) es un círculo con el centro hueco (borde grueso de color, fondo = superficie), no relleno. Genérico: recibe `options: { value: string | null; name: string }[]`. Mismo componente y misma semántica (selección única, check) en los dos sitios donde se elige un color:
- `EventModal` — color del evento; opciones = `EVENT_COLORS` (paleta fija pastel, 30 colores con nombre) + "Por defecto"
- `IdentityForm` y `RoomSettings` ("Tu identidad") — color de identidad; opciones = la paleta fija `IDENTITY_COLORS` (`client/src/features/identity/identity.ts`, 16 colores vivos/saturados — tónica distinta a `EVENT_COLORS` a propósito, no pastel), con nombres de presentación en `IDENTITY_COLOR_NAMES` (p. ej. `#0071e3` → "Cobalto") — solo de presentación, no se guardan ni se usan como identificador. Ambas paletas están ordenadas por matiz (rueda de color) para que el popup se vea como una progresión de colores

## Flujo de usuario

1. Pantalla de inicio → "Crear sala" o "Unirse a sala"
2. Si es la primera vez en este dispositivo: pantalla de alta de identidad ("¿Cómo te llamamos?" — nombre + color) antes de continuar; no vuelve a aparecer
3. Crear: nombre + contraseña (mín. 8, con indicador de fortaleza) + confirmación → `create-room` → auto-join → Dashboard
4. Unirse: nombre + contraseña → `join-room` → Dashboard
   - Si el servidor no responde en 8s (o `connect_error`), el formulario muestra "No se puede conectar con el servidor…" y reactiva el botón (`awaitAuthResponse` en `socket/authFlow.ts`)
5. Dashboard: grid de módulos (Calendario, Listas y Notas, todos activos)
6. Click en módulo → abre el módulo (← Dashboard para volver; en móvil, el header muestra un menú hamburguesa con Ajustes/Salir)
7. Ajustes ⚙ → modal de colores por sala con presets claro/oscuro, preview en vivo, **zona horaria de la sala** (gobierna los recordatorios, no el display), **tu identidad** (nombre/color de dispositivo, global o solo para esta sala) y, al final, **exportar calendario (.ics)**, "Restablecer" y "Salir de la sala". Los colores de evento no se configuran aquí — son una paleta fija (ver "Colores de evento")
8. Notificaciones push: si el usuario activa "Avisos en este dispositivo" (Ajustes de sala), recibe un aviso del sistema para cada evento según el recordatorio elegido en el modal, aunque la app esté cerrada — ver `NOTIFICACIONES.md`
9. Presencia: el header del Dashboard muestra hasta 4 avatares (inicial + color de cada identidad conectada) si hay más de un dispositivo en la sala; un clic abre un desplegable con el nombre y color completos de cada persona
10. Tras un deploy: el SW nuevo espera; un banner "Hay una versión nueva — Recargar" (`src/pwa.ts`) lo activa (`skipWaiting` bajo demanda) y recarga
11. Calendario, vistas **mes** y **día** (sin semana), sin panel lateral. Crear un evento sin fecha concreta: botón flotante "+" (esquina inferior derecha). Exportar `.ics` con todos los eventos: fila "Exportar calendario (.ics)" en Ajustes de sala (no en el calendario — ver `features/calendar/ics.ts`, generado en cliente). Navegación estilo Google Calendar: en vista mes, un clic en cualquier parte de un día (hueco vacío o sobre un evento) cambia a la vista día de esa fecha; si ese día no tenía ningún evento, además abre de inmediato el modal de uno nuevo — si ya tenía, solo navega, y desde la vista día se toca el evento que se quiera editar. El enlace "+N más" de un día con muchos eventos lleva igual a su vista día (`moreLinkClick="day"`), en vez del popover propio de FullCalendar; en móvil ese enlace se abrevia a "···". En vista día, seleccionar un hueco de hora sigue abriendo el modal de nuevo evento como siempre. En móvil, deslizar el dedo horizontalmente sobre la rejilla cambia de mes/día (equivalente táctil de "<"/">"), con un pequeño "tirón" animado en la dirección del swipe (`.calendar-swiping-next/prev`, limpiado por `onAnimationEnd`) para que el cambio no se note instantáneo. Los días fuera del mes actual se muestran atenuados (`.fc-day-other { opacity: 0.9 }` — lo bastante tenue para notarse, lo bastante alto para seguir leyéndose), no ocultos; cada celda tiene un alto mínimo (`.fc-daygrid-day-frame`) para que la última fila (normalmente días del mes siguiente) no se comprima hasta perder el número, con scroll vertical de respaldo en `.calendar-main` si aun así no cupieran las 6 filas. Los cinco botones del header (`<`, `>`, Hoy, Mes, Día) son cuadrados y del mismo tamaño; Hoy/Mes/Día muestran un icono en vez de texto (diana / calendario / reloj, vía `mask-image` con `currentColor` — el texto real sigue en el DOM para lectores de pantalla, solo se colapsa visualmente con `font-size: 0`); `<`/`>` ya traían su propio icono de FullCalendar. El título del header es más corto en móvil (`titleFormat={ month: 'short', year: 'numeric' }` → "dic 2026" en vez de "diciembre de 2026"), porque el nombre largo del mes no cabía en una línea junto a los botones y se partía en dos descuadrando el toolbar entero.
12. Al borrar evento/lista/nota/ítem: toast "«X» eliminado — Deshacer" durante 10s (`useUndo` + `UndoToast` en Dashboard). El servidor guarda una copia (`services/undo.js`, ventana de 12s) y re-inserta con `undo-delete`

## Estructura de componentes

```
SocketProvider           # context de estado de conexión
└── App                  # + useServiceWorkerUpdate() → banner "versión nueva"
    ├── ConnectionBanner # barra fija "Sin conexión…" cuando el socket lleva >3s sin conectar
    ├── RoomEntry        # home/identity/create/join — auth con timeout de red (awaitAuthResponse); IdentityForm si no hay identidad de dispositivo aún
    └── Dashboard        # composición: useRoomStyle/useEvents/useLists/useNotes/useRoomLost/usePresence + navegación (header con avatares de presencia)
        ├── RoomSettings # color modal con presets + preview + zona horaria (emits update-room-style, update-room-timezone, subscribe-push)
        ├── Calendar     # calendar module (vistas mes/día, sin panel lateral) — recibe events + onCreate/Update/DeleteEvent por props; banner de conflicto de edición concurrente
        │   └── EventModal   # create/edit/delete evento — color de la paleta, recurrencia, hora opcional
        ├── Lists        # lists module (sidebar + detail panel) — datos + callbacks por props
        └── Notes        # notes module (sidebar + editor panel, auto-save 600ms) — datos + callbacks por props
```

- `Calendar`, `Lists` y `Notes` son responsive: por debajo del breakpoint móvil (`useIsMobile`, 640px) muestran un solo panel a la vez (toggle sidebar ↔ detalle/calendario) en vez del layout de dos columnas de escritorio

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
--primary-rgb → derivado: "r, g, b" de `primary_color` (`hexToRgb` en `shared/color.ts`) — para componer `rgba(var(--primary-rgb), alfa)` en vez de hardcodear el azul por defecto; lo usan "hoy" en el calendario, hovers de botones, fila activa de listas/notas y el resto de brillos semitransparentes basados en el primario
--primary-text → derivado: `readableTextColor(primary_color)` — mismo criterio claro/oscuro que ya usan los eventos (`readableTextColor` por evento en Calendar.tsx), aplicado a todo lo que pinta texto/icono sobre un relleno SÓLIDO del primario: `.btn-primary`, el FAB de nuevo evento, el botón activo de vista (Mes/Día) y el círculo de "hoy" en el calendario, el check de listas marcado, el logo de la pantalla de inicio, el banner de "nueva versión" y `.fc-event-mirror` (la vista previa al arrastrar para seleccionar hora). Antes todos tenían `color: #fff` fijo — con un primario claro (p. ej. un lima) quedaba ilegible
```
Si una propiedad es null, el componente usa el valor por defecto (paleta clara: `#3B82F6` / `#F5F5F7` / `#1D1D1F` / `#FFFFFF` — azul algo más pastel/claro que el original, elegido para quedar bien tanto en superficies claras como oscuras sin perder legibilidad del texto blanco de `.btn-primary`). `RoomSettings` ofrece presets "Claro" y "Oscuro" que rellenan las 4 propiedades base de golpe (el preset "Oscuro" usa su propio azul, `#0A84FF`, ya pensado para fondos oscuros).

## Tipos TypeScript (client)

Cliente y servidor **no comparten tipos** (servidor JS ESM). `client/src/types.ts`
es la fuente; `server/test/contract.test.js` fija la forma exacta de lo que emite
el servidor y falla si deriva.

```typescript
type RecurrenceRule = 'none' | 'daily' | 'weekly' | 'monthly' | 'monthly-first' | 'monthly-last' | 'annual'

interface Event {
  id: string; room: string; title: string
  start: string; end: string; description: string
  color: string | null   // hex #rrggbb; null = hereda primary_color
  recurrence_rule: RecurrenceRule | null
  recurrence_id: string | null
  reminder_offset: number | null; reminder_sent: 0 | 1
  updated_at: string   // testigo de versión (concurrencia optimista, evento único)
  last_editor_name: string | null; last_editor_color: string | null   // identidad de dispositivo (Fase 9)
}

interface Room {
  name: string; created_at?: string
  primary_color: string | null; background_color: string | null
  text_color: string | null; sidebar_color: string | null
  timezone: string   // zona IANA; gobierna los recordatorios, no el display
}

interface PresencePerson {
  name: string; color: string
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
  last_editor_name: string | null; last_editor_color: string | null
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
  auth/         RoomEntry (intercala IdentityForm antes de create/join si hace falta), HomeScreen (incluye aviso del modelo sin cuentas + retención), CreateRoomForm, JoinRoomForm + auth.css, password-strength.ts (MIN_PASSWORD=8 + heurística) + password-strength.test.ts
  identity/     identity.ts (Identity, IDENTITY_COLORS, IDENTITY_COLOR_NAMES, getIdentity/get·setGlobalIdentity/get·setRoomOverride/clearRoomOverride — localStorage) + identity.test.ts (entorno jsdom vía `// @vitest-environment jsdom`), IdentityForm (alta única de nombre+color, color vía `ColorPickerPopover`)
  dashboard/    Dashboard (avatares de presencia en el header, con desplegable de nombres/colores al clic) + dashboard.css, ModuleGrid + module-grid.css, useRoomLost (access-denied → onLeave), useUndo + UndoToast (toast de deshacer borrado)
  calendar/     Calendar (vistas mes/día con FullCalendar — dayGridPlugin + timeGridPlugin; navegación mes→día estilo Google Calendar vía dateClick/eventClick/moreLinkClick="day", ver "Flujo de usuario"; sin panel lateral, botón flotante `.calendar-fab` para nuevo evento; swipe horizontal táctil = prev/next, vía onTouchStart/onTouchEnd) + calendar.css (banner de conflicto de evento + atribución; `.fc-day-today .fc-daygrid-day-number` dimensionado a propósito para ocupar el mismo alto que un número normal — si no, la fila con "hoy" sale más alta que el resto), EventModal (exporta el tipo EventSavePayload = Partial<Event> & { expected_updated_at? }; muestra "Editado por…" al editar; color vía `ColorPickerPopover` + `EVENT_COLORS`; validación visual solo tras un intento de guardar fallido — `.input-error`/`.field-error` en modal.css — para título vacío y hora de fin ≤ inicio, se desactiva sola en cuanto el dato deja de ser inválido; fechas vía `DateField`, wrapper local sobre `<input type="date"/"month">` que (a) oculta el icono nativo del navegador y superpone uno propio coloreado con `var(--text)` y (b) pinta el propio texto del input transparente y superpone el valor ya formateado `dd/mm/aaaa` — el formato del `<input type="date">` nativo lo decide el locale del navegador, no `lang` del HTML ni nada en CSS, igual que con `<input type="time">` y el porqué de TimeSelect; el `<input>` real sigue ahí intacto (valor, teclado, calendario nativo), solo cambia lo que se lee), eventColors.ts (paleta fija de colores de evento, ~30 tonos con nombre — ver "Colores de evento"), options.ts (recurrencia/recordatorio), useEvents (expone `conflict`/`dismissConflict`, escucha `event-conflict`, adjunta editor_name/editor_color a create/update vía getIdentity), dateUtils.ts (helpers de fecha puros: addDaysToDateStr, isoToLocalDate/Time, buildEventDates, formatLocalDate, localDateKey) + dateUtils.test.ts, ics.ts (export .ics: 1 VEVENT+RRULE por serie, individual para el resto, usado desde RoomSettings) + ics.test.ts
  lists/        Lists + lists.css, useLists
  settings/     RoomSettings (colores de sala como lista de filas `.room-color-row` — donut + nombre + hex, cada `<label>` envuelve su `<input type="color">` real (oculto visualmente, no con `display:none`, para que el navegador delegue el click en todo el área y siga abriendo el selector nativo) + selector de zona horaria vía Intl.supportedValuesOf + sección "Tu identidad" + exportar .ics, vía `../calendar/ics`; sin sección de colores de evento — paleta fija, no configurable) + room-settings.css, useRoomStyle (colors + cssVars; fusiona — no sustituye — el estado de sala al recibir style-updated/room-timezone-updated, vía un ref con el valor más reciente)
  notes/        Notes (muestra "Editado por…" en la nota seleccionada) + notes.css, useNotes (concurrencia optimista por updated_at, ack de update-note, adjunta editor_name/editor_color vía getIdentity)
socket/
  client.ts             el io() singleton (reconnection explícita, timeout 8s) + rememberRoom/forgetRoom + re-join al reconectar (incluye editor_name/editor_color vía getIdentity, leída fresca en cada reconexión)
  queue.ts              cola de escrituras offline: emitWrite / emitWriteAck encolan si no hay conexión y vacían en orden al recibir `access-granted`
  usePendingWrites.ts   hook → nº de escrituras encoladas
  SocketProvider.tsx    context: estado de conexión ('connecting'|'connected'|'disconnected')
  useConnection.ts      hook → estado de conexión
  usePresence.ts        hook → PresencePerson[] presentes en la sala; pide `get-presence` al montar
  ConnectionBanner.tsx  barra fija "Sin conexión…" tras 3s de gracia (+ "N cambios sin sincronizar" si hay cola), montada en App
  authFlow.ts           awaitAuthResponse(): listeners `once` + timeout de red (8s) + connect_error, con cleanup único
  connection-context.ts / connection-banner.css / index.ts (barrel)
pwa.ts          useServiceWorkerUpdate(): registra el SW, detecta versión en espera, apply() = skipWaiting + reload
app.css         estilos del banner de actualización
shared/
  modal.css     estilos base del modal (usado por EventModal y RoomSettings; `.modal-close` = botón "×" arriba a la derecha, además de tocar fuera; en móvil es una hoja inferior con `.modal-drag-handle` — ver useSwipeToDismiss)
  useSwipeToDismiss.ts   hook: arrastrar hacia abajo desde el handle del modal lo cierra (móvil); devuelve `style` (transform de arrastre) + `handleProps` (touch handlers) — usado por EventModal y RoomSettings, limitado al handle para no robarle el scroll al contenido
  color.ts      isColorDark / readableTextColor (usado por useRoomStyle, Calendar) + color.test.ts
  relativeTime.ts   formatRelativeTime (ISO → "hace N min/horas/días"; usado por la atribución en EventModal y Notes) + relativeTime.test.ts
  popover.css   CSS base compartida de los desplegables "popup" (disparador + lista vertical con check) — SelectPopover la usa tal cual; ColorPickerPopover le añade el anillo de color (`.popover-color-dot`)
  usePopover.ts   hook de estado compartido por SelectPopover y ColorPickerPopover: abierto/cerrado, click fuera (comprueba tanto el disparador como la lista, portada aparte), Escape, y posición de la lista (`position: fixed`, recalculada en scroll/resize mientras está abierta). Ambos componentes renderizan su lista vía `createPortal` a `document.body` (`.popover-list` con `z-index: 1100`, por encima de `.modal-overlay`) en vez de como hijo normal con `position: absolute`, por dos motivos: (1) dentro de un modal con `overflow-y: auto`, un hijo `absolute` que se sale del modal cuenta igual como contenido desbordado y hace que el modal entero "crezca" (más scroll) para encajarlo; (2) `.modal-overlay` tiene `backdrop-filter`, que crea containing block para descendientes `fixed` — sin portal, el `fixed` quedaría posicionado respecto a ese overlay (con su padding) en vez del viewport, descuadrando las coordenadas. `usePopover` también calcula un `maxHeight` ajustado al espacio real disponible (y abre hacia arriba si no cabe hacia abajo), para que un disparador cerca del final del formulario (p. ej. el selector de hora) no deje opciones inalcanzables fuera de la pantalla. Acepta un `onClose` opcional (p. ej. SelectPopover lo usa para vaciar el buscador al cerrar). Como la lista vive en `<body>` (fuera de `.dashboard`, donde se fijan los colores de la sala como custom properties inline — ver useRoomStyle), `usePopover` lee con `getComputedStyle` el valor ya resuelto de cada token de color en el disparador (que sigue en su sitio real del árbol) y la lista los vuelve a declarar inline sobre sí misma — si no, el desplegable se veía siempre con los colores por defecto de `:root` (claros) sin importar el tema de la sala
  SelectPopover.tsx   desplegable genérico de selección única como popup (sin color) — disparador con la opción actual, lista con check; genérico en el tipo del valor (sirve para string y para number | null); prop `searchable` añade un buscador arriba de la lista (listas largas, p. ej. zona horaria). Usado por: hora/minutos de evento (`TimeSelect` en EventModal, dos instancias De/A), recordatorio de evento (EventModal) y zona horaria de la sala (RoomSettings, con `searchable`) — sustituyen a los `<select>` nativos que tenían antes
  ColorPickerPopover.tsx   selector de color en popup (anillo + nombre + check), construido sobre popover.css — ver "Selector de color como desplegable"; usado por EventModal, IdentityForm y RoomSettings ("Tu identidad")
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
index.js              bootstrap: env → webpush → initDb → app/io → handlers → schedulers → listen; SIGTERM/SIGINT → apagado ordenado
config/
  env.js              process.loadEnvFile() + valida VAPID_* (falla rápido, exit 1) + objeto `config` (incluye `backupDir`)
  webpush.js          webpush.setVapidDetails con config.vapid
  cors.js             ALLOWED_ORIGINS, isOriginAllowed, corsOrigin (firma (origin, cb))
lib/
  logger.js           logger mínimo con niveles (error/warn/info/debug, umbral `LOG_LEVEL`, default info)
  rateLimit.js        createRateLimiter({ windowMs, max }) — ventana deslizante en memoria
  time.js             zonedWallTimeToInstant/tzOffsetMs (zona horaria de sala), isValidTimeZone, nextTimestamp (ISO ms monótono, compartido por notas y eventos)
  time.test.js        unit: zonedWallTimeToInstant en varias zonas/estaciones, isValidTimeZone, nextTimestamp
db/
  connection.js       instancia better-sqlite3 (export `db`) + PRAGMA journal_mode=WAL, foreign_keys=ON
  schema.js           createSchema() — CREATE TABLE IF NOT EXISTS + todos los índices (esquema completo, sin ALTER)
  migrations.js       runMigrations() — stub vacío, reservado para migrar una DB con datos reales en el futuro
  index.js            initDb() = createSchema + runMigrations; closeDb() = wal_checkpoint(TRUNCATE) + db.close(); barrel de las queries
  rooms.js / events.js / lists.js / notes.js / push.js   queries por dominio (rooms.js: createRoom/verifyRoomAccess/updateRoomTimezone; events.js: updateEvent con concurrencia optimista)
auth/
  password.js         hashPassword / verifyPassword (scrypt)
services/
  recurrence.js       generateRecurrenceInstances (+ helpers de fecha) — puro, sin DB
  recurrence.test.js  unit: todas las reglas/horizontes, propagación, spans, hora
  reminders.js        effectiveStart (zone-aware, ver "Zona horaria de sala"), sendPushToRoom, scheduler de recordatorios (setInterval 60s)
  reminders.test.js   unit: effectiveStart para día completo y con hora, distintas zonas
  cleanup.js          cleanInactiveRooms (salas sin actividad > 2 años) + cleanOldEvents (eventos con `end` > 3 años, fila a fila) + startCleanupScheduler (setInterval 24h)
  cleanup.test.js     retención: protege salas con actividad reciente en cualquier tabla, borra inactivas, conserva instancias futuras de una serie vieja
  backup.js           runBackup (VACUUM INTO + poda a 14 copias) + startBackupScheduler (setInterval 24h)
  backup.test.js      backup válido y abrible; poda a 14 con 15 presentes
  undo.js             stash/pop — tombstones de borrados en memoria (ventana 12s)
http/
  app.js              createApp() — express + cors + json (límite 256kb, alineado con MAX.noteBody) + health
  io.js               createIo(httpServer) — new Server con cors de config/cors.js
  health.js           GET /health
sockets/
  index.js            registerSocketHandlers(io) — io.on('connection') registra los 7 grupos
  helpers.js          isNonEmptyString, isAuthedFor, markAuthed, broadcast(io, room, ev, payload)
  handler.js          safeOn / safeAuthedOn — try/catch + logger + emit de error; reenvían el ack de socket.io al handler; safeAuthedOn además exige isAuthedFor(payload.room)
  validate.js         MAX (longitudes) + MIN_PASSWORD, str/optStr/isObject/isDateish, isValidEventInput, isValidPushSubscription
  presence.js         `presence`/`get-presence`/`update-identity` con identidad (room → Map<socketId, {name, color}>, poblado por setPresence() en join-room y refrescado en vivo por update-identity) + handler `disconnecting`
  undo.js             `undo-delete` → restaura desde la ventana de `services/undo.js`
  rooms.js / events.js / lists.js / notes.js / push.js   un registrador de handlers por dominio
test/
  setup.js            --import de `pnpm test`: env de prueba + DB_PATH y BACKUP_DIR temporales por proceso (se borran al salir)
  helpers.js          startTestServer() (compone app/io/handlers sin index.js ni webpush), connect(), once()
  handlers.test.js    integración socket: create/join-room, auth por sala, CRUD de eventos, serie, payload inválido, rate limit
  notes.test.js       concurrencia optimista de notas: ok / conflict / dos editores / LWW sin updated_at / not-found
  series.test.js      alcances de edición/borrado de series: single / future / all + compat sin scope
  presence.test.js    presence con nombre/color al entrar y salir; identidad ausente/inválida cae a valores por defecto; update-identity refresca en vivo (uno mismo y el resto) y exige estar autenticado en la sala
  undo.test.js        undo de evento/serie/lista(+ítems)/nota; token caducado; undo de otra sala rechazado
  event-concurrency.test.js   concurrencia optimista de eventos: ok / conflict (event-conflict) / dos editores / LWW sin expected_updated_at / not-found
  attribution.test.js  last_editor_name/color en create/update de eventos (incl. series) y notas; se restaura correctamente con undo
  contract.test.js    fija la forma exacta de cada objeto/payload que emite el servidor (drift detector vs client/src/types.ts — no hay tipos compartidos automáticos)
```

- **Tests** (`node:test`, Node 22): `cd server && pnpm test`. `pnpm-workspace.yaml`
  lleva `verifyDepsBeforeRun: false` porque el chequeo previo de pnpm 11 en Windows
  falla con `ERR_PNPM_IGNORED_BUILDS` de better-sqlite3 aunque el `.node` ya exista.
- **Tests del cliente** (Vitest): `cd client && pnpm test`. Cubren solo lógica
  pura (sin componentes): `dateUtils.test.ts`, `ics.test.ts`,
  `password-strength.test.ts`, `color.test.ts`, `relativeTime.test.ts`.
  `vite.config.ts` declara `test.environment: 'node'` (no hace falta DOM para
  estos) — la excepción es `identity.test.ts`, que necesita `localStorage`
  real y por eso fija `// @vitest-environment jsdom` en su propia cabecera.

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
