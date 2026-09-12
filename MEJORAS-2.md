# MEJORAS-2 — Calendario Compartido

> Plan de trabajo por fases para pasar a **Claude Code**. Continúa MEJORAS.md /
> las Fases 0–6. Estado del código base a `8d73079`.
>
> **Regla de oro (del proyecto):** Claude Code **debe leer el archivo real antes
> de editarlo**. No asumir la estructura interna de ningún componente. Cada tarea
> lista los archivos a leer.

## Convenciones (aplican a todas las fases)

- **pnpm** siempre (nunca npm/yarn). Cliente **TypeScript**, servidor **JavaScript ESM**.
- Texto de UI para el usuario en **español**; código (variables, eventos socket,
  funciones, clases CSS) en **inglés**.
- Iconos como componentes SVG inline (sin librería externa).
- Contraseñas: `crypto.scryptSync` (built-in). **Preferir soluciones built-in a
  añadir dependencias.** Cualquier dep nueva debe justificarse (ver decisiones abiertas).
- Al proponer código, indicar **ruta completa** (`client/src/...` o `server/...`).

## Contexto crítico: la app NO está desplegada

**La base de datos no tiene datos reales ni existe ningún despliegue.** Esto
habilita cambios de esquema **directos en `createSchema`** sin escribir
migraciones `ALTER TABLE`, y permite **borrar `server/calendario.db`** (junto con
`-wal` y `-shm`) para partir de un esquema limpio. Aprovechamos esto en la Fase 7.

## Decisiones (cerradas)

1. **`helmet`: fuera por ahora.** La superficie HTTP es solo `GET /health` (todo
   lo demás va por sockets), así que aporta poco. Se retoma cuando exista superficie
   REST (p. ej. el feed iCal). Sí se mantiene `express.json({ limit: '256kb' })`.
2. **Zona horaria: `Intl` built-in** (sin dependencias), zona editable por sala.
3. **Columna `category`: eliminar por completo** (Tarea 7.8). La app no está
   desplegada ni tiene datos, así que se hace de raíz sin migración.

---

# Fase 7 — Higiene y seguridad de datos ✅ HECHA

Objetivo: dejar el proyecto sin código muerto, con el esquema consolidado, con
los datos protegidos (backup + apagado ordenado + retención sensata y
documentada) y con un baseline de tests en el cliente.

> **Completada.** 7.1–7.8 implementadas tal cual se especifican, con estas
> notas de implementación:
> - 7.3: `config.backupDir` (nuevo, `BACKUP_DIR` env, default `./backups`)
>   añadido a `config/env.js` para poder aislarlo en tests (`test/setup.js`
>   genera uno temporal por proceso, igual que `DB_PATH`). `runBackup()` borra
>   el fichero del día si ya existe antes de `VACUUM INTO` (evita que un
>   segundo arranque el mismo día falle porque el destino ya existe).
> - 7.6: `dateUtils.ts` incluye además `buildEventDates()`, que encapsula toda
>   la lógica de `finalStart`/`finalEnd` de `EventModal.save()` (no solo los
>   helpers sueltos) — es la parte con más bugs históricos y la que más valía
>   la pena poder testear de forma aislada.
> - 7.8: el cliente (`types.ts`, `EventModal`, `EventsPanel`, `Calendar.tsx`,
>   `categories.ts`) ya no tenía ninguna referencia a `category` — quedó
>   limpio en la Tarea D. Solo hizo falta tocar el servidor
>   (`schema.js`, `db/events.js`, `services/recurrence.js`) y
>   `test/contract.test.js`.
> - Server: 53 tests en verde (45 + 8 nuevos: `cleanup.test.js`,
>   `backup.test.js`). Cliente: 33 tests en verde (Vitest, nuevo), build y
>   `tsc` limpios. Los 2 errores de lint pre-existentes
>   (`react-hooks/set-state-in-effect` en `Lists.tsx`/`Notes.tsx`) siguen sin
>   tocar — están fuera del alcance de esta fase (ver Apéndice, CI).

## 7.1 — Limpieza de código muerto + consolidación de esquema

**Hallazgo (verificado en el código actual):** en una DB nueva,
`server/db/schema.js::createSchema()` ya crea en la tabla `event` las columnas
`category`, `color`, `recurrence_rule`, `recurrence_id`, y en `room_style` la
columna `event_colors`. Por tanto, en `server/db/migrations.js::runMigrations()`
los bloques `if (!eventCols.includes('category'|'recurrence_rule'|'recurrence_id'|'color'))`
y `if (!styleCols.includes('event_colors'))` **nunca se ejecutan** sobre una DB
nueva, y el bloque de `color` (el `ALTER` + el `UPDATE ... CASE category` de
backfill) es **inalcanzable**. Solo `reminder_offset` y `reminder_sent` faltan en
`createSchema`, así que **únicamente esos dos `ALTER` son load-bearing**.

**Archivos:**
- Modificar: `server/db/schema.js`
- Modificar: `server/db/migrations.js`
- (Leer antes: ambos, y `server/db/index.js` para ver el orden `createSchema()` → `runMigrations()`.)

**Cambios:**
1. En `schema.js`, añadir a la definición de la tabla `event` las dos columnas que
   hoy se añaden por migración:
   ```sql
   reminder_offset INTEGER,
   reminder_sent INTEGER DEFAULT 0
   ```
2. Mover el bloque de índices (`CREATE INDEX IF NOT EXISTS ...`, incluido
   `idx_event_reminder ON event(reminder_sent, start)`) de `migrations.js` a
   `createSchema()` en `schema.js`, al final (ya no hay razón para tenerlos en
   migraciones: `reminder_sent` existirá en la creación).
3. En `migrations.js`, **eliminar por completo** todos los `if (!...includes(...))`
   de columnas (`category`, `recurrence_rule`, `recurrence_id`, `reminder_offset`,
   `reminder_sent`, `color` con su backfill, `event_colors`). Dejar `runMigrations`
   como función vacía documentada ("reservada para futuras migraciones sobre DBs
   con datos") **o** eliminar la función y su llamada en `db/index.js`. Recomendado:
   dejar el stub vacío para no tocar `initDb()`.
4. **Eliminar `server/calendario.db`, `server/calendario.db-wal`,
   `server/calendario.db-shm`** si existen (no hay datos reales).

**Criterios de aceptación:**
- Arrancar el servidor con la DB borrada crea una DB con **todas** las columnas
  que usa la app (incluidas `reminder_offset`, `reminder_sent`) y todos los índices.
- No queda **ninguna** referencia al mapa de colores por categoría
  (`#30d158`, `#0071e3`, …) en el backfill.
- `getPendingReminderEvents` y los recordatorios siguen funcionando (el índice
  `idx_event_reminder` existe).
- Los 45 tests del servidor siguen en verde.

## 7.2 — Política de retención (revisada y segura)

**Archivos:**
- Modificar: `server/services/cleanup.js`
- Test: `server/` (añadir test siguiendo el estilo `node:test` existente).

**Cambios:**

1. **Corregir un bug pre-existente en la detección de inactividad.** La query
   actual usa:
   ```sql
   HAVING COALESCE(MAX(e.updated_at), MAX(li.updated_at), MAX(n.updated_at), r.created_at) < datetime('now', '-1 year')
   ```
   `COALESCE` devuelve el **primer valor no nulo**, no el más reciente. Si una
   sala tiene un evento viejo pero una nota o ítem recientes, `MAX(e.updated_at)`
   (no nulo, antiguo) se usa e **ignora** la actividad reciente de las otras
   tablas → una sala viva se marcaría como inactiva y se borraría. Sustituir por
   una condición donde **todas** las señales de actividad deben ser anteriores al
   umbral (y `COALESCE(..., '')` hace que la ausencia de una tabla no proteja la
   sala, porque `''` ordena antes que cualquier fecha):
   ```sql
   HAVING COALESCE(MAX(e.updated_at),  '') < datetime('now', '-2 years')
      AND COALESCE(MAX(li.updated_at), '') < datetime('now', '-2 years')
      AND COALESCE(MAX(n.updated_at),  '') < datetime('now', '-2 years')
      AND r.created_at                      < datetime('now', '-2 years')
   ```
   Esto además aplica el nuevo umbral: **salas inactivas > 2 años** (antes 1).

2. **Eventos con `end` anterior a hace 3 años** → borrado. Añadir una función
   `cleanOldEvents()` en el mismo archivo, invocada en el mismo tick del scheduler
   (junto a `cleanInactiveRooms`):
   ```js
   // Umbral = fecha (YYYY-MM-DD) de hace 3 años.
   const threshold = new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000)
     .toISOString().slice(0, 10) // "YYYY-MM-DD"
   const info = db.prepare('DELETE FROM event WHERE end < ?').run(threshold)
   if (info.changes > 0) logger.info(`Cleanup: ${info.changes} eventos antiguos borrados`)
   ```
   Actualizar `startCleanupScheduler` para que llame también a `cleanOldEvents()`
   (arranque + cada 24 h).

**⚠️ CRÍTICO — no arrastrar series vivas:** esta limpieza **debe** borrar
instancias individuales con un `DELETE` directo por fecha. **NO** agrupar por
`recurrence_id`, **NO** llamar a `deleteSeries` ni a `deleteSeriesFuture`. Como
cada instancia recurrente es una fila independiente, `WHERE end < threshold` borra
solo las viejas y deja intactas las futuras de la misma serie (p. ej. el cumpleaños
anual de 2022 se borra; el de 2026 se conserva). Un `DELETE` que tocara
`recurrence_id` se llevaría por delante instancias futuras — es exactamente lo que
hay que evitar. La comparación de strings es válida porque `end` empieza por
`YYYY-MM-DD` tanto en eventos de día completo como con hora.

**Criterios de aceptación:**
- Test: crear una serie anual con instancias en 2021, 2022, …, 2027 (mismo
  `recurrence_id`), ejecutar la limpieza con "hoy" ≈ 2026, y verificar que quedan
  **exactamente** las instancias con `end >= hace 3 años` y que **ninguna**
  instancia futura de la serie se borró.
- El test comprueba que `deleteSeries` **no** se invoca durante la limpieza de
  eventos viejos.
- Salas con actividad en los últimos 2 años no se borran; salas sin actividad > 2
  años sí.

## 7.3 — Backup automático de SQLite

**Archivos:**
- Crear: `server/services/backup.js`
- Modificar: `server/index.js` (arrancar el scheduler de backup)
- Modificar: `server/config/env.js` si se quiere una ruta de backups configurable.
- (Leer: `server/db/connection.js` para importar `db`.)

**Cambios:**
- `VACUUM INTO` a una carpeta `backups/` con nombre por fecha, y retención de las
  últimas **14** copias (borrar las más antiguas). `VACUUM INTO` **no admite
  parámetros bind**; la ruta se interpola, pero la generamos nosotros (fecha
  controlada, sin entrada de usuario). Usar comillas simples:
  ```js
  const file = `backups/calendario-${new Date().toISOString().slice(0,10)}.db`
  db.exec(`VACUUM INTO '${file}'`)
  ```
- Programar: una copia al arrancar + cada 24 h (`setInterval`), en línea con el
  patrón de `startCleanupScheduler`.

**Criterios de aceptación:**
- Al arrancar se crea un archivo de backup válido (se puede abrir como DB SQLite).
- Con 15 backups presentes, tras un tick quedan 14 (se borra el más antiguo).

## 7.4 — Apagado ordenado (graceful shutdown)

**Archivos:**
- Modificar: `server/index.js`
- Modificar: `server/db/index.js` (exportar `closeDb()` que haga
  `wal_checkpoint(TRUNCATE)` + `db.close()`), leyendo `server/db/connection.js`.

**Cambios:**
- Handlers de `SIGTERM` y `SIGINT` que, en orden: `io.close()` →
  `httpServer.close()` → `db.pragma('wal_checkpoint(TRUNCATE)')` → `db.close()` →
  `process.exit(0)`. Con un timeout de guardia (p. ej. 5 s) que fuerce la salida
  si algo se cuelga.

**Criterios de aceptación:**
- Enviar `SIGTERM` cierra el proceso sin errores; el fichero `-wal` queda
  truncado (checkpoint aplicado).

## 7.5 — Aviso de modelo + retención en Home, y endurecimiento básico

**Archivos:**
- Modificar: `client/src/features/auth/HomeScreen.tsx` (**leer primero**).
- Modificar: `server/http/app.js`.

**Cambios:**
1. En `HomeScreen`, un párrafo breve en español que explique: (a) modelo sin
   cuentas — se comparte nombre de sala + contraseña con el grupo; (b) política de
   retención: las salas sin actividad durante **2 años** y los eventos de hace más
   de **3 años** se eliminan automáticamente. (Texto informativo tipo aviso, no
   modal bloqueante.)
2. Endurecimiento barato en `app.js`:
   - `express.json({ limit: '256kb' })` en vez del límite por defecto (~100 KB),
     para alinearlo con `MAX.noteBody` (100.000).
   - (`helmet` queda descartado por ahora — ver Decisiones. Retomar cuando exista
     superficie REST.)

**Criterios de aceptación:**
- La Home muestra el texto del modelo y la retención.
- Un body > 256 KB se rechaza con 413.

## 7.6 — Vitest + tests de lógica pura del cliente

**Archivos:**
- Modificar: `client/package.json` (añadir `vitest`, `jsdom` como devDeps y script
  `"test": "vitest run"`).
- Modificar: `client/vite.config.ts` (config de test si hace falta).
- Crear: tests junto a cada módulo (`*.test.ts`).
- **Leer primero:** `client/src/features/calendar/EventModal.tsx` para localizar los
  helpers de fecha y sus nombres reales (`isoToLocalDate`, `addDaysToDateStr`, la
  lógica `finalStart`/`finalEnd`, o como se llamen).

**Cambios:**
1. Si los helpers de fecha están **inline** en `EventModal`, extraerlos a un módulo
   puro (p. ej. `client/src/features/calendar/dateUtils.ts`) para poder testearlos
   sin render. El componente los importa.
2. Tests de lógica pura para:
   - Los helpers de fecha extraídos (casos límite: cambio de mes, día completo vs
     con hora, `finalStart`/`finalEnd`). Esta zona ha tenido bugs históricos.
   - `client/src/features/calendar/ics.ts` (`eventsToICS`).
   - `client/src/features/auth/password-strength.ts` (o su ruta real).
   - `client/src/shared/color.ts` (`readableTextColor`, `isColorDark`).

**Criterios de aceptación:**
- `pnpm -C client test` en verde, cubriendo los casos límite de fecha citados.

## 7.7 — Quick wins

**Cambios (cada uno trivial; leer el archivo antes de tocar):**
- Añadir `favicon.svg` a `client/public/` (o apuntar `index.html` a `icon-192.png`)
  → elimina el 404 por carga.
- `<title>` de `client/index.html` → **"Calendario Compartido"**.
- Escribir un `README.md` real (hoy es `# Sared-Calendar`, con typo).
- `engines: { "node": ">=22" }` en **ambos** `package.json` (Node 22 obligatorio:
  `process.loadEnvFile`, `node:test`).
- Alinear `maxLength` de `CreateRoomForm` con `MAX.roomName` del servidor (leer
  ambos; hoy 30 vs 60).
- Borrar assets no usados (`client/src/assets/hero.png`, `react.svg`, `vite.svg`)
  tras verificar que no se importan en ningún sitio.

**Criterios de aceptación:**
- Sin 404 de favicon; título correcto; `pnpm -C client build` sin warnings nuevos.

## 7.8 — Eliminar `category` por completo

Objetivo: la app usa `color` (columna propia; `null` = hereda `primary_color` de la
sala) como único eje de color. `category` es peso muerto que aún se escribe
(`'otro'` por defecto) y aparece en los tipos. Como no hay datos ni despliegue, se
elimina de raíz sin migración.

**Archivos (leer cada uno antes de editar):**
- Servidor: `server/db/schema.js`, `server/db/events.js`,
  `server/sockets/validate.js` (comprobar si `isValidEventInput` valida `category`).
- Cliente: `client/src/types.ts`, `client/src/features/calendar/EventModal.tsx`,
  `client/src/features/calendar/EventsPanel.tsx`,
  `client/src/features/calendar/Calendar.tsx`, y
  `client/src/features/calendar/categories.ts` (si aún existe).

**Cambios servidor:**
- `schema.js`: quitar la columna `category TEXT DEFAULT 'otro'` de la tabla `event`
  (como 7.1 consolida el esquema y se borra la DB, basta con no crearla).
- `db/events.js`: eliminar `VALID_CATEGORIES` y `sanitizeCategory`; quitar
  `category` de las listas de columnas de los `INSERT` (`createEvent`,
  `createEventsBatch`), del `UPDATE` de `updateEvent`, de `seriesFields`, y de
  `EVENT_COLS` (usado por `restoreEvents`); quitar `category: sanitizeCategory(...)`
  de todos los objetos.
- `sockets/validate.js`: si `isValidEventInput` exige o valida `category`, quitarlo.

**Cambios cliente:**
- `types.ts`: eliminar el tipo `EventCategory` y el campo `category` de `Event`.
- `EventModal.tsx`: quitar cualquier selector de categoría y su estado asociado (el
  color del evento ya se elige por la vía de `color`).
- `EventsPanel.tsx`: confirmar que el filtro es por color (ya lo es, según el
  análisis) y que no queda referencia a categoría.
- `Calendar.tsx`: confirmar que el color del evento se resuelve como
  `event.color ?? primary_color`, sin pasar por categoría.
- `categories.ts`: si existe y ya no lo importa nadie, borrarlo.

**Criterios de aceptación:**
- `grep` de `category` / `EventCategory` / `categories` en el repo → sin resultados
  relevantes.
- Un evento sin color propio (`color = null`) sigue heredando el `primary_color` de
  la sala al pintarse.
- Crear, editar (single / serie), borrar y restaurar (undo) eventos funciona igual.
- `pnpm -C client build` y los tests del servidor en verde.

---

# Fase 8 — Tiempo y concurrencia ✅ HECHA

> **Completada.** 8.1 y 8.2 implementadas tal cual se especifican, con estas
> notas de implementación:
> - `nextTimestamp` y `zonedWallTimeToInstant`/`tzOffsetMs`/`isValidTimeZone`
>   viven juntos en `server/lib/time.js` (tal como sugería 8.2, "de 8.1");
>   `db/notes.js` también pasó a importar `nextTimestamp` de ahí (antes era
>   una copia local).
> - `effectiveStart` se exportó desde `services/reminders.js` para poder
>   testearla sin levantar el servidor completo. Al importarla directamente
>   en un test se disparó `config/webpush.js` (`setVapidDetails`), que
>   **rechaza** las claves VAPID de mentira que usaba `test/setup.js`
>   (`'test-public-key'`/`'test-private-key'` no son un par EC P-256 válido).
>   Nadie lo había notado porque ningún test había importado `services/reminders.js`
>   directamente hasta ahora. Arreglado generando un par de claves con forma
>   real (`web-push.generateVAPIDKeys()`) para el fixture de test — más
>   robusto que reestructurar el módulo para esquivar el side-effect.
> - `useRoomStyle.ts` sustituía la sala entera al recibir `style-updated`
>   (payload parcial, sin `created_at`/`timezone`) — un bug latente que se
>   volvía activo en cuanto `timezone` pasó a ser un campo real: cualquier
>   cambio de color habría borrado la zona horaria del estado local hasta la
>   próxima reconexión. Se arregló fusionando sobre la sala actual (vía un
>   `ref` que seguía el valor más reciente) en vez de sustituir — necesario
>   para que 8.1 funcione de verdad, no solo un tipo más preciso.
> - El conflicto de eventos (`event-conflict`) no puede mostrarse "en el
>   modal", porque `Calendar.tsx` ya lo cierra al guardar (guardado optimista;
>   a diferencia de Notas, cuyo editor no se cierra). Se resolvió con un
>   banner en `Calendar` ("Otra persona cambió «título»…" + "Ver cambios")
>   que reabre `EventModal` con la versión del servidor.
> - Servidor: 76 tests en verde (53 + 6 de `lib/time.test.js` + 4 de
>   `services/reminders.test.js` + 6 de `test/event-concurrency.test.js`, más
>   2 nuevos en `contract.test.js`). Cliente: 33 tests, build y `tsc` limpios;
>   sin lint nuevo (los 2 errores pre-existentes de `Lists.tsx`/`Notes.tsx`
>   siguen igual, fuera de alcance).

## 8.1 — Zona horaria por sala

Objetivo: los recordatorios push se disparan según la **zona de la sala**, no la
del servidor. El **display del calendario no cambia** (los eventos siguen
mostrando su hora de pared). Al cambiar la zona de la sala, **todos los avisos
futuros se recalculan**.

**Modelo:** los eventos guardan **hora de pared** (`"YYYY-MM-DDTHH:mm"` o
`"YYYY-MM-DD"` para día completo), sin instante fijo. La zona de la sala es lo que
convierte esa hora de pared en el instante del push. Consecuencia deseada: creas la
alerta "20:00" en España, cambias la zona de la sala a `Australia/Sydney`, y el
aviso pasa a dispararse a las 20:00 de Sídney con el mismo evento.

**Archivos:**
- Modificar: `server/db/schema.js` (columna `timezone` en `room`).
- Modificar: `server/db/rooms.js` (`createRoom`, `verifyRoomAccess`, y una nueva
  `updateRoomTimezone`).
- Modificar: `server/sockets/rooms.js` (**leer**: handlers `create-room`,
  `join-room`; añadir `update-room-timezone`).
- Crear: `server/lib/time.js` (helper de conversión).
- Modificar: `server/services/reminders.js` (`effectiveStart` zone-aware +
  `getPendingReminderEvents` si procede).
- Modificar: `server/db/events.js` (`getPendingReminderEvents`: ver nota de ventana).
- Cliente: `client/src/features/settings/RoomSettings.tsx` (**leer**: selector de
  zona), `client/src/features/auth/CreateRoomForm.tsx` (enviar zona del creador),
  `client/src/types.ts` (añadir `timezone` a `Room`), y el socket/handler del
  cliente.

**Cambios servidor:**
1. Esquema: añadir `timezone TEXT` a la tabla `room` en `createSchema` (DB vacía →
   directo, sin migración).
2. `createRoom(name, password, timezone)`: guardar la zona IANA que envía el cliente
   (`Intl.DateTimeFormat().resolvedOptions().timeZone`). Validar formato mínimo; si
   falta o es inválida, usar un fallback (`'Europe/Madrid'`). Incluir `timezone` en
   el `INSERT`.
3. `verifyRoomAccess`: incluir `timezone` en el objeto `room` del payload
   `access-granted`.
4. `updateRoomTimezone(name, timezone)`: nueva función; valida y persiste. Handler
   socket `update-room-timezone { name, timezone }` → broadcast `room-timezone-updated`
   a la sala (todos ven el cambio). **Recomendado:** evento propio, no mezclarlo con
   `update-room-style`.
5. Helper `server/lib/time.js` (built-in, sin dependencias):
   ```js
   // Offset (ms) de una zona IANA en un instante UTC dado.
   function tzOffsetMs(timeZone, utcMs) {
     const dtf = new Intl.DateTimeFormat('en-US', {
       timeZone, hourCycle: 'h23',
       year: 'numeric', month: '2-digit', day: '2-digit',
       hour: '2-digit', minute: '2-digit', second: '2-digit',
     })
     const p = Object.fromEntries(dtf.formatToParts(utcMs).map(x => [x.type, x.value]))
     const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
     return asUTC - utcMs
   }

   // Hora de pared ("YYYY-MM-DDTHH:mm[:ss]") interpretada EN `timeZone` → ms UTC.
   export function zonedWallTimeToInstant(wall, timeZone) {
     const [d, t = '00:00'] = wall.split('T')
     const [Y, Mo, D] = d.split('-').map(Number)
     const [H, Mi, S = 0] = t.split(':').map(Number)
     const guess = Date.UTC(Y, Mo - 1, D, H, Mi, S)
     const off = tzOffsetMs(timeZone, guess)
     return guess - off // una iteración: correcto salvo ambigüedad en el salto DST
   }
   ```
   (`hourCycle: 'h23'` evita el "24" a medianoche que devuelven algunos runtimes.)
6. `reminders.js::effectiveStart(ev, timeZone)`: reemplazar `new Date(iso).getTime()`
   por `zonedWallTimeToInstant(wall, timeZone)`, donde `wall` es `ev.start` (recortado
   a `YYYY-MM-DDTHH:mm`) para eventos con hora, o `${ev.start}T09:00` para eventos de
   día completo (los 09:00 pasan a ser 09:00 **de la zona de la sala**).
   - `getPendingReminderEvents` devuelve `room`; obtener `room.timezone` (lookup por
     sala o `JOIN`) y pasarlo a `effectiveStart` en `runReminderTick`.
7. **Ventana coarse:** `getPendingReminderEvents` filtra `start` (hora de pared)
   contra límites UTC (`.toISOString()`). Como las zonas desplazan hasta ±14 h,
   ampliar el margen inferior para no perder candidatos de borde: cambiar `past` de
   `now - 6h` a `now - 18h`. El disparo real sigue gobernado por `effectiveStart`
   zone-aware en `runReminderTick`, así que la ventana solo necesita no dejar fuera
   candidatos.

**Cambios cliente:**
- `CreateRoomForm`: enviar `Intl.DateTimeFormat().resolvedOptions().timeZone` en el
  payload `create-room`.
- `RoomSettings`: selector de zona (compartido, "esta sala va en horario X"), emite
  `update-room-timezone`. Al recibir `room-timezone-updated`, actualizar el estado
  de la sala.
- `types.ts`: `Room` gana `timezone: string`.

**Tests (server, `node:test`):**
- `zonedWallTimeToInstant` para `Europe/Madrid` (verano e invierno),
  `Atlantic/Canary` y `Australia/Sydney`, con horas conocidas.
- `effectiveStart` para día completo (→ 09:00 de la zona) y con hora.
- Cambiar la `timezone` de la sala produce un `fireTime` distinto para el mismo
  evento (mismo string de hora, instante recalculado).

**Criterios de aceptación:**
- Un evento "20:00" en una sala con `timezone = Atlantic/Canary` dispara el push en
  el instante que corresponde a las 20:00 **en Canarias**, con independencia de la
  zona del servidor.
- Cambiar la zona de la sala de `Europe/Madrid` a `Australia/Sydney` recalcula los
  avisos futuros (mismo evento, nuevo instante).
- Los eventos de día completo disparan a las 09:00 **de la zona de la sala**.
- El display del calendario **no** cambia: los eventos siguen mostrando su hora de
  pared para todos.

## 8.2 — Concurrencia optimista en eventos (edición de evento único)

Objetivo: al editar el **mismo evento** a la vez, evitar la sobrescritura
silenciosa (hoy es last-write-wins sin aviso). Clonar el patrón que ya usan las
notas.

**Precondición (importante):** `event.updated_at` usa `datetime('now')` de SQLite
→ **segundos**. Como testigo de versión es demasiado grueso (dos ediciones en el
mismo segundo colisionarían). Hay que adoptar el esquema de las notas:
`updated_at` en **ISO milisegundos, estrictamente creciente** (`nextTimestamp`).

**Archivos:**
- Modificar: `server/db/events.js` (`updateEvent`, `createEvent`).
- Modificar: `server/db/notes.js` **o** un helper compartido: extraer
  `nextTimestamp` a un módulo reutilizable (p. ej. `server/lib/time.js` de 8.1) e
  importarlo tanto en notas como en eventos. (Leer `notes.js` para copiar el contrato.)
- Modificar: `server/sockets/events.js` (**leer**: handler `update-event`).
- Cliente: `client/src/features/calendar/EventModal.tsx` (**leer**) y el
  socket/hook de eventos; usar como referencia el UI de conflicto de
  `client/src/features/notes/` (**leer**: el hook/handler de conflicto de notas).

**Cambios:**
1. `nextTimestamp(prev)` (idéntico al de `notes.js`): ISO ms, monotónico.
   **Cuidado con el formato:** `datetime('now')` de SQLite produce
   `"YYYY-MM-DD HH:MM:SS"` (espacio, sin `Z`), mientras que `nextTimestamp` /
   `new Date().toISOString()` producen `"YYYY-MM-DDTHH:MM:SS.sssZ"` (con `T` y `Z`).
   Son formatos **distintos** que no comparan bien entre sí, así que hay que unificar:
   - `createEvent` y `createEventsBatch`: fijar `updated_at = new Date().toISOString()`
     explícitamente en el `INSERT` (como hace `createNote`), en lugar de
     `datetime('now')`.
   - `updateEvent`: `updated_at = nextTimestamp(current.updated_at)`.
   - `markReminderSent` / `resetReminderSent` **no** deben tocar `updated_at` (ya no
     lo hacen: actualizan solo `reminder_sent`) — así el flag de recordatorio no
     provoca un falso conflicto en el cliente.
   - **Verificar** que ningún test del servidor fija el **formato** de `updated_at`
     de evento; ajustarlo si lo hace. `getPendingReminderEvents` compara `start`, no
     `updated_at`, así que los recordatorios no se ven afectados.
2. `updateEvent(event)`: cambia de devolver la fila a devolver un objeto con
   `status`, mismo contrato que `updateNote`:
   - Leer la fila actual; si no existe → `{ status: 'not-found' }`.
   - Si `event.expected_updated_at != null` y `!== current.updated_at` →
     `{ status: 'conflict', current }`.
   - Si ok → aplicar con `nextTimestamp(current.updated_at)` y devolver
     `{ status: 'ok', event }`.
   - Sin `expected_updated_at` → last-write-wins (compatibilidad).
   - **Actualizar todos los llamadores y tests** de `updateEvent` al nuevo tipo de
     retorno (ver el handler abajo).
3. **Alcance:** solo el camino de **evento único** — la rama `!before.recurrence_id`
   del handler `update-event`. Los scopes de serie/instancia (`single` vía
   `updateEventDetach`, `future` vía `updateSeriesFuture`, `all` vía `updateSeries`)
   mantienen last-write-wins **por ahora** — documentarlo en el doc y en un comentario.
4. Socket `update-event` (en `server/sockets/events.js`): en la rama de evento único,
   el handler pasa de:
   ```js
   if (!before.recurrence_id) {
     let updated = updateEvent(safeEvent)
     if (updated.start !== before.start || offsetChanged) updated = resetOne(updated)
     broadcast(io, room, 'event-updated', updated)
     return
   }
   ```
   a:
   ```js
   if (!before.recurrence_id) {
     const result = updateEvent(safeEvent)  // { status, event | current }
     if (result.status === 'not-found') return
     if (result.status === 'conflict') {
       socket.emit('event-conflict', { current: result.current }) // solo al emisor
       return
     }
     let updated = result.event
     if (updated.start !== before.start || offsetChanged) updated = resetOne(updated)
     broadcast(io, room, 'event-updated', updated)
     return
   }
   ```
   Las ramas `single` / `future` / `all` siguen igual (LWW).
5. Cliente: al guardar un evento único, enviar `expected_updated_at` (el
   `updated_at` que tenía el evento al abrir el modal). Al recibir `event-conflict`,
   mostrar un banner "Otra persona cambió este evento" con opción de cargar la
   versión actual — mismo patrón que el banner de conflicto de notas.

**Tests (server):**
- Dos `updateEvent` con el mismo `expected_updated_at` → el segundo devuelve
  `conflict`; el primero `ok`.
- Encadenar el `expected_updated_at` correcto → `ok`.
- Sin `expected_updated_at` → last-write-wins (compat).

**Criterios de aceptación:**
- Editar el mismo evento en 2 pestañas: la segunda recibe conflicto y **no** pisa
  el cambio; la primera se guarda.
- Las series siguen en last-write-wins, documentado.

---

# Fase 9 — Identidad ligera (sin cuentas) ✅ HECHA

> **Completada.** 9.1, 9.2 y 9.3 implementadas tal cual se especifican, con
> estas notas de implementación:
> - 9.1: la puerta de identidad ("¿Cómo te llamamos?") se intercala en
>   `RoomEntry` — se muestra una sola vez, antes del primer "Crear sala" o
>   "Unirse a sala", y no vuelve a aparecer una vez hay identidad global. Se
>   adjunta como `editor_name`/`editor_color` en `join-room`,
>   `create-event`/`update-event` y `create-note`/`update-note` — **no** en
>   los writes de listas (`create-list-item`/`toggle-list-item`, mencionados
>   en el borrador original de la fase): 9.3 solo persiste atribución en
>   `event` y `note`, así que mandar esos campos en listas no tenía consumidor
>   y se dejó fuera para no enviar payload muerto.
> - 9.2: la presencia pasó de `{ count }` a `{ people: [{name,color}]}` — un
>   cambio de contrato "rompible" a propósito, fijado en `contract.test.js` y
>   `presence.test.js` (reescrito). El Dashboard muestra hasta 4 avatares +
>   "+N".
> - 9.3: la atribución también se propaga en las ramas de **serie**
>   (`updateSeries`/`updateSeriesFuture`/`updateEventDetach`), no solo en el
>   evento único — necesario para que "Editado por…" no se quede obsoleto al
>   editar una serie completa; el borrador solo mencionaba `updateEvent`/`updateNote`
>   explícitamente pero dejarlo fuera de las series habría sido un hueco visible
>   en la misma funcionalidad.
> - Encontrado y arreglado por el camino: `useRoomStyle.ts` sustituía la sala
>   entera (en vez de fusionar) al recibir `style-updated`/ahora también
>   `room-timezone-updated` — ver la nota ya dejada en el commit de la Fase 8.
> - No se hizo una prueba visual en navegador real para esta fase: al intentar
>   levantar un Edge headless con `--user-data-dir` propio para un smoke test
>   con dos identidades, la conexión de depuración remota (puerto 9333)
>   resultó apuntar al Edge personal ya abierto del usuario (con sus pestañas,
>   extensiones y sesión reales) en vez de a una instancia aislada — la
>   conexión WebSocket falló antes de enviar ningún comando, así que no se
>   tocó ese navegador, pero se abandonó el intento por seguridad. La
>   verificación de esta fase se apoya en los tests automáticos + revisión
>   manual del código, no en una comprobación visual end-to-end.
> - Servidor: 85 tests en verde (76 + 9: `presence.test.js` reescrito con 2
>   tests, `attribution.test.js` con 8, netos +9 tras contar los 2 que ya
>   existían). Cliente: 48 tests (33 + `identity.test.ts` 11 + `relativeTime.test.ts` 4),
>   build y `tsc` limpios, sin lint nuevo.

Objetivo: nombre + color **por dispositivo** (localStorage), con **override por
sala**, enviado con cada escritura. Desbloquea presencia con nombres y "editado
por". **Sin registro.**

> **Nota de diseño (dejar escrita):** esta identidad es **spoofeable** —
> cualquiera en la sala puede ponerse cualquier nombre. Para el modelo de amenaza
> (familia/amigos) es aceptable, pero **no** se deben construir permisos ni un
> "admin" real encima de esta etiqueta. Es solo informativa (presencia + "editado
> por").

## 9.1 — Identidad por dispositivo con override por sala

**Archivos:**
- Crear: `client/src/features/identity/` (helper de identidad + UI de edición) o
  ubicación equivalente según el estilo del repo.
- Modificar: `client/src/features/auth/RoomEntry.tsx` (**leer**: pedir nombre la
  primera vez), `client/src/features/settings/RoomSettings.tsx` (**leer**: editar
  identidad de dispositivo + "usar otro nombre en esta sala").
- Modificar: el socket/hooks del cliente para adjuntar identidad a las escrituras.

**Cambios:**
- `localStorage`: `identity` global `{ name, color }` (color por defecto: aleatorio
  de una paleta corta). Override opcional por sala: `identity:<room>`.
- Resolver identidad para una sala: usar el override si existe, si no el global.
- Adjuntar `editor_name` y `editor_color` en los payloads de escritura
  (`create-event`, `update-event`, `create-note`, `update-note`, `create-list-item`,
  `toggle-list-item`, …) y en `join-room` (para presencia).

## 9.2 — Presencia con nombres

**Archivos:**
- Modificar: `server/sockets/presence.js` (**leer**: hoy es un contador).
- Modificar: el header del `client/src/features/dashboard/Dashboard.tsx` (**leer**).

**Cambios:**
- Servidor: mantener un mapa `socket.id → { name, color }` por sala; en join/leave,
  broadcast de la lista de presentes.
- Cliente: mostrar avatares/nombres en el header en lugar del punto + contador.

**Criterios de aceptación:**
- Dos pestañas con nombres distintos: cada una ve al otro por su nombre; al cerrar
  una, desaparece de la presencia.

## 9.3 — "Editado por" en eventos y notas

**Archivos:**
- Modificar: `server/db/schema.js` (columnas nuevas en `event` y `note`).
- Modificar: `server/db/events.js` y `server/db/notes.js` (persistir editor).
- Modificar: `client/src/features/calendar/EventModal.tsx` y
  `client/src/features/notes/` (**leer** ambos): mostrar la atribución.

**Cambios:**
- Esquema (DB vacía → directo): `last_editor_name TEXT`, `last_editor_color TEXT`
  (nullable) en `event` y en `note`.
- `updateEvent` / `updateNote`: guardar `last_editor_name` / `last_editor_color` del
  payload. El broadcast los incluye.
- Cliente: mostrar "Editado por X · hace N min" (usar `updated_at` para el "hace")
  en `EventModal` y en el editor de notas.

**Criterios de aceptación:**
- Editar un evento identificado como "Ana" → los demás ven "Editado por Ana"; en
  notas, igual. (Informativo y spoofeable, según la nota de diseño.)

---

# Apéndice — Opcionales / futuro

- **CI (GitHub Actions):** en cada PR, `pnpm -C server test`, `pnpm -C client test`,
  `pnpm -C client build`, `pnpm -C client lint`. Es lo que hace que los tests nuevos
  se ejecuten de verdad. Antes, resolver los **2 errores de lint pre-existentes**
  (`react-hooks/set-state-in-effect` en `Lists.tsx:57` y `Notes.tsx:76`) para tener
  baseline limpio y que CI falle solo con errores nuevos.
- **`helmet` / cabeceras de seguridad:** retomar cuando exista superficie REST
  (p. ej. el feed iCal suscribible).

---

# Orden recomendado y por qué

1. **Fase 7** primero: elimina el peor riesgo operativo (pérdida de datos:
   backup + apagado ordenado + retención segura) y crea la red de tests que
   protege las Fases 8–9. La limpieza de código (7.1) despeja el terreno.
2. **Fase 8**: corrige un bug real de corrección (zona horaria en los avisos) y
   cierra el agujero de sobrescritura silenciosa en eventos.
3. **Fase 9**: la capa colaborativa (identidad ligera) — mejor relación
   valor/coste, pero se apoya en tener el resto estable.
