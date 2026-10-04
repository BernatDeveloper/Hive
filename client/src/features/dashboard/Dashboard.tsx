import { useEffect, useRef, useState } from 'react'
import './dashboard.css'
import { forgetRoom, usePresence } from '../../socket'
import type { Room, Event, List, ListItem, Note, Bookmark } from '../../types'
import { readableTextColor } from '../../shared/color'
import { formatRelativeTime } from '../../shared/relativeTime'
import ModuleGrid from './ModuleGrid'
import type { ModuleId } from './ModuleGrid'
import Calendar from '../calendar/Calendar'
import Lists from '../lists/Lists'
import Notes from '../notes/Notes'
import Bookmarks from '../bookmarks/Bookmarks'
import ShareLinkDialog from '../bookmarks/ShareLinkDialog'
import { findDuplicate } from '../bookmarks/bookmarkUtils'
import type { SharedLink } from '../bookmarks/shareTarget'
import RoomSettings from '../settings/RoomSettings'
import GlobalSearch from '../search/GlobalSearch'
import { useRoomStyle } from '../settings/useRoomStyle'
import { useEvents } from '../calendar/useEvents'
import { useLists } from '../lists/useLists'
import { useNotes } from '../notes/useNotes'
import { useBookmarks } from '../bookmarks/useBookmarks'
import { useRoomLost } from './useRoomLost'
import { useUndo } from './useUndo'
import UndoToast from './UndoToast'

interface Props {
  room: Room
  initialEvents: Event[]
  initialLists: List[]
  initialListItems: ListItem[]
  initialNotes: Note[]
  initialBookmarks: Bookmark[]
  // Enlace llegado desde "Compartir" del sistema: se ofrece guardarlo (con
  // confirmación) en cuanto se entra a la sala. `onSharedHandled` lo consume.
  sharedLink?: SharedLink | null
  onSharedHandled?: () => void
  onLeave: (message?: string) => void
  onUpdateRoom: (room: Room) => void
}

// Avatares visibles en el header; el resto se resume en un círculo "+N".
const MAX_AVATARS = 3

const IconArrowLeft = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="19" y1="12" x2="5" y2="12"/>
    <polyline points="12 19 5 12 12 5"/>
  </svg>
)

const IconSettings = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
)

const IconSearch = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
)

export default function Dashboard({ room, initialEvents, initialLists, initialListItems, initialNotes, initialBookmarks, sharedLink, onSharedHandled, onLeave, onUpdateRoom }: Props) {
  const [activeModule, setActiveModule] = useState<ModuleId | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [showPeople, setShowPeople] = useState(false)
  const peopleRef = useRef<HTMLDivElement>(null)

  // Navegación desde la búsqueda global: cada módulo consume su "pedido" en
  // un efecto y lo limpia (ver jumpToEvent/focusNoteId/focusListId).
  const [calendarJump, setCalendarJump] = useState<Event | null>(null)
  const [notesFocusId, setNotesFocusId] = useState<string | null>(null)
  const [listsFocusId, setListsFocusId] = useState<string | null>(null)
  const [bookmarksFocusId, setBookmarksFocusId] = useState<string | null>(null)

  const { colors, cssVars, roomWithColors } = useRoomStyle(room, onUpdateRoom)
  const presence = usePresence()
  const onlineCount = presence.filter(p => p.online).length
  const cal = useEvents(room.name, initialEvents)
  const lists = useLists(room.name, initialLists, initialListItems)
  const notes = useNotes(room.name, initialNotes)
  const bookmarks = useBookmarks(room.name, initialBookmarks)
  const undo = useUndo(room.name)
  useRoomLost(onLeave)

  function openSearchEvent(event: Event) {
    setActiveModule('calendar')
    setCalendarJump(event)
  }
  function openSearchNote(noteId: string) {
    setActiveModule('notes')
    setNotesFocusId(noteId)
  }
  function openSearchList(listId: string) {
    setActiveModule('lists')
    setListsFocusId(listId)
  }
  function openSearchBookmark(bookmarkId: string) {
    setActiveModule('bookmarks')
    setBookmarksFocusId(bookmarkId)
  }

  // Cierra el desplegable de presencia al tocar fuera o al pulsar Escape.
  useEffect(() => {
    if (!showPeople) return
    function onPointerDown(e: PointerEvent) {
      if (!peopleRef.current?.contains(e.target as Node)) setShowPeople(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowPeople(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [showPeople])

  const sharedDuplicate = sharedLink ? findDuplicate(bookmarks.bookmarks, sharedLink.url) : undefined

  function saveSharedLink() {
    if (!sharedLink) return
    bookmarks.createBookmark(sharedLink.url)
    setActiveModule('bookmarks') // se ve entrar la tarjeta nueva arriba
    onSharedHandled?.()
  }

  function showSharedDuplicate(id: string) {
    setActiveModule('bookmarks')
    setBookmarksFocusId(id)
    onSharedHandled?.()
  }

  function leave() {
    forgetRoom()
    onLeave()
  }

  return (
    <div className="dashboard" style={cssVars}>
      <header className="dashboard-header">
        <div className="dashboard-header-left">
          {activeModule !== null && (
            <button
              className="btn-ghost btn-back-module"
              onClick={() => setActiveModule(null)}
              aria-label="Volver al dashboard"
            >
              <IconArrowLeft />
            </button>
          )}
          <span className="dashboard-room-name">{room.name}</span>
        </div>

        {/* Centro del header: los miembros de la sala (columna propia de la rejilla,
            así queda centrado de verdad aunque el nombre de la sala sea largo). */}
        <div className="dashboard-header-center">
        {presence.length > 0 && (
          <div className="dashboard-presence-wrap" ref={peopleRef}>
            <button
              type="button"
              className="dashboard-presence"
              onClick={() => setShowPeople(v => !v)}
              aria-haspopup="dialog"
              aria-expanded={showPeople}
              aria-label={`Miembros de la sala: ${presence.length}, ${onlineCount} en línea`}
            >
              {presence.slice(0, MAX_AVATARS).map((p, i) => (
                <span
                  key={i}
                  className={`dashboard-presence-avatar${p.online ? ' is-online' : ' is-offline'}`}
                  // El primero encima: así el punto verde (abajo a la
                  // derecha) no lo tapa el avatar siguiente.
                  style={{ background: p.color, color: readableTextColor(p.color), zIndex: MAX_AVATARS - i }}
                >
                  {p.name.charAt(0)}
                </span>
              ))}
              {presence.length > MAX_AVATARS && (
                <span className="dashboard-presence-avatar dashboard-presence-more">+{presence.length - MAX_AVATARS}</span>
              )}
            </button>

            {showPeople && (
              <div className="dashboard-presence-popover" role="dialog" aria-label="Miembros de la sala">
                <p className="dashboard-presence-popover-title">
                  Miembros · {presence.length}
                  <span className="dashboard-presence-popover-online">{onlineCount} en línea</span>
                </p>
                {presence.map((p, i) => (
                  <div key={i} className={`dashboard-presence-popover-item${p.online ? '' : ' is-offline'}`}>
                    <span
                      className={`dashboard-presence-avatar dashboard-presence-avatar--list${p.online ? ' is-online' : ''}`}
                      style={{ background: p.color, color: readableTextColor(p.color) }}
                    >
                      {p.name.charAt(0)}
                    </span>
                    <span className="dashboard-presence-popover-name">{p.name}</span>
                    <span className={`dashboard-presence-status${p.online ? ' is-online' : ''}`}>
                      {p.online ? 'En línea' : p.last_seen_at ? `Visto ${formatRelativeTime(p.last_seen_at)}` : 'Desconectado'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        </div>

        <div className="dashboard-header-right">
          <button className="btn-ghost btn-icon" onClick={() => setShowSearch(true)} aria-label="Buscar">
            <IconSearch />
          </button>
          <button className="btn-ghost btn-icon" onClick={() => setShowSettings(true)} aria-label="Ajustes">
            <IconSettings />
          </button>
        </div>
      </header>

      <main className="dashboard-main">
        {activeModule === null && <ModuleGrid onSelect={setActiveModule} />}
        {activeModule === 'calendar' && (
          <Calendar
            events={cal.events}
            primaryColor={colors.primary_color ?? '#3B82F6'}
            conflict={cal.conflict}
            onCreateEvent={cal.createEvent}
            onUpdateEvent={cal.updateEvent}
            onDeleteEvent={(id, scope) => { cal.deleteEvent(id, scope).then(undo.offer) }}
            onDismissConflict={cal.dismissConflict}
            jumpToEvent={calendarJump}
            onJumpHandled={() => setCalendarJump(null)}
          />
        )}
        {activeModule === 'lists' && (
          <Lists
            lists={lists.lists}
            listItems={lists.listItems}
            onCreateList={lists.createList}
            onUpdateListTitle={lists.updateListTitle}
            onDeleteList={(id) => { lists.deleteList(id).then(undo.offer) }}
            onCloneList={lists.cloneList}
            onCreateItem={lists.createItem}
            onToggleItem={lists.toggleItem}
            onUpdateItemText={lists.updateItemText}
            onDeleteItem={(id) => { lists.deleteItem(id).then(undo.offer) }}
            onClearCompleted={(listId) => { lists.clearCompleted(listId).then(undo.offer) }}
            focusListId={listsFocusId}
            onFocusHandled={() => setListsFocusId(null)}
          />
        )}
        {activeModule === 'notes' && (
          <Notes
            notes={notes.notes}
            onCreateNote={notes.createNote}
            onUpdateNote={notes.updateNote}
            onDeleteNote={(id) => { notes.deleteNote(id).then(undo.offer) }}
            onTogglePin={notes.togglePin}
            focusNoteId={notesFocusId}
            onFocusHandled={() => setNotesFocusId(null)}
          />
        )}
        {activeModule === 'bookmarks' && (
          <Bookmarks
            bookmarks={bookmarks.bookmarks}
            error={bookmarks.error}
            onClearError={bookmarks.clearError}
            onCreate={bookmarks.createBookmark}
            onUpdate={bookmarks.updateBookmark}
            onRefreshPreview={bookmarks.refreshPreview}
            onDelete={(id) => { bookmarks.deleteBookmark(id).then(undo.offer) }}
            onRenameTag={bookmarks.renameTag}
            onDeleteTag={(tag) => { bookmarks.deleteTag(tag).then(undo.offer) }}
            focusBookmarkId={bookmarksFocusId}
            onFocusHandled={() => setBookmarksFocusId(null)}
          />
        )}
      </main>

      {undo.toast && (
        <UndoToast label={undo.toast.label} onUndo={undo.undo} onDismiss={undo.dismiss} />
      )}

      {showSettings && (
        <RoomSettings room={roomWithColors} events={cal.events} onClose={() => setShowSettings(false)} onLeave={leave} />
      )}

      {sharedLink && (
        <ShareLinkDialog
          link={sharedLink}
          duplicate={sharedDuplicate}
          onSave={saveSharedLink}
          onShowExisting={() => sharedDuplicate && showSharedDuplicate(sharedDuplicate.id)}
          onCancel={() => onSharedHandled?.()}
        />
      )}

      {showSearch && (
        <GlobalSearch
          events={cal.events}
          notes={notes.notes}
          lists={lists.lists}
          listItems={lists.listItems}
          bookmarks={bookmarks.bookmarks}
          onOpenEvent={openSearchEvent}
          onOpenNote={openSearchNote}
          onOpenList={openSearchList}
          onOpenBookmark={openSearchBookmark}
          onClose={() => setShowSearch(false)}
        />
      )}
    </div>
  )
}
