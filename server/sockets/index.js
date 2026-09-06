import { registerRoomHandlers } from './rooms.js'
import { registerEventHandlers } from './events.js'
import { registerListHandlers } from './lists.js'
import { registerNoteHandlers } from './notes.js'
import { registerPushHandlers } from './push.js'

export function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    registerRoomHandlers(io, socket)
    registerEventHandlers(io, socket)
    registerListHandlers(io, socket)
    registerNoteHandlers(io, socket)
    registerPushHandlers(io, socket)
  })
}
