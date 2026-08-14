import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import {
  initDb, getEvents, createEvent, updateEvent, deleteEvent,
  createRoom, verifyRoomAccess, updateRoomStyle, cleanInactiveRooms,
  getLists, getListItems, createList, deleteList,
  createListItem, toggleListItem, deleteListItem,
  getNotes, createNote, updateNote, deleteNote,
  createEventsBatch, generateRecurrenceInstances,
  getEventById, updateSeries, deleteSeries,
} from './db.js'

const app = express()
const httpServer = createServer(app)

const io = new Server(httpServer, {
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:4173'],
    methods: ['GET', 'POST']
  }
})

app.use(cors())
app.use(express.json())

initDb()
cleanInactiveRooms()
setInterval(cleanInactiveRooms, 24 * 60 * 60 * 1000)

app.get('/health', (req, res) => res.json({ ok: true }))

io.on('connection', (socket) => {
  socket.on('create-room', ({ name, password }) => {
    const result = createRoom(name, password)
    if (!result.ok) {
      socket.emit('room-error', result.error)
    } else {
      socket.emit('room-created', { name })
    }
  })

  socket.on('join-room', ({ name, password }) => {
    const result = verifyRoomAccess(name, password)
    if (!result.ok) {
      socket.emit('access-denied', result.error)
      return
    }
    socket.join(name)
    socket.emit('access-granted', {
      room: result.room,
      events: getEvents(name),
      lists: getLists(name),
      listItems: getListItems(name),
      notes: getNotes(name),
    })
  })

  socket.on('update-room-style', ({ name, styles }) => {
    const updatedRoom = updateRoomStyle(name, styles)
    io.to(name).emit('style-updated', updatedRoom)
  })

  socket.on('create-event', ({ room, event }) => {
    if (event.recurrence_rule && event.recurrence_rule !== 'none') {
      const { instances } = generateRecurrenceInstances(event, event.recurrence_rule)
      const created = createEventsBatch(room, instances)
      io.to(room).emit('events-created', created)
    } else {
      const created = createEvent(room, { ...event, recurrence_rule: null, recurrence_id: null })
      io.to(room).emit('event-created', created)
    }
  })

  socket.on('update-event', ({ room, event }) => {
    if (event.recurrence_id) {
      const updated = updateSeries(event)
      io.to(room).emit('series-updated', { events: updated })
    } else {
      const updated = updateEvent(event)
      io.to(room).emit('event-updated', updated)
    }
  })

  socket.on('delete-event', ({ room, id }) => {
    const ev = getEventById(id)
    if (ev?.recurrence_id) {
      deleteSeries(ev.recurrence_id)
      io.to(room).emit('series-deleted', { recurrence_id: ev.recurrence_id })
    } else {
      deleteEvent(id)
      io.to(room).emit('event-deleted', id)
    }
  })

  socket.on('create-list', ({ room, title }) => {
    const list = createList(room, title)
    io.to(room).emit('list-created', list)
  })

  socket.on('delete-list', ({ room, id }) => {
    deleteList(id)
    io.to(room).emit('list-deleted', id)
  })

  socket.on('create-list-item', ({ room, listId, text }) => {
    const item = createListItem(listId, room, text)
    io.to(room).emit('list-item-created', item)
  })

  socket.on('toggle-list-item', ({ room, id, checked }) => {
    const item = toggleListItem(id, checked)
    io.to(room).emit('list-item-updated', item)
  })

  socket.on('delete-list-item', ({ room, id }) => {
    deleteListItem(id)
    io.to(room).emit('list-item-deleted', id)
  })

  socket.on('create-note', ({ room, title }) => {
    const note = createNote(room, title)
    io.to(room).emit('note-created', note)
  })

  socket.on('update-note', ({ room, note }) => {
    const updated = updateNote(note)
    io.to(room).emit('note-updated', updated)
  })

  socket.on('delete-note', ({ room, id }) => {
    deleteNote(id)
    io.to(room).emit('note-deleted', id)
  })
})

const PORT = 3001
httpServer.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
})
