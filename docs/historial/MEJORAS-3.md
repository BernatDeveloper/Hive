# MEJORAS-3 — Refresco de identidad en vivo

> Plan corto para Claude Code. Cierra un cabo suelto de la Fase 9 (identidad
> ligera). Mismas convenciones que MEJORAS-2 (pnpm; TS cliente / JS servidor ESM;
> UI en español, código en inglés). **Leer el archivo real antes de editarlo.**

## Contexto

La identidad de dispositivo (nombre + color) se guarda en `localStorage`. Al
cambiar el **nombre** en Ajustes se persiste localmente, pero **no se re-emite a la
sala**: los avatares/nombres del header (que salen de `usePresence()`) solo se
refrescan al unirse a la sala, así que el cambio no se ve hasta recargar (lo que
re-hace `join-room`). Este plan añade un round-trip `update-identity` para que el
cambio se propague en vivo.

Alcance real: solo el **nombre** (el color ya no se edita — se asigna al azar y es
fijo). Aun así, el mecanismo envía nombre + color por robustez.

## ⚠️ Decisión de diseño a respetar (NO tocar)

El `last_editor_name` de **eventos y notas es histórico a propósito**: registra
quién hizo la última edición **en ese momento**, no "el nombre actual de una
persona". No debe reescribirse cuando alguien se renombra (si lo hiciera,
reescribiría el pasado y, en salas con varias personas, atribuiría mal las
ediciones de otros). Este plan **no** modifica ese comportamiento; Claude Code
tampoco debe "arreglarlo".

---

## Tarea 1 — Cliente: emitir `update-identity` al guardar

**Archivo:** `client/src/features/settings/RoomSettings.tsx` (`emitWrite` ya está
importado y en uso en este archivo).

En `save()`, tras resolver y persistir la identidad, emitir el cambio a la sala:

```js
const identity = { name: identityName.trim() || 'Invitado', color: identityColor }
if (onlyThisRoom) {
  setRoomOverride(room.name, identity)
} else {
  setGlobalIdentity(identity)
  clearRoomOverride(room.name)
}
emitWrite('update-identity', { name: room.name, identity })  // ← nuevo
onClose()
```

(Va por `emitWrite` para heredar la semántica de cola offline igual que
`update-room-style` / `update-room-timezone`: si no hay conexión, se envía al
reconectar tras `access-granted`.)

## Tarea 2 — Servidor: handler `update-identity` ✅ HECHA

> Implementado tal cual se especifica, reutilizando `setPresence()` (que ya
> hacía exactamente "actualiza la entrada existente" al hacer `Map.set` sobre
> un `socketId` que ya estaba en el mapa — no hizo falta tocar el almacén).
> Autorización igual que `update-room-style`/`update-room-timezone`: `safeOn`
> + `isAuthedFor(socket, name)` manual (la clave de sala es `name`, no `room`,
> así que no encaja en `safeAuthedOn`). Tests añadidos en `presence.test.js`:
> refresco en vivo visible para el propio emisor y para el resto de la sala, y
> rechazo si el socket no está autenticado en esa sala. Por el camino salió
> una carrera en el test (el listener de `presence` se registraba después de
> que el broadcast del *join* ya estaba en vuelo — mismo patrón que el bug de
> Fase 4 documentado en `MEJORAS.md`) — arreglada drenando esos broadcasts
> intermedios antes de comprobar el de `update-identity`, no era un bug del
> servidor. 87 tests en verde.
>
> **Verificación adicional (del final del documento): confirmado y corregido.**
> `client/src/socket/client.ts` reemitía `join-room` con solo
> `{ name, password }` al reconectar — sin identidad. Arreglado incluyendo
> `editor_name`/`editor_color` en ese re-join, leídos con
> `getIdentity(currentRoom.name)` **en el momento de reconectar** (no
> cacheados junto a `currentRoom` en `rememberRoom`, para no reemitir un
> nombre desactualizado si el usuario se renombró entre medias). Sin test
> automático dedicado (la lógica de reconexión de `socket.io-client` no
> tiene infraestructura de test en este repo — los tests de cliente son solo
> de lógica pura); verificado por lectura del código y por los tests de
> servidor existentes de `update-identity`, que cubren el mismo payload que
> ahora manda el re-join.

**Archivo:** `server/sockets/presence.js` (**leer primero**) y donde se registra
(`registerPresenceHandlers`).

**Comportamiento (seguir el patrón ya existente del módulo, sin crear un almacén
nuevo):**
- Recibe `{ name, identity: { name, color } }`.
- Localiza la entrada de presencia del **socket actual** en el almacén que ya
  mantiene la presencia de la sala.
- Actualiza su `name` y `color` con los de `identity`.
- Re-emite `presence` a la sala en el **mismo formato** (`{ people: [...] }`) que
  ya usan `join` / `get-presence`.

No hay nada que persistir (la presencia es efímera; la identidad "de verdad" vive
en `localStorage` del cliente).

## Verificación adicional (posible bug latente — confirmar, no forzar)

En `client/src/socket/client.ts`, el re-join automático al reconectar emite
`join-room` con **solo `{ name, password }`**, sin identidad. Comprobar cómo llega
hoy la identidad al servidor:
- Si se registra a partir del `join-room` inicial → tras una reconexión (reinicio
  de servidor / corte de red) la identidad de presencia se perdería (volvería al
  valor por defecto) hasta el siguiente `update-identity`. En ese caso: incluir la
  identidad en el re-join, **o** re-emitir `update-identity` automáticamente tras
  `access-granted`.
- Si se registra por un emit aparte tras `access-granted` → no hay problema; dejar
  como está.

Decidir según lo que revele `presence.js` y el emit de `join-room` inicial (en el
flujo de auth del cliente). No ampliar el alcance si no aplica.

---

## Criterios de aceptación

- Cambiar el nombre en Ajustes y guardar → el avatar/nombre del header se actualiza
  **sin recargar**, tanto para uno mismo como para el resto de la sala (segunda
  pestaña con otra identidad lo ve cambiar en vivo).
- La presencia no se rompe: entrar/salir sigue actualizando la lista; `get-presence`
  sigue devolviendo la lista correcta.
- El "Editado por X" de eventos y notas **ya existentes NO cambia** al renombrarse
  (sigue siendo histórico).
- Si se aborda la verificación de reconexión: tras reiniciar el servidor, la
  identidad de presencia se conserva (no vuelve a "Invitado").
