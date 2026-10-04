import { registerRoomHandlers } from './rooms.js'
import { registerEventHandlers } from './events.js'
import { registerListHandlers } from './lists.js'
import { registerNoteHandlers } from './notes.js'
import { registerBookmarkHandlers } from './bookmarks.js'
import { registerPushHandlers } from './push.js'
import { registerPresenceHandlers } from './presence.js'
import { registerUndoHandlers } from './undo.js'

export function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    registerRoomHandlers(io, socket)
    registerEventHandlers(io, socket)
    registerListHandlers(io, socket)
    registerNoteHandlers(io, socket)
    registerBookmarkHandlers(io, socket)
    registerPushHandlers(io, socket)
    registerPresenceHandlers(io, socket)
    registerUndoHandlers(io, socket)
  })
}
