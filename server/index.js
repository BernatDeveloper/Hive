import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import webpush from 'web-push'
import {
  initDb, getEvents, createEvent, updateEvent, deleteEvent,
  createRoom, verifyRoomAccess, updateRoomStyle, cleanInactiveRooms,
  getLists, getListItems, createList, deleteList,
  createListItem, toggleListItem, deleteListItem,
  getNotes, createNote, updateNote, deleteNote,
  createEventsBatch, generateRecurrenceInstances,
  getEventById, updateSeries, deleteSeries,
  savePushSubscription, deletePushSubscription, resetReminderSent,
} from './db.js'
import { startReminderScheduler } from './reminders.js'

process.on('uncaughtException', (err) => console.error('[uncaughtException]', err))
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err))

try {
  process.loadEnvFile()
} catch {
  // no .env file (e.g. producción con variables inyectadas por la plataforma)
}

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
)

const app = express()
const httpServer = createServer(app)

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  process.env.CLIENT_ORIGIN // dominio de producción
].filter(Boolean)

function isOriginAllowed(origin) {
  const host = new URL(origin).hostname
  return ALLOWED_ORIGINS.includes(origin) || /\.vercel\.app$/.test(host)
}

const io = new Server(httpServer, {
  cors: {
    origin(origin, cb) {
      if (!origin) return cb(null, true) // health checks, curl
      if (isOriginAllowed(origin)) return cb(null, true)
      cb(new Error('Not allowed by CORS'))
    },
    methods: ['GET', 'POST']
  }
})

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true)
    if (isOriginAllowed(origin)) return cb(null, true)
    cb(new Error('Not allowed by CORS'))
  }
}))
app.use(express.json())

initDb()
cleanInactiveRooms()
setInterval(cleanInactiveRooms, 24 * 60 * 60 * 1000)
startReminderScheduler()

app.get('/health', (req, res) => res.json({ ok: true }))

function isNonEmptyString(v) {
  return typeof v === 'string' && v.length > 0
}

function isAuthedFor(socket, room) {
  return typeof room === 'string' && socket.data.authedRooms?.has(room) === true
}

io.on('connection', (socket) => {
  socket.on('create-room', ({ name, password } = {}) => {
    try {
      if (!isNonEmptyString(name) || !isNonEmptyString(password)) return
      const result = createRoom(name, password)
      if (!result.ok) {
        socket.emit('room-error', result.error)
      } else {
        socket.join(name)
        socket.data.authedRooms ??= new Set()
        socket.data.authedRooms.add(name)
        socket.emit('room-created', { name })
      }
    } catch (e) {
      console.error('[create-room]', e)
      socket.emit('room-error', 'No se pudo crear la sala')
    }
  })

  socket.on('join-room', ({ name, password } = {}) => {
    try {
      if (!isNonEmptyString(name) || !isNonEmptyString(password)) return
      const result = verifyRoomAccess(name, password)
      if (!result.ok) {
        socket.emit('access-denied', result.error)
        return
      }
      socket.join(name)
      socket.data.authedRooms ??= new Set()
      socket.data.authedRooms.add(name)
      socket.emit('access-granted', {
        room: result.room,
        events: getEvents(name),
        lists: getLists(name),
        listItems: getListItems(name),
        notes: getNotes(name),
      })
    } catch (e) {
      console.error('[join-room]', e)
      socket.emit('access-denied', 'No se pudo acceder a la sala')
    }
  })

  socket.on('update-room-style', ({ name, styles } = {}) => {
    try {
      if (!isNonEmptyString(name)) return
      if (!isAuthedFor(socket, name)) return
      if (typeof styles !== 'object' || styles === null) return
      const updatedRoom = updateRoomStyle(name, styles)
      io.to(name).emit('style-updated', updatedRoom)
    } catch (e) {
      console.error('[update-room-style]', e)
      socket.emit('room-error', 'No se pudo actualizar el estilo de la sala')
    }
  })

  socket.on('create-event', ({ room, event } = {}) => {
    try {
      if (!isNonEmptyString(room)) return
      if (!isAuthedFor(socket, room)) return
      if (typeof event !== 'object' || event === null) return
      if (!isNonEmptyString(event.start) || !isNonEmptyString(event.end)) return
      const title = typeof event.title === 'string' ? event.title.trim() : ''
      if (!title) return
      const safeEvent = { ...event, title }

      if (safeEvent.recurrence_rule && safeEvent.recurrence_rule !== 'none') {
        const { instances } = generateRecurrenceInstances(safeEvent, safeEvent.recurrence_rule)
        const created = createEventsBatch(room, instances)
        io.to(room).emit('events-created', created)
      } else {
        const created = createEvent(room, { ...safeEvent, recurrence_rule: null, recurrence_id: null })
        io.to(room).emit('event-created', created)
      }
    } catch (e) {
      console.error('[create-event]', e)
      socket.emit('event-error', { message: 'No se pudo crear el evento' })
    }
  })

  socket.on('update-event', ({ room, event } = {}) => {
    try {
      if (!isNonEmptyString(room)) return
      if (!isAuthedFor(socket, room)) return
      if (typeof event !== 'object' || event === null) return
      if (!isNonEmptyString(event.id)) return
      if (!isNonEmptyString(event.start) || !isNonEmptyString(event.end)) return
      const title = typeof event.title === 'string' ? event.title.trim() : ''
      if (!title) return
      const safeEvent = { ...event, title }

      const before = getEventById(safeEvent.id)
      const offsetChanged = before && (safeEvent.reminder_offset ?? null) !== before.reminder_offset

      if (safeEvent.recurrence_id) {
        let updated = updateSeries(safeEvent)
        if (offsetChanged) {
          for (const ev of updated) resetReminderSent(ev.id)
          updated = updated.map(ev => ({ ...ev, reminder_sent: 0 }))
        }
        io.to(room).emit('series-updated', { events: updated })
      } else {
        let updated = updateEvent(safeEvent)
        if (before && (updated.start !== before.start || offsetChanged)) {
          resetReminderSent(safeEvent.id)
          updated = { ...updated, reminder_sent: 0 }
        }
        io.to(room).emit('event-updated', updated)
      }
    } catch (e) {
      console.error('[update-event]', e)
      socket.emit('event-error', { message: 'No se pudo actualizar el evento' })
    }
  })

  socket.on('delete-event', ({ room, id } = {}) => {
    try {
      if (!isNonEmptyString(room) || !isNonEmptyString(id)) return
      if (!isAuthedFor(socket, room)) return
      const ev = getEventById(id)
      if (ev?.recurrence_id) {
        deleteSeries(ev.recurrence_id)
        io.to(room).emit('series-deleted', { recurrence_id: ev.recurrence_id })
      } else {
        deleteEvent(id)
        io.to(room).emit('event-deleted', id)
      }
    } catch (e) {
      console.error('[delete-event]', e)
      socket.emit('event-error', { message: 'No se pudo eliminar el evento' })
    }
  })

  socket.on('create-list', ({ room, title } = {}) => {
    try {
      if (!isNonEmptyString(room)) return
      if (!isAuthedFor(socket, room)) return
      const safeTitle = typeof title === 'string' ? title.trim() : ''
      if (!safeTitle) return
      const list = createList(room, safeTitle)
      io.to(room).emit('list-created', list)
    } catch (e) {
      console.error('[create-list]', e)
      socket.emit('list-error', { message: 'No se pudo crear la lista' })
    }
  })

  socket.on('delete-list', ({ room, id } = {}) => {
    try {
      if (!isNonEmptyString(room) || !isNonEmptyString(id)) return
      if (!isAuthedFor(socket, room)) return
      deleteList(id)
      io.to(room).emit('list-deleted', id)
    } catch (e) {
      console.error('[delete-list]', e)
      socket.emit('list-error', { message: 'No se pudo eliminar la lista' })
    }
  })

  socket.on('create-list-item', ({ room, listId, text } = {}) => {
    try {
      if (!isNonEmptyString(room) || !isNonEmptyString(listId)) return
      if (!isAuthedFor(socket, room)) return
      const safeText = typeof text === 'string' ? text.trim() : ''
      if (!safeText) return
      const item = createListItem(listId, room, safeText)
      io.to(room).emit('list-item-created', item)
    } catch (e) {
      console.error('[create-list-item]', e)
      socket.emit('list-error', { message: 'No se pudo añadir el ítem' })
    }
  })

  socket.on('toggle-list-item', ({ room, id, checked } = {}) => {
    try {
      if (!isNonEmptyString(room) || !isNonEmptyString(id)) return
      if (!isAuthedFor(socket, room)) return
      const item = toggleListItem(id, Boolean(checked))
      io.to(room).emit('list-item-updated', item)
    } catch (e) {
      console.error('[toggle-list-item]', e)
      socket.emit('list-error', { message: 'No se pudo actualizar el ítem' })
    }
  })

  socket.on('delete-list-item', ({ room, id } = {}) => {
    try {
      if (!isNonEmptyString(room) || !isNonEmptyString(id)) return
      if (!isAuthedFor(socket, room)) return
      deleteListItem(id)
      io.to(room).emit('list-item-deleted', id)
    } catch (e) {
      console.error('[delete-list-item]', e)
      socket.emit('list-error', { message: 'No se pudo eliminar el ítem' })
    }
  })

  socket.on('create-note', ({ room, title } = {}) => {
    try {
      if (!isNonEmptyString(room)) return
      if (!isAuthedFor(socket, room)) return
      const safeTitle = typeof title === 'string' && title.trim() ? title.trim() : 'Sin título'
      const note = createNote(room, safeTitle)
      io.to(room).emit('note-created', note)
    } catch (e) {
      console.error('[create-note]', e)
      socket.emit('note-error', { message: 'No se pudo crear la nota' })
    }
  })

  socket.on('update-note', ({ room, note } = {}) => {
    try {
      if (!isNonEmptyString(room)) return
      if (!isAuthedFor(socket, room)) return
      if (typeof note !== 'object' || note === null || !isNonEmptyString(note.id)) return
      const safeNote = {
        id: note.id,
        title: typeof note.title === 'string' ? note.title : '',
        body: typeof note.body === 'string' ? note.body : '',
      }
      const updated = updateNote(safeNote)
      io.to(room).emit('note-updated', updated)
    } catch (e) {
      console.error('[update-note]', e)
      socket.emit('note-error', { message: 'No se pudo actualizar la nota' })
    }
  })

  socket.on('delete-note', ({ room, id } = {}) => {
    try {
      if (!isNonEmptyString(room) || !isNonEmptyString(id)) return
      if (!isAuthedFor(socket, room)) return
      deleteNote(id)
      io.to(room).emit('note-deleted', id)
    } catch (e) {
      console.error('[delete-note]', e)
      socket.emit('note-error', { message: 'No se pudo eliminar la nota' })
    }
  })

  socket.on('subscribe-push', ({ room, subscription } = {}) => {
    try {
      if (!isNonEmptyString(room)) return
      if (!isAuthedFor(socket, room)) return
      if (typeof subscription !== 'object' || subscription === null) return
      savePushSubscription(room, subscription)
      socket.emit('push-subscribed')
    } catch (e) {
      console.error('[subscribe-push]', e)
      socket.emit('push-error', { message: 'No se pudo registrar el dispositivo' })
    }
  })

  socket.on('unsubscribe-push', ({ endpoint } = {}) => {
    try {
      if (!isNonEmptyString(endpoint)) return
      // Sin `room` en este payload no se puede pedir isAuthedFor(socket, room);
      // exigimos al menos haber pasado la contraseña de alguna sala. El endpoint
      // en sí es un identificador opaco de push no adivinable, a diferencia de
      // un nombre de sala.
      if (!socket.data.authedRooms?.size) return
      deletePushSubscription(endpoint)
      socket.emit('push-unsubscribed')
    } catch (e) {
      console.error('[unsubscribe-push]', e)
      socket.emit('push-error', { message: 'No se pudo cancelar la suscripción' })
    }
  })
})

const PORT = process.env.PORT || 3001
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`)
})
