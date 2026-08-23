# Brief — Remediación de la auditoría (Fase A)

> **Para Claude Code:** aplica estos arreglos **en orden de prioridad**. Lee los archivos reales antes de tocarlos; los fragmentos son de referencia y hay que adaptarlos al código existente.
>
> **⛔ Solo código. NO despliegues** ni configures Railway/Vercel. Al terminar, ejecuta las pruebas manuales de cada bloque y dime el resultado. Cuando esté todo verde, continúa con la **Fase B (PWA)** del brief `brief-codigo-claude-code.md`.

**Contexto:** esto corrige los hallazgos de la auditoría de la Fase A sobre la app de calendario colaborativo (Node + Express + Socket.io + better-sqlite3 / React + Vite + TS). Decisión tomada: los miembros de una sala están normalmente en la **misma zona horaria**.

---

## Bloque 1 — Robustez de los handlers (🔴 + validación)

Un payload malformado desde cualquier cliente puede tumbar el proceso entero. Y un `category` inválido, al llegar por broadcast, revienta el calendario de todos los miembros de la sala.

**Files:** `server/index.js`, `server/db.js`, `server/reminders.js`

- [x] Red de seguridad global al inicio de `server/index.js` (no debe morir el proceso por un error suelto):

```js
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err))
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err))
```

- [x] `try/catch` + validación mínima en **cada** handler de socket (sin el check de autorización — eso es el Bloque 2, fuera de este alcance). Patrón a aplicar en todos (create/update/delete de event, note, list, list-item, update-room-style, unsubscribe-push, etc.):

```js
socket.on('delete-event', ({ room, id } = {}) => {
  try {
    if (!isAuthedFor(socket, room)) return            // ver Bloque 2
    if (typeof id !== 'string' || !id) return
    // ...lógica actual...
  } catch (e) {
    console.error('[delete-event]', e)
    socket.emit('event-error', { message: 'No se pudo completar la operación' })
  }
})
```

- [x] Validación de dominio antes de persistir eventos (en el handler o en `db.js`):
  - `category`: si no es una de las claves válidas (`otro, personal, trabajo, social, cumpleanos, vacaciones, salud`), forzar `'otro'`. Define la lista como constante en el servidor para no depender del cliente.
  - `reminder_offset`: aceptar solo `null` o entero `>= 0` dentro del set permitido (`5,15,30,60,120,1440,2880`); cualquier otra cosa → `null`.
  - `title`: coaccionar a string y recortar; si queda vacío, rechazar la operación.

- [x] En `server/reminders.js`, envolver el cuerpo de `runReminderTick` en `try/catch` (un throw en el `setInterval` mata el proceso igual que un handler):

```js
function runReminderTick() {
  try {
    // ...lógica actual...
  } catch (e) {
    console.error('[reminderTick]', e)
  }
}
```

- [x] En `sendPushToRoom`, además de borrar en 404/410, **loguear** el resto de errores de `webpush.sendNotification` (red, 400 por VAPID/payload) en vez de descartarlos en silencio.

**Prueba:** emitir `unsubscribe-push` con `{}` y `delete-event` con `{ room, id: undefined }` desde un cliente de prueba → el servidor **no** se cae y responde/ignora limpiamente. Emitir un evento con `category: 'inexistente'` → se guarda como `otro` y ningún cliente crashea.

---

## Bloque 2 — Autorización en escrituras (🔴, alto impacto)

Hoy solo `join-room` verifica la contraseña; el resto de handlers confían en el string `room` del cliente. Cualquiera que sepa el nombre de una sala puede escribir/borrar sin la contraseña.

**Files:** `server/index.js`

- [x] Registrar la sala autorizada en el socket **solo tras verificar la contraseña** (en los handlers `create-room` y `join-room`, después de `verifyRoomAccess`):

```js
socket.join(room)                       // si no se hacía ya
socket.data.authedRooms ??= new Set()
socket.data.authedRooms.add(room)
```

- [x] Helper de comprobación:

```js
function isAuthedFor(socket, room) {
  return typeof room === 'string' && socket.data.authedRooms?.has(room) === true
}
```

- [x] Añadir `if (!isAuthedFor(socket, room)) return` (opcionalmente `socket.emit('access-denied')`) al principio de **todos** los handlers de escritura y de `subscribe-push`/`unsubscribe-push`. Revisa que ningún `socket.join(room)` se ejecute a partir de datos crudos del cliente sin pasar antes por la verificación de contraseña.

**Prueba:** un socket que NO ha hecho join con contraseña emite `create-event`/`subscribe-push` para esa sala → la operación se rechaza y no se escribe nada en la DB.

---

## Bloque 3 — FOREIGN KEY de `event` + PRAGMA (🔴)

Al limpiar salas inactivas, los eventos quedan huérfanos porque `event` no cascadea.

**Files:** `server/db.js`

- [x] Activar las claves foráneas en cada conexión (better-sqlite3 **no** lo hace por defecto; sin esto, ninguna cascada funciona):

```js
const db = new Database(dbPath)
db.pragma('foreign_keys = ON')
```

- [x] Declarar la FK en la tabla `event` como en las demás:

```sql
room TEXT NOT NULL REFERENCES room(name) ON DELETE CASCADE
```

  - Como vas a desplegar con DB nueva y vacía, basta con añadirla al `CREATE TABLE` y arrancar limpio.
  - **Si quisieras conservar una DB local existente:** SQLite no permite añadir una FK con `ALTER TABLE`; hay que reconstruir la tabla (crear `event_new` con la FK, copiar filas, `DROP` la vieja, renombrar) dentro de una transacción. Si te hace falta, pídemelo y lo detallo.
- [x] Cinturón y tirantes: en `cleanInactiveRooms`, borrar explícitamente los `event` de la sala además de confiar en la cascada.

**Prueba:** crear sala con eventos, forzar su limpieza (o bajar el umbral temporalmente) → no quedan filas en `event` con ese `room`.

---

## Bloque 4 — Zona horaria (🔴)

Decisión: miembros en la misma zona. Eventos con hora en UTC (instante); eventos de día completo flotantes (fecha).

**Files:** `client/src/features/calendar/EventModal.tsx`, `server/reminders.js` (revisión), y donde se muestren fechas.

- [x] **Eventos con hora:** al guardar en `EventModal`, convertir el input local a ISO UTC con `Z` en vez de guardar el string "naive". Construir el `Date` desde el valor local del input y usar `.toISOString()`. Guardar ese valor en `start`/`end`.
- [x] **Eventos de día completo:** mantenerlos como `YYYY-MM-DD` sin conversión (flotantes).
- [x] **Visualización:** al pintar, interpretar el ISO con `Z` en hora local (FullCalendar y `new Date(iso)` ya lo hacen). Verifica que un evento creado a las 14:00 se siga viendo a las 14:00 para un usuario en la zona local.
- [x] **Servidor:** `effectiveStart` no necesita cambios de lógica, pero depende de la zona del proceso para los eventos de día completo. Esto se resuelve en deploy poniendo `TZ=Europe/Madrid` (tu zona) como variable de entorno del backend en Railway. **Anótalo en "Pendiente para mí"** y añádelo al `.env.example` del servidor con un comentario.

**Prueba:** crear un evento con hora, cambiar la zona horaria de la máquina/proceso (simular Railway en UTC) y confirmar que el instante del recordatorio no se desplaza. Un evento de día completo sigue anclado al día correcto.

---

## Bloque 5 — Amarillos rápidos

**Files:** `server/index.js`, `client/src/push.ts`, `client/src/types.ts`

- [x] **CORS de `/health`:** `app.use(cors())` habilita `*`. Reusar el mismo allowlist/callback que Socket.io (o al menos `origin: ALLOWED`) para no exponer `*`.
- [x] **`push.ts`:** si `VITE_VAPID_PUBLIC_KEY` no existe, loguear un error claro y devolver `null` antes de llamar a `urlBase64ToUint8Array`, en vez de reventar con un mensaje críptico.
- [x] **`types.ts`:** añadir `reminder_sent` a la interfaz `Event` (tipado como `0 | 1`, no `boolean` — ver nota) (el servidor lo devuelve con `SELECT *`), para alinear tipos con lo que llega.

**Prueba:** `curl` a `/health` desde un origen no permitido no recibe `Access-Control-Allow-Origin: *`; un build sin `VITE_VAPID_PUBLIC_KEY` da un error legible; `tsc` no se queja del acceso a `reminder_sent`.

---

## Orden y cierre

1. Bloque 1 (robustez) → 2. Bloque 2 (auth) → 3. Bloque 3 (FK) → 4. Bloque 4 (TZ) → 5. Bloque 5 (amarillos).
2. Ejecuta las pruebas manuales de cada bloque y repórtame el resultado.
3. Recopila en **"Pendiente para mí"** lo que quede fuera del repo (sobre todo `TZ=Europe/Madrid` en Railway).
4. Cuando esté todo verde, continúa con la **Fase B (PWA)** del brief `brief-codigo-claude-code.md`.

**No despliegues.**
