# Mini-brief — Re-autorización al reconectar el socket

> **Para Claude Code:** aplica este único bloque. Lee el código real de la capa de socket antes de tocarlo; el fragmento es de referencia.
>
> **⛔ Solo código. NO despliegues.** Puedes hacerlo en la misma tanda que la **Fase B (PWA)** del `brief-codigo-claude-code.md`. Al terminar, ejecuta la prueba y repórtame el resultado.

## Problema

La autorización de escritura vive en memoria del socket en el servidor (`socket.data.authedRooms`) y el `socket.join(room)` también. Cuando el servidor se reinicia (cada redeploy en Railway, o cualquier reinicio) o hay un corte de red, Socket.io reconecta al cliente **como un socket nuevo** en el servidor: `authedRooms` vacío y fuera de la room. Efecto para el usuario, sin recargar la página:

- Sus escrituras se rechazan en silencio (elegimos rechazo silencioso), sin pista de por qué "dejó de funcionar".
- Al haber perdido el `join(room)`, probablemente deja de recibir los broadcasts en tiempo real.

## Solución (lado cliente)

Re-emitir `join-room` automáticamente al reconectar, con las credenciales de la sala guardadas en memoria de la sesión. Eso recupera de golpe la autorización de escritura **y** la pertenencia a la room para los broadcasts. No requiere cambios en el servidor (el handler `join-room` ya re-verifica la contraseña y vuelve a hacer `join` + `authedRooms`).

**Files:** `client/src/socket.ts` (o donde gestiones la conexión), y los puntos donde hoy se maneja `access-granted` / `room-created` y el botón "Salir".

- [x] Guardar las credenciales de la sala en memoria tras un `create-room`/`join-room` exitoso, y limpiarlas al salir:

```ts
let currentRoom: { name: string; password: string } | null = null

export function rememberRoom(name: string, password: string) {
  currentRoom = { name, password }
}
export function forgetRoom() {
  currentRoom = null
}
```

  - Llama a `rememberRoom(name, password)` en el flujo donde el join/create resulta `access-granted`/`room-created`.
  - Llama a `forgetRoom()` en el "Salir" de la sala (y al recibir `access-denied`), para que una reconexión no vuelva a entrar en una sala que el usuario abandonó.

- [x] Re-emitir `join-room` al reconectar. `socket.on('connect')` cubre reconexión de forma uniforme; la guarda `if (currentRoom)` evita disparar nada en la primera conexión (antes del primer join, cuando aún no hay credenciales, el flujo normal de la UI hace el join):

```ts
socket.on('connect', () => {
  if (currentRoom) {
    socket.emit('join-room', currentRoom) // re-autoriza + re-entra en la room
  }
})
```

- [x] **Re-sincronizar estado tras la reconexión.** El `access-granted` inicial se maneja hoy con `socket.once(...)` + cleanup (ya consumido), así que la respuesta del re-join tras reconectar no la captura nadie. Añade un handler **persistente** (registrado una sola vez, p. ej. en `Dashboard`) que, al recibir `access-granted`, refresque el estado (events/lists/listItems/notes) con el payload recibido — es la fuente de verdad del servidor y re-sincroniza lo que se hubiera perdido offline. Evita duplicar listeners: que este handler no se re-registre en cada render.

- [x] **Manejar `access-denied` en reconexión** con elegancia: si la sala ya no existe (p. ej. la limpió el servidor mientras estabas offline), volver a `RoomEntry` con un mensaje claro en vez de dejar al usuario en una sala fantasma. Recuerda `forgetRoom()` en este caso.

## Prueba

- [x] Con la app abierta y dentro de una sala, **reinicia el servidor** (mata y relanza `node index.js`).
- [x] Sin recargar la página, confirma que:
  - El cliente reconecta y **vuelve a poder crear/editar/borrar** eventos, notas y listas (la autorización se recuperó).
  - Los broadcasts en tiempo real vuelven a llegar (abre una segunda pestaña en la misma sala y comprueba que los cambios se propagan).
- [x] "Salir" de la sala y forzar una reconexión → el cliente **no** vuelve a entrar en la sala anterior.

Reporta el resultado. Luego continúa con la **Fase B (PWA)** del `brief-codigo-claude-code.md` (saltándote su Fase A, ya hecha).
