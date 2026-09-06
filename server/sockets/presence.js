// Presencia: cuántos sockets hay en cada sala. Se apoya en las rooms de
// Socket.io que ya usa la autorización.

// Nº de sockets en una room (excluye la "room" propia de cada socket, que
// comparte nombre con socket.id — pero los nombres de sala no son UUIDs de
// socket, así que basta con leer el adaptador).
export function roomCount(io, room) {
  return io.sockets.adapter.rooms.get(room)?.size ?? 0
}

export function emitPresence(io, room, count = roomCount(io, room)) {
  io.to(room).emit('presence', { count })
}

export function registerPresenceHandlers(io, socket) {
  // El cliente lo pide al montar el Dashboard: el `presence` que el servidor
  // difunde justo tras `access-granted` puede llegar antes de que su listener
  // esté listo.
  socket.on('get-presence', () => {
    for (const room of socket.data.authedRooms ?? []) {
      socket.emit('presence', { count: roomCount(io, room) })
    }
  })

  // `disconnecting` se dispara con el socket aún dentro de sus rooms: contamos
  // -1 para reflejar el estado tras su salida.
  socket.on('disconnecting', () => {
    for (const room of socket.rooms) {
      if (room === socket.id) continue
      emitPresence(io, room, Math.max(0, roomCount(io, room) - 1))
    }
  })
}
