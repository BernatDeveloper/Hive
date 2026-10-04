# Tareas — Calendario Compartido

> Handoff para Claude Code (con acceso al repo). Antes de implementar cualquier
> tarea: **lee los archivos reales implicados** y confirma la estructura interna;
> no asumas nada de lo que se describe aquí sin verificarlo contra el código.

## Reglas del proyecto (recordatorio)

- **pnpm siempre**, nunca npm ni yarn.
- Código (variables, eventos socket, funciones, clases CSS) en **inglés**; texto
  de UI en **español**.
- Cliente TypeScript, servidor JavaScript ESM.
- Iconos = componentes SVG inline, sin librería externa.
- Migraciones SQLite: `ALTER TABLE` comprobando antes si la columna existe
  (patrón ya usado para `category`, `recurrence_rule`, etc.).
- Cambios que tocan varios archivos → primero plan por fases, luego fase a fase
  con criterio de aceptación.
- **No romper la forma del payload `access-granted`** salvo que una tarea lo pida
  explícitamente; el cliente depende de él para hidratar.

## Orden de ejecución recomendado

Las tareas se solapan, así que el orden importa:

1. **Tarea A** — Reestructura backend
2. **Tarea B** — Reestructura frontend (incluye la nueva capa de socket)
3. **Tarea C** — Fix "no hay conexión" (se apoya en la capa de socket de B)
4. **Tarea D** — Categorías → color personalizable por sala

> Alternativa: si se quiere ver antes el resultado visible (colores), hacer **D**
> primero sobre la estructura actual y reubicar durante A/B. Menos limpio.

## Decisiones pendientes de confirmar con el usuario

Ambas tienen default; no bloquean.

- **Filtro del `EventsPanel`** (hoy filtra por categoría): con paleta de sala hay
  un conjunto acotado de colores, así que filtrar por color vuelve a tener
  sentido. *Default:* convertirlo en filtro por color (chips de la paleta).
- **Etiquetas por color en la paleta de sala:** ¿solo color, o color + nombre
  opcional (p. ej. azul = "Trabajo")? Nombrar colores ayuda a accesibilidad, pero
  roza el concepto de categoría que se quería quitar. *Default:* solo color.

---

## Tarea A — Reestructurar backend ✅ HECHA

> Completada. `index.js` es ahora solo bootstrap; el resto se reparte en
> `config/ db/ auth/ services/ http/ sockets/` (ver "Estructura de archivos
> (server)" en `CLAUDE.md`). Cero cambios de comportamiento — smoke test de todos
> los flujos socket pasado contra la DB real. Desviaciones aplicadas respecto a la
> estructura propuesta abajo: `updateSeries`/`deleteSeries` y las queries de
> `reminder_sent` viven en `db/events.js` (no en `services/recurrence.js` ni
> `db/push.js`); `recurrence.js` es puro; añadidos `config/webpush.js`,
> `http/app.js`, `http/io.js`; `cleanInactiveRooms` movido literal a
> `services/cleanup.js`; conexión a la DB eager en `db/connection.js`.

**Problema:** todo vive en `server/index.js`. No escala.

**Leer primero:** `server/index.js`, `server/db.js`, `server/reminders.js`.

**Objetivo:** partir el monolito por responsabilidad, dejando `index.js` como
bootstrap. **Cero cambios de comportamiento**: mismos eventos socket, mismos
payloads, `node index.js` arranca igual.

**Estructura objetivo propuesta** (validar contra el código real antes de mover):

```
server/
  index.js                 # solo bootstrap: crea app, http server, io, arranca schedulers
  config/
    env.js                 # lee y valida env vars (VAPID_*, puertos, CORS origins)
    cors.js                # orígenes permitidos
  db/
    connection.js          # instancia better-sqlite3, PRAGMA (incl. WAL, ver backlog)
    schema.js              # CREATE TABLE IF NOT EXISTS
    migrations.js          # ALTER TABLE con comprobación de existencia
    rooms.js               # queries de room + room_style
    events.js              # queries de event
    lists.js               # queries de list + list_item
    notes.js               # queries de note
    push.js                # queries de push_subscription
  sockets/
    index.js               # registra todos los handlers sobre io/socket
    rooms.js               # create-room, join-room, update-room-style
    events.js              # create/update/delete-event
    lists.js               # create/delete-list, *-list-item
    notes.js               # create/update/delete-note
    push.js                # subscribe/unsubscribe-push
  services/
    recurrence.js          # generateRecurrenceInstances, updateSeries, deleteSeries
    reminders.js           # scheduler (mover desde reminders.js)
    cleanup.js             # borrado de salas inactivas > 1 año
  http/
    health.js              # GET /health
  auth/
    password.js            # hash + verify de contraseñas
```

**Plan por fases:**

- **Fase A0** — Leer los 3 archivos, mapear cada bloque a su destino y **devolver
  el plan de partición concreto** (qué función va a qué archivo) antes de mover
  nada. Criterio: plan aprobado.
- **Fase A1** — Extraer `config/` y `db/` (connection, schema, migrations). El
  resto sigue importando desde ahí. Criterio: arranca, tablas se crean/migran
  igual.
- **Fase A2** — Extraer queries por dominio a `db/*.js`. Criterio: sin cambios de
  comportamiento.
- **Fase A3** — Extraer `services/` (recurrence, reminders, cleanup). Criterio:
  recordatorios y limpieza siguen funcionando.
- **Fase A4** — Extraer `sockets/` (un handler por dominio + `sockets/index.js`).
  `index.js` queda como bootstrap. Criterio: todos los eventos socket responden
  igual que antes.

**Aprovechar la reestructura para** (sin cambiar comportamiento externo):
- Envolver cada handler en try/catch y emitir un error al cliente en vez de dejar
  que una excepción tumbe el proceso.
- Centralizar el patrón de broadcast a la sala en un helper.

**Criterio de aceptación global:** cliente actual funciona sin cambios contra el
servidor reestructurado.

---

## Tarea B — Reestructurar frontend ✅ HECHA

> Completada. `src/socket.ts` → `src/socket/` (client.ts + SocketProvider + useConnection,
> costura para la Tarea C). Hooks por dominio `useEvents`/`useLists`/`useNotes`/`useRoomStyle`
> + `useRoomLost`: cada uno posee su estado, sus `socket.on` con cleanup, se auto-refresca
> desde `access-granted`, y expone acciones que envuelven `socket.emit`. `Calendar`/`Lists`/`Notes`
> ya no importan `socket` ni reciben `room` — datos + callbacks por props. `Dashboard` 241 → 129
> líneas (composición). Verificado: tsc + build + eslint (los 2 errores de `set-state-in-effect`
> son pre-existentes en `Lists`/`Notes`, sin tocar), y check headless en Edge — render de los 3
> módulos + ajustes, roundtrip emit→listener, y rehidratación tras reinicio del servidor. 0 errores.

**Leer primero:** `client/src/features/dashboard/Dashboard.tsx`, `client/src/socket.ts`,
y los componentes que consuman estado de sala (`Calendar`, `Lists`, `Notes`).

**Objetivo:** el árbol por *features* está bien; el punto caliente habitual es que
`Dashboard` sea un god-component que centraliza estado de lists/listItems/notes +
todas las suscripciones socket. Extraer:

- Una **capa de socket** (contexto o módulo) que centralice conexión, estado de
  conexión y (re)suscripción a eventos. Es la base de la Tarea C.
- Hooks por dominio: `useEvents`, `useLists`, `useNotes`, `useRoomStyle`, que
  encapsulen sus `socket.on(...)` y la limpieza de listeners.

> No proponer estructura concreta hasta ver `Dashboard.tsx`: depende de cómo esté
> hoy el estado. Fase B0 = leer y proponer.

**Criterio de aceptación:** misma UX, listeners con cleanup correcto (sin
duplicados al remontar), `Dashboard` reducido a composición.

---

## Tarea C — Fix "no hay conexión" ✅ HECHA

> Completada. `socket/authFlow.ts` → `awaitAuthResponse(listeners, onNetworkError)`:
> registra los `once` + timeout de red (8s) + `connect_error`, con cleanup único;
> `RoomEntry` (create y join, incl. la doble ronda de create) lo usa y aborta al
> desmontar. `reconnection` explícita en `client.ts`. `ConnectionBanner` (montada en
> `App`, dentro de `SocketProvider`) muestra "Sin conexión con el servidor.
> Reintentando…" tras 3s de gracia — el efecto depende de un booleano `connected`,
> no de `status`, para no reiniciar la gracia con la oscilación connecting↔disconnected.
> Rehidratación en reconexión: ya venía de la Tarea B. Verificado e2e en Edge headless:
> join con server caído falla con mensaje en ~3s + botón reactivado + banner; server
> arriba → entra normal; caída con sala abierta → banner y resync automático al volver.

**Problema:** con el servidor apagado, unirse a una sala se queda cargando para
siempre. Causa: el flujo de auth hace `socket.once('access-granted' / 'access-denied')`
y, si el socket nunca conecta, no dispara ninguno de los dos → spinner infinito.

**Leer primero:** `client/src/socket/` (client.ts, SocketProvider.tsx, useConnection.ts —
ya existe la costura de estado de conexión de la Tarea B), `RoomEntry`, `JoinRoomForm`,
`CreateRoomForm`.

**Objetivo:** que el cliente detecte y comunique la falta de conexión, y que se
resincronice al recuperar la red.

**Plan:**

- En `socket.ts`: configurar `reconnection`, `timeout`, y exponer estado de
  conexión (`connect`, `disconnect`, `connect_error`).
- En el flujo de auth (`join-room` / `create-room`): junto al `socket.once` de
  respuesta, añadir un **timeout** (p. ej. 8s) y escuchar `connect_error`. Si no
  hay conexión en ese plazo o falla la conexión → resolver con error de red y
  limpiar los listeners (respetar la convención `socket.once` + cleanup manual).
- UI: mensaje claro en español, p. ej. *"No se puede conectar con el servidor.
  Comprueba tu conexión e inténtalo de nuevo."* y reactivar el botón.
- **Rehidratación en reconexión:** al reconectar, re-emitir `join-room` y refrescar
  el estado (`access-granted` completo) para no perder broadcasts ocurridos
  mientras estaba desconectado.
- **Indicador de estado offline** persistente mientras no haya socket (se conecta
  con el punto de PWA/offline del backlog).

**Criterio de aceptación:** con el servidor apagado, el join falla con mensaje
visible en ≤ ~8s; al levantar el servidor y reintentar, entra normal; si se cae
el server con la sala abierta y vuelve, el estado se resincroniza solo.

---

## Tarea D — Categorías → color personalizable por sala ✅ HECHA

> Completada (D0 storage = columna JSON `event_colors` en `room_style`).
> - **Server:** `event.color TEXT` + `room_style.event_colors TEXT` (schema + migración con
>   comprobación). `db/rooms.js` sanea/persiste la paleta (hex #rrggbb, sin dup, tope 8) y
>   la devuelve en `access-granted`; `update-room-style` sin `event_colors` conserva la
>   guardada. `db/events.js` `sanitizeColor` en INSERT/UPDATE de las 4 funciones;
>   `recurrence.js` propaga `color` a las instancias.
> - **D3:** backfill en la misma migración (`UPDATE event SET color = CASE category …`),
>   `'otro'` → null. `category` se queda en la DB.
> - **Client:** `EventCategory` fuera; `Event.color`, `Room.event_colors`. `categories.ts` →
>   `options.ts` (solo recurrencia/recordatorio). `shared/color.ts` (`isColorDark`,
>   `readableTextColor`). `RoomSettings` sección "Colores de eventos". `EventModal` swatches
>   ("Por defecto" + paleta). `Calendar` `color ?? primary`, texto por contraste.
>   `EventsPanel` filtro por color (oculto si paleta vacía). `Dashboard` pasa `paletteColors`.
> - Verificado: smoke socket (paleta + color + serie + rejoin), migración+backfill sobre
>   copia de la DB real, e2e headless (definir paleta, crear evento con color, filtrar,
>   serie comparte color, recarga persiste). tsc/lint/build OK.

**Objetivo:** eliminar las categorías de evento. **La sala define su propia paleta
de colores de evento en la configuración (`RoomSettings`).** Al crear un evento se
elige un color de esa paleta; si no se elige, hereda el `primary_color` de la sala.

Se parte en tres bloques: paleta de sala (D1), color por evento (D2), migración de
datos existentes (D3).

**Leer primero:** `server/db/rooms.js` y `server/db/events.js` (o donde acaben tras
la Tarea A), `services/recurrence.js`, `client/src/features/settings/RoomSettings.tsx`,
`client/src/features/calendar/{Calendar,EventModal,EventsPanel}.tsx`, `categories.ts`,
`client/src/types.ts`.

### D1 — Paleta de colores en la config de sala

**Almacenamiento (recomendado):** columna JSON en `room_style`,
`event_colors TEXT` (array de hex), vía el patrón `ALTER TABLE` con comprobación.
Viaja con el resto del estilo de sala y se puede plegar en el flujo existente sin
crear eventos socket nuevos.
- *Alternativa normalizada:* tabla `room_event_color` (`id`, `room` FK CASCADE,
  `color`, `position`). Más limpia pero añade superficie. Elegir en la Fase D0.

**Socket:** reutilizar `update-room-style`. El payload `styles` pasa a incluir
`event_colors: string[]`; el servidor lo persiste y hace broadcast con
`style-updated` (ya existe). Sin eventos nuevos.

**Payload `access-granted`:** el objeto `room` incluye `event_colors` (parseado a
`string[]`; `[]` si no hay fila de estilo).

**UI (`RoomSettings`):** nueva sección "Colores de eventos": lista de swatches con
añadir / editar (input de color / hex) / quitar. Los presets "Claro" y "Oscuro"
pueden sembrar también una paleta por defecto. Emite `update-room-style` con el
array actualizado.

### D2 — Color por evento

**Servidor:** `ALTER TABLE event ADD COLUMN color` (nullable), patrón
comprobar-si-existe. `color` entra en INSERT/UPDATE/SELECT y en el payload. En
recurrencia, las instancias heredan el `color` del evento base.

**Cliente:**
- `types.ts`: en `Event`, sustituir `category: EventCategory` por
  `color: string | null`. Eliminar `EventCategory`. Añadir `event_colors: string[]`
  al tipo de sala/estilo.
- Borrar `client/src/features/calendar/categories.ts` y todos sus usos.
- `EventModal`: sustituir el selector de categoría por un **selector de color** que
  muestra los swatches de `room.event_colors` + opción "Por defecto"
  (= `primary_color`, guardado como `color: null`). No hay hex libre por evento;
  el hex libre vive en la config de sala.
- `Calendar`: color del evento = `event.color ?? primary_color`.
- `EventsPanel`: convertir el filtro por categoría en filtro por color sobre la
  paleta (o quitarlo — ver decisión pendiente).

### D3 — Migración de eventos existentes

Los eventos actuales tienen `category` pero no `color`. En la misma migración que
añade `color`, **backfill**: para eventos con `category` distinta de `'otro'`,
rellenar `color` con el hex que esa categoría tenía en `categories.ts` (replicar
el mapa hex en el servidor, ya que `categories.ts` es de cliente y se va a borrar).
Los `'otro'` quedan con `color = null` → renderizan `primary_color`. Así los
eventos ya creados conservan su aspecto.

> No borrar la columna `category` en esta pasada (dejar limpieza posterior
> opcional para no arriesgar datos).

**Criterio de aceptación:**
- Se puede definir/editar/quitar colores de la paleta en `RoomSettings` y se
  propaga en tiempo real a la sala.
- Crear evento sin tocar color → sale con `primary_color`; con color de la paleta
  → respeta el color; series recurrentes comparten color.
- Eventos previos conservan color equivalente al de su antigua categoría.
- No queda ninguna referencia a `category` / `categories.ts` en cliente.

**Accesibilidad (nota):** con color como único distintivo, quien tenga daltonismo
pierde señal. Mantener el título del evento siempre legible y con buen contraste;
la opción de nombrar colores en la paleta (decisión pendiente) mitigaría esto.

---

## Convenciones de implementación

- Un handler socket por dominio; broadcast a la sala vía helper común.
- Todo emit de escritura tiene su evento de respuesta/broadcast (ya es el patrón).
- Errores de servidor → emitir evento de error al cliente, nunca dejar caer el
  proceso; el cliente los muestra en UI en español.
- Mantener sincronizados los tipos de `client/src/types.ts` con las formas reales
  que emite el servidor.

---

## Mejoras sugeridas (backlog, no pedidas)

Priorizadas. Comentar con el usuario antes de meter cualquiera.

### Seguridad (lo más urgente)
- **Rate limiting en `join-room` / `create-room`.** Con contraseña mínima de 4
  chars y sin throttling, el espacio es brute-forceable trivialmente. Añadir
  límite de intentos por IP/sala.
- **Hash de contraseña async.** `scryptSync` bloquea el event loop en cada
  login/creación. Migrar a la versión async de `scrypt`.
- **Validación de payloads socket.** Un payload malformado puede tumbar un
  handler. Validar en el borde de cada handler (manual o zod).

### Sincronización / datos
- **Notas: last-write-wins con auto-save.** Dos personas editando la misma nota se
  pisan sin aviso — es el punto más frágil para una app "tiempo real". Como
  mínimo documentarlo; idealmente merge por `updated_at` o edición por bloques.
  (Los eventos son más discretos y aguantan mejor, pero conviene revisarlos.)
- **Limpieza de suscripciones push muertas.** `web-push` devuelve `410 Gone` al
  caducar una suscripción; borrarla de `push_subscription` para que la tabla no
  crezca con suscripciones muertas y no se reintente enviarles.
- **WAL en SQLite** (`PRAGMA journal_mode = WAL`) para mejores lecturas
  concurrentes.

### Recurrencia
- **Editar "este y los siguientes".** Hoy editar/borrar cualquier instancia afecta
  a toda la serie, que es lo más tosco. "This and future" es el patrón esperado.
- **Considerar RRULE estándar** si algún día se quiere exportar a iCal.

### PWA / offline
- Definir qué pasa sin red (indicador offline, posible cola de acciones). Se
  conecta con la Tarea C.
- **Flujo de actualización del service worker:** al desplegar cliente nuevo, los
  usuarios se quedan en el SW viejo. Añadir prompt de "hay una versión nueva,
  recarga" (skipWaiting controlado).

### Calidad / DX
- **Sin tests.** Al menos smoke tests de handlers socket y de
  `generateRecurrenceInstances` (la recurrencia rompe en silencio con facilidad).
- **`.env.example` + validación de env al arrancar** (fallar rápido si falta un
  `VAPID_*`); encaja con `config/env.js` de la Tarea A.
- **Tipos compartidos client/server** se mantienen a mano y derivan con el tiempo.
  Valorar paquete de tipos compartido o JSDoc + `checkJs` en el servidor.
