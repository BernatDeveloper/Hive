export function isNonEmptyString(v) {
  return typeof v === 'string' && v.length > 0
}

export function isAuthedFor(socket, room) {
  return typeof room === 'string' && socket.data.authedRooms?.has(room) === true
}

// Marca el socket como autorizado para escribir en `room` y lo mete en su canal.
export function markAuthed(socket, room) {
  socket.join(room)
  socket.data.authedRooms ??= new Set()
  socket.data.authedRooms.add(room)
}

// Patrón común de difusión a todos los sockets de una sala.
export function broadcast(io, room, event, payload) {
  io.to(room).emit(event, payload)
}
