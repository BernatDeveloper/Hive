# Mejoras — Calendario Compartido (plan por fases)

> Handoff para Claude Code (con acceso al repo). Ninguna de estas mejoras fue
> "pedida" como feature; son recomendaciones para robustez, seguridad y calidad.
> **Antes de tocar nada, lee los archivos reales** y confirma cómo está hoy; varias
> suposiciones hay que verificarlas contra el código.
>
> Reglas del proyecto: pnpm, código en inglés / UI en español, cliente TS, servidor
> JS ESM, migraciones con `ALTER TABLE` comprobando existencia.
>
> **Dependencia con `TAREAS.md`:** las Fases 0–2 aterrizan mucho más limpias sobre
> la reestructura del backend (Tarea A de ese documento). Recomendado hacer esa
> reestructura antes, o en paralelo.

## Resumen de fases

| Fase | Tema | Contenido |
|------|------|-----------|
| 0 | Cimientos | env + validación, logging, manejo de errores en handlers |
| 1 | Seguridad crítica | autorización por sala, rate limiting, validación de payloads |
| 2 | Robustez de servidor | hash async, limpieza de push muertas, WAL + índices |
| 3 | Red de seguridad | tests base (recurrencia, handlers, auth) |
| 4 | Integridad colaborativa | concurrencia en notas |
| 5 | Experiencia de producto | series "este y siguientes", offline + SW, presencia, undo |
| 6 | Futuro / producto | export iCal (RRULE), tipos compartidos, política de contraseñas |

Cada fase es desplegable por sí sola. Ejecutarlas en orden: las de seguridad
primero (es lo que prioriza el proyecto), y los tests (Fase 3) **antes** de los
cambios de riesgo sobre datos (Fases 4 y 5).

---

## FASE 0 — Cimientos ✅ HECHA

> Completada.
> - `server/config/env.js` valida `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`
>   al arrancar y hace `process.exit(1)` con mensaje claro si falta alguna.
>   `server/.env.example` y `client/.env.example` documentados con comentarios.
> - `server/lib/logger.js`: logger con niveles (`error/warn/info/debug`, umbral
>   `LOG_LEVEL`, default `info`, línea con timestamp ISO). Todos los `console.*` del
>   server migrados (salvo el mensaje fatal de `env.js`).
> - `server/sockets/handler.js` → `safeOn(socket, event, errorEvent, errorPayload, fn)`:
>   wrapper común try/catch → `logger.error('socket:<event>', err)` + emite el evento
>   de error al cliente. Los 18 handlers de `sockets/{rooms,events,lists,notes,push}.js`
>   migrados a `safeOn` (quita ~10 líneas de boilerplate por handler).
> - Verificado: arrancar sin VAPID → exit 1 + mensaje; smoke socket (payload inválido
>   no tumba el server, CRUD OK, handler que lanza sigue vivo) + e2e headless.

**Objetivo:** base para trabajar con seguridad — fallos visibles, controlados y con
las variables de entorno validadas. Todo esfuerzo bajo; habilita el resto.

**Incluye:**

- **`.env.example` + validación de entorno al arrancar.** Hoy, si falta un
  `VAPID_*` u otra variable, el fallo aparece tarde y raro. Crear `config/env.js`
  que lee y valida lo requerido al arrancar y falla rápido con mensaje claro.
  Documentar todas en `.env.example` (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  `VAPID_SUBJECT`, `VITE_VAPID_PUBLIC_KEY`, puertos, orígenes CORS).
- **Logging estructurado.** Sustituir los `console.log` sueltos por un logger
  mínimo con niveles; loguear errores de handlers y de envío push. Ayuda a depurar
  todas las fases siguientes.
- **Manejo de errores consistente en handlers.** Envolver cada handler en try/catch
  (o un wrapper común), loguear en servidor y emitir un evento de error al cliente
  que la UI muestre en español. Encaja con la reestructura del backend.

**Criterio de aceptación de fase:** arrancar sin una variable requerida falla con
mensaje explícito; ningún error de handler tumba el proceso; los errores se logean
y llegan al cliente.

---

## FASE 1 — Seguridad crítica ✅ HECHA

> Completada.
> - **Autorización por sala:** ya estaba (Tarea A: `isAuthedFor`/`markAuthed`).
>   Hecha estructural con `safeAuthedOn` en `sockets/handler.js` — los 12 handlers
>   de datos (events×3, lists×5, notes×3, subscribe-push) exigen
>   `isAuthedFor(socket, payload.room)` antes de ejecutar; imposible olvidarlo al
>   añadir uno nuevo. `update-room-style` lo comprueba a mano (clave `name`).
> - **Rate limiting:** `lib/rateLimit.js` (ventana deslizante en memoria + barrido).
>   `create-room`/`join-room` → 10 intentos por IP y minuto, mensaje en español al
>   pasarse, `logger.warn`. IP de `socket.handshake.address` o `X-Forwarded-For` si
>   `TRUST_PROXY=true` (`config/env.js`, documentado en `.env.example`).
> - **Validación de payloads:** `sockets/validate.js` (`MAX` de longitudes,
>   `str/optStr/isObject/isDateish`, `isValidEventInput`, `isValidPushSubscription`).
>   Cada handler valida forma y longitudes en el borde → payload inválido = `return`
>   sin persistir ni caer.
> - Verificado: smoke (intruso sin join-room no escribe ni cambia estilo; título de
>   500 chars y fechas inválidas no persisten; subscription malformada no confirma
>   ni crashea; rate limit corta a los ~10 y otra IP sigue libre) + e2e headless.

**Objetivo:** cerrar los agujeros de acceso. Es el bloque más importante del
documento.

**Incluye:**

- **Autorización por sala en los handlers de escritura.** *(La más seria — verificar
  primero si ya está cubierta.)* Si los handlers (`create-event`, `update-note`…)
  confían en el `room` del payload, un socket que **nunca hizo `join-room`** podría
  escribir/leer en cualquier sala con solo conocer su nombre (y los nombres no son
  secretos). Al conceder `access-granted`, registrar la sala en el socket
  (`socket.data.rooms` o `socket.join(name)`) y rechazar en cada handler de
  escritura si el `room` del payload no está entre las salas autenticadas.
  *Criterio:* un socket sin `join-room` válido no puede crear/editar/borrar datos de
  una sala.
- **Rate limiting en `join-room` y `create-room`.** Contraseña mínima de 4 chars y
  sin límite de intentos → fuerza bruta trivial. Límite por IP (y/o nombre de sala)
  con ventana deslizante y backoff. En memoria basta para un proceso; con proxy
  inverso, leer la IP real con cuidado (`X-Forwarded-For` solo si se confía en el
  proxy). *Criterio:* tras N fallos en la ventana, los siguientes se rechazan
  temporalmente con mensaje en español.
- **Validación de payloads socket.** Un payload malformado puede tumbar un handler.
  Validar en el borde de cada uno — con `zod` o manual: presencia y tipo de cada
  campo, longitudes máximas de strings, forma de objetos anidados (`event`,
  `subscription`). *Criterio:* un payload inválido devuelve error controlado; no se
  cae ni se persiste basura.

**Criterio de aceptación de fase:** ningún socket puede actuar sobre una sala que no
ha autenticado; el brute force está mitigado; los payloads inválidos se rechazan sin
efectos.

**Depende de:** Fase 0 (para logear intentos rechazados y devolver errores limpios).

---

## FASE 2 — Robustez de servidor ✅ HECHA

> Completada.
> - **Hash async:** `auth/password.js` usa `promisify(crypto.scrypt)`; mismo formato
>   `<salt>:<hash>` (no invalida contraseñas). `createRoom`/`verifyRoomAccess` →
>   `async`; `safeOn` ahora hace `await handler(payload)` (soporta handlers async);
>   los handlers `create-room`/`join-room` son `async`. `createRoom` usa
>   `INSERT ... ON CONFLICT(name) DO NOTHING` + `changes` como guarda de carrera.
> - **Push muertas:** ya estaba en `sendPushToRoom` (borra en 404/410); ahora lo
>   loguea (`logger.info`).
> - **WAL + índices:** `PRAGMA journal_mode = WAL` en `db/connection.js`
>   (`.gitignore` cubre `*.db-wal`/`*.db-shm`/`*.db-journal`). Índices en
>   `db/migrations.js`: `event(room)`, `list(room)`, `list_item(room)`,
>   `list_item(list_id)` (covering para el cascade), `note(room)`,
>   `push_subscription(room)`. Verificado con `EXPLAIN QUERY PLAN`: todas las
>   consultas de carga de sala y del scheduler usan índice.
> - Verificado: smoke (hash async no bloquea con 5 create-room en paralelo, join
>   correcto/incorrecto, nombre duplicado, cascade de lista→ítems), migración WAL +
>   índices sobre la DB real, e2e headless.

**Objetivo:** que el servidor no se bloquee, no acumule basura y consulte rápido.
Esfuerzo bajo, buen retorno.

**Incluye:**

- **Hash de contraseña asíncrono.** `crypto.scryptSync` bloquea el event loop en
  cada login/creación. Migrar a `crypto.scrypt` async en `auth/password.js`,
  manteniendo el mismo formato de `password_hash` (scrypt + salt) para no invalidar
  contraseñas existentes. *Criterio:* login y creación idénticos; el hilo no se
  bloquea.
- **Limpieza de suscripciones push muertas.** Al caducar, `web-push` responde `410
  Gone` (a veces `404`). Capturar el error en el envío y borrar esa suscripción por
  `endpoint`. *Criterio:* tras un envío a una suscripción caducada, la fila
  desaparece y no se reintenta.
- **WAL + índices en SQLite.** `PRAGMA journal_mode = WAL` al abrir la conexión.
  Índices en columnas de filtro: `event(room)`, `event(reminder_sent, start)` o
  similar según el scheduler, `list_item(list_id)`, `push_subscription(room)`.
  **Verificar las consultas reales antes de fijar los índices** (`EXPLAIN QUERY
  PLAN`). *Criterio:* las consultas del scheduler y de carga de sala usan índice.

**Criterio de aceptación de fase:** el hash no bloquea; la tabla de push no crece con
suscripciones muertas; las consultas frecuentes usan índice.

---

## FASE 3 — Red de seguridad (tests) ✅ HECHA

> Completada. Runner: `node:test` (Node 22, cero deps de test salvo
> `socket.io-client` como devDependency). `cd server && pnpm test` → **18 tests**.
> - `services/recurrence.test.js` (11): cada regla genera su horizonte
>   (365/104/36/36/36/10), regla desconocida → 0, `recurrence_id` compartido + `id`
>   únicos, propagación de title/description/color/reminder_offset, fechas de
>   `daily`/`weekly`/`monthly-first`/`monthly-last`/`annual`, span multi-día, evento
>   con hora.
> - `test/handlers.test.js` (7): create-room (+ duplicado), join-room
>   correcto/incorrecto (+ forma del `access-granted`), autorización por sala (socket
>   sin join no escribe), CRUD de evento, serie recurrente (104 + `recurrence_id`
>   compartido + `series-updated`), payload inválido no persiste ni tumba, rate limit
>   corta a los ~10.
> - `test/helpers.js` compone app/io/handlers en puerto efímero **sin** `index.js`
>   (así no toca webpush ni schedulers). `test/setup.js` (`--import`) da env de
>   prueba y una DB temporal por proceso que se borra al salir.
> - `pnpm-workspace.yaml`: `verifyDepsBeforeRun: false` para sortear el
>   `ERR_PNPM_IGNORED_BUILDS` de better-sqlite3 en Windows.

**Objetivo:** cobertura de lo más frágil **antes** de tocar la lógica de datos de las
fases 4 y 5.

**Incluye:**

- **Tests base.** Empezar por mayor riesgo/valor: unit tests de
  `generateRecurrenceInstances` (todas las reglas y horizontes) y smoke tests de los
  handlers socket principales (crear/editar/borrar evento; join con contraseña
  correcta/incorrecta; autorización por sala de la Fase 1).

**Criterio de aceptación de fase:** `pnpm test` corre y cubre recurrencia + auth +
CRUD de eventos.

**Por qué aquí:** las Fases 4 (concurrencia) y 5 (edición de series) son las de mayor
riesgo de romper algo en silencio; tener tests antes las hace seguras.

---

## FASE 4 — Integridad colaborativa ✅ HECHA

> Completada al **nivel pragmático** (concurrencia optimista por `updated_at`).
> - `db/notes.js` `updateNote`: si `expected_updated_at` no coincide con el actual →
>   `{ status: 'conflict', current }`, no aplica. `updated_at` de notas se fuerza
>   estrictamente creciente (`nextTimestamp`) — sin esto dos guardados en el mismo
>   ms compartían testigo y el check fallaba (bug que destapó un test flaky).
> - `sockets/notes.js` `update-note` responde por **ack** de socket.io
>   (`{ status, note }`); en `ok` además difunde `note-updated`. `safeOn`/`safeAuthedOn`
>   ahora reenvían el ack al handler.
> - `useNotes` → `updateNote` devuelve `Promise<UpdateNoteResult>` (`socket.timeout(5000).emit`).
>   `Notes.tsx`: `baseRef` (versión + contenido base), banner de conflicto con
>   "Cargar la versión actual", y un lector sin cambios adopta las ediciones ajenas
>   en vivo.
> - Tests: `test/notes.test.js` (5) + e2e headless con 2 pestañas (B ve el título de
>   A, adopta su edición en vivo, choca al guardar sobre versión obsoleta, resuelve).
> - Eventos: revisados, no lo necesitan (guardado explícito por modal, no auto-save;
>   edición de series → Fase 5).

**Objetivo:** no perder ediciones concurrentes en el módulo más frágil.

**Incluye:**

- **Concurrencia en notas (hoy last-write-wins).** Con auto-save cada 600ms y varias
  personas, dos que editen la misma nota se pisan sin aviso — gana el último
  `update-note`. Elegir hasta dónde llegar:
  - *Mínimo:* documentar y mostrar en UI quién edita / "actualizado hace un momento".
  - *Pragmático (recomendado):* concurrencia optimista por `updated_at` — el cliente
    envía el `updated_at` que tenía; si el servidor tiene uno más nuevo, rechaza y
    reenvía la versión buena para reconciliar.
  - *Completo (futuro):* CRDT (p. ej. Yjs). Otra liga de esfuerzo; solo si el uso lo
    justifica.
  *Criterio (nivel pragmático):* un guardado basado en versión obsoleta no
  sobrescribe en silencio; el editor recibe la versión actual.

**Criterio de aceptación de fase:** ediciones simultáneas de una nota no se pierden
silenciosamente.

**Nota:** los eventos son más discretos y aguantan mejor, pero conviene revisarlos con
el mismo criterio.

**Depende de:** Fase 3 (tests como red).

---

## FASE 5 — Experiencia de producto — COMPLETA

> - **Series "este y los siguientes":** `update-event`/`delete-event` llevan `scope`
>   (`single`/`future`/`all`, defecto `all` = compat). `single` desengancha la
>   instancia (`recurrence_id`/`recurrence_rule` → NULL); `future` reasigna un
>   `recurrence_id` nuevo a las instancias desde el pivote (`db/events.js`
>   `updateSeriesFuture`/`deleteSeriesFuture`/`updateEventDetach`). `EventModal`:
>   radio de alcance en el branch de serie. Nuevo evento `events-deleted { ids }`.
>   Tests: `test/series.test.js` (7).
> - **Prompt de actualización del SW:** `public/sw.js` deja de hacer `skipWaiting()`
>   automático; escucha `message` `'skip-waiting'`. `src/pwa.ts` `useServiceWorkerUpdate()`
>   detecta el worker en espera → banner "Hay una versión nueva — Recargar" en `App`
>   → `postMessage` + reload en `controllerchange`. Verificado e2e.
> - **Presencia:** `sockets/presence.js` — el servidor cuenta sockets por sala
>   (`io.sockets.adapter.rooms`) y difunde `presence { count }` al entrar/salir;
>   `get-presence` para pedirlo bajo demanda (el broadcast tras `access-granted`
>   llega antes de montar el listener). `usePresence()` + indicador en el header del
>   Dashboard (solo si > 1). Tests: `test/presence.test.js`.
> - **Undo para borrados:** hecho — `services/undo.js` guarda una copia de lo
>   borrado (ventana 12s); los `delete-*` responden por ack `{ undoToken, label }`;
>   `undo-delete` re-inserta y difunde los `*-created`. Cliente: `useUndo` +
>   `UndoToast` en el Dashboard (evento/serie/lista+ítems/nota/ítem). Tests
>   `test/undo.test.js` (6) + e2e.
>
> `pnpm test` → 31. e2e headless: 2 pestañas con scopes de serie + presencia 1↔2;
> prompt de SW con despliegue simulado.

**Objetivo:** mejoras visibles de uso. Priorizar dentro de la fase según producto.

**Incluye:**

- **Edición de series "este y los siguientes".** Hoy editar/borrar cualquier
  instancia con `recurrence_id` afecta a **toda** la serie. Añadir modos: solo esta,
  esta y futuras, toda la serie. "Este y siguientes" implica partir la serie (nuevo
  `recurrence_id` desde la fecha de corte). Es el cambio con más enjundia; diseñar
  primero. *Criterio:* "solo este" no toca al resto; "este y siguientes" no toca a
  los anteriores. *(Se apoya en los tests de la Fase 3.)*
- **Offline + actualización del service worker.** ✅ Indicador offline (`ConnectionBanner`,
  Tarea C) + **cola de acciones**: `socket/queue.ts` `emitWrite`/`emitWriteAck` encolan
  las escrituras si no hay conexión (o el socket reconectó pero aún no re-hizo
  `join-room`) y las vacían en orden al recibir `access-granted`; el banner muestra
  "N cambios sin sincronizar". + prompt de "versión nueva" con `skipWaiting`
  controlado en `sw.js`.
- **Presencia en la sala.** Mostrar cuántos/qué dispositivos hay conectados. Se apoya
  en las rooms de Socket.io ya usadas para autorización (Fase 1). Refuerza lo
  colaborativo.
- **Undo para borrados.** Borrar evento/lista/nota es inmediato y sin vuelta atrás. Un
  "deshacer" temporal (soft-delete + ventana de restauración) reduce sustos.

**Criterio de aceptación de fase:** cada mejora entregada cumple su criterio; ninguna
rompe la sincronización en tiempo real existente.

---

## FASE 6 — Futuro / decisiones de producto — 2/3 hechas

> - **Export iCal:** versión pragmática — `client/src/features/calendar/ics.ts`
>   genera el `.ics` en el cliente (1 `VEVENT` + `RRULE` por serie según su regla,
>   `COUNT` = tamaño del grupo; `VEVENT` individual para eventos sueltos y para
>   instancias desenganchadas). Botón ⬇ en `EventsPanel`. **Sin** el refactor a
>   RRULE de fondo (las instancias se siguen materializando en la DB). Verificado
>   e2e (descarga, VCALENDAR, nº de VEVENT, RRULE, CRLF).
> - **Política de contraseñas:** `MIN_PASSWORD = 8` en `sockets/validate.js`,
>   validado también en `create-room` (antes solo en el cliente).
>   `CreateRoomForm` sube el mínimo a 8 y muestra un indicador de fortaleza
>   (`password-strength.ts`: longitud + variedad → débil/media/fuerte). `join-room`
>   no re-valida (salas antiguas siguen funcionando). Tests + e2e.
> - **Tipos compartidos client/server:** no hecho. El de más esfuerzo y menos valor
>   de usuario; queda para cuando se vuelva objetivo (o al hacer el refactor a
>   RRULE / un paquete común).

**Objetivo:** cambios de fondo o de política, solo cuando se vuelvan objetivo.

**Incluye:**

- **Export a iCal (y RRULE).** Para exportar el calendario conviene basar la
  recurrencia en `RRULE` estándar en vez de las reglas custom actuales. Cambio de
  fondo; solo si el export entra en el roadmap.
- **Tipos compartidos client/server.** Hoy `client/src/types.ts` y las formas que
  emite el servidor se mantienen a mano y derivan. Valorar un paquete de tipos
  compartido, o JSDoc + `checkJs` en el servidor para tipar sin migrar a TS.
- **Política de contraseñas.** El mínimo de 4 caracteres es débil incluso con rate
  limiting. Valorar subirlo (8+) o dar feedback de fortaleza al crear la sala.
  Decisión de producto: tensión entre seguridad y salas fáciles de compartir.

**Criterio de aceptación de fase:** N/A (según lo que se decida abordar).
