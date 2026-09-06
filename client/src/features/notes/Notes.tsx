import { useState, useEffect, useRef } from 'react'
import './notes.css'
import type { Note } from '../../types'
import type { UpdateNoteResult } from './useNotes'
import { useIsMobile } from '../../hooks/useIsMobile'

interface Props {
  notes: Note[]
  onCreateNote: () => void
  onUpdateNote: (id: string, title: string, body: string, updatedAt: string) => Promise<UpdateNoteResult>
  onDeleteNote: (id: string) => void
}

const IconTrash = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6M14 11v6"/>
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
)

const IconChevronLeft = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
)

const IconPlus = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
)

const IconNotesPlaceholder = () => (
  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <polyline points="10 9 9 9 8 9"/>
  </svg>
)

export default function Notes({ notes, onCreateNote, onUpdateNote, onDeleteNote }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [localTitle, setLocalTitle] = useState('')
  const [localBody, setLocalBody] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [conflict, setConflict] = useState<Note | null>(null)
  const [mobilePage, setMobilePage] = useState<'notes' | 'detail'>('notes')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevNotesRef = useRef<Note[]>(notes)
  // Versión (updated_at) + contenido sobre los que se basan las ediciones
  // locales actuales. Avanza al guardar con éxito o al adoptar cambios ajenos;
  // NO avanza con los `note-updated` de otras personas si tenemos cambios sin guardar.
  const baseRef = useRef<{ updated_at: string; title: string; body: string }>({ updated_at: '', title: '', body: '' })
  const isMobile = useIsMobile()

  // Auto-select newly created note
  useEffect(() => {
    const newNote = notes.find(n => !prevNotesRef.current.some(p => p.id === n.id))
    if (newNote) {
      setSelectedId(newNote.id)
      if (isMobile) setMobilePage('detail')
    }
    prevNotesRef.current = notes
  }, [notes, isMobile])

  // Cargar contenido al cambiar de nota seleccionada.
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    if (!selectedId) return
    const note = notes.find(n => n.id === selectedId)
    if (note) {
      setLocalTitle(note.title)
      setLocalBody(note.body)
      setSaveStatus('idle')
      baseRef.current = { updated_at: note.updated_at, title: note.title, body: note.body }
    }
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedNote = notes.find(n => n.id === selectedId) ?? null

  // Cambio remoto de la nota abierta: si no tenemos ediciones sin guardar,
  // adoptamos la versión del servidor (así un "lector" ve las ediciones ajenas
  // en vivo). Si sí las tenemos, no se toca — el próximo guardado dará conflicto.
  useEffect(() => {
    if (!selectedNote || selectedNote.updated_at === baseRef.current.updated_at) return
    const dirty = localTitle !== baseRef.current.title || localBody !== baseRef.current.body
    if (!dirty) {
      setLocalTitle(selectedNote.title)
      setLocalBody(selectedNote.body)
      setSaveStatus('idle')
      baseRef.current = { updated_at: selectedNote.updated_at, title: selectedNote.title, body: selectedNote.body }
    }
  }, [selectedNote?.updated_at]) // eslint-disable-line react-hooks/exhaustive-deps

  function selectNote(id: string) {
    setSelectedId(id)
    setConflict(null)
    if (isMobile) setMobilePage('detail')
  }

  // Clear pending timer on unmount
  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
  }, [])

  function scheduleSave(title: string, body: string) {
    if (!selectedId || conflict) return
    setSaveStatus('saving')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    const id = selectedId
    saveTimerRef.current = setTimeout(async () => {
      const res = await onUpdateNote(id, title, body, baseRef.current.updated_at)
      if (res.status === 'ok' && res.note) {
        if (id === selectedId) {
          baseRef.current = { updated_at: res.note.updated_at, title, body }
          setSaveStatus('saved')
        }
      } else if (res.status === 'conflict' && res.note) {
        if (id === selectedId) {
          setConflict(res.note)
          setSaveStatus('idle')
        }
      } else {
        if (id === selectedId) setSaveStatus('idle')
      }
    }, 600)
  }

  function resolveConflict() {
    if (!conflict) return
    setLocalTitle(conflict.title)
    setLocalBody(conflict.body)
    baseRef.current = { updated_at: conflict.updated_at, title: conflict.title, body: conflict.body }
    setConflict(null)
    setSaveStatus('idle')
  }

  function handleTitleChange(val: string) {
    setLocalTitle(val)
    scheduleSave(val, localBody)
  }

  function handleBodyChange(val: string) {
    setLocalBody(val)
    scheduleSave(localTitle, val)
  }

  function handleCreate() {
    onCreateNote()
  }

  function handleDelete(id: string) {
    onDeleteNote(id)
    if (id === selectedId) {
      setSelectedId(null)
      if (isMobile) setMobilePage('notes')
    }
  }

  const showConflict = conflict !== null && conflict.id === selectedId

  // ─── Sidebar ────────────────────────────────────────────
  const sidebar = (
    <aside className="notes-sidebar">
      <div className="notes-sidebar-header">
        <span className="notes-sidebar-label">Notas</span>
        <button className="notes-new-btn btn-primary" onClick={handleCreate} aria-label="Nueva nota">
          <IconPlus /> Nueva
        </button>
      </div>

      <div className="notes-sidebar-scroll">
        {notes.length === 0 && (
          <p className="notes-sidebar-empty">Crea tu primera nota</p>
        )}
        {notes.map(note => (
          <div
            key={note.id}
            className={`notes-sidebar-item ${note.id === selectedId ? 'notes-sidebar-item--active' : ''}`}
          >
            <button
              className="notes-sidebar-item-btn"
              onClick={() => selectNote(note.id)}
            >
              <span className="notes-sidebar-item-title">{note.title || 'Sin título'}</span>
              {note.body && (
                <span className="notes-sidebar-item-preview">
                  {note.body.slice(0, 60).replace(/\n/g, ' ')}
                </span>
              )}
            </button>
            <button
              className="notes-delete-btn"
              onClick={() => handleDelete(note.id)}
              aria-label={`Eliminar nota ${note.title}`}
            >
              <IconTrash />
            </button>
          </div>
        ))}
      </div>
    </aside>
  )

  // ─── Detail panel ────────────────────────────────────────
  const detail = (
    <section className="notes-detail">
      {!selectedNote ? (
        <div className="notes-empty">
          <span className="notes-empty-icon"><IconNotesPlaceholder /></span>
          <h3>Selecciona una nota</h3>
          <p>Elige una nota de la barra lateral o crea una nueva</p>
        </div>
      ) : (
        <>
          <div className="notes-detail-header">
            {isMobile && (
              <button
                className="btn-ghost btn-icon"
                onClick={() => setMobilePage('notes')}
                aria-label="Volver a notas"
              >
                <IconChevronLeft />
              </button>
            )}
            <input
              className="notes-title-input"
              value={localTitle}
              onChange={e => handleTitleChange(e.target.value)}
              placeholder="Sin título"
            />
            {saveStatus !== 'idle' && (
              <span className="notes-save-status">
                {saveStatus === 'saving' ? 'Guardando…' : 'Guardado'}
              </span>
            )}
            <button
              className="notes-delete-btn notes-delete-btn--visible"
              onClick={() => handleDelete(selectedNote.id)}
              aria-label="Eliminar nota"
            >
              <IconTrash />
            </button>
          </div>

          {showConflict && (
            <div className="notes-conflict" role="alert">
              <span>Otra persona editó esta nota. Tus cambios sin guardar no se han enviado.</span>
              <button className="btn-secondary" onClick={resolveConflict}>
                Cargar la versión actual
              </button>
            </div>
          )}

          <textarea
            className="notes-body"
            value={localBody}
            onChange={e => handleBodyChange(e.target.value)}
            placeholder="Empieza a escribir…"
          />
        </>
      )}
    </section>
  )

  if (isMobile) {
    return (
      <div className="notes-container">
        {mobilePage === 'notes' ? sidebar : detail}
      </div>
    )
  }

  return (
    <div className="notes-container">
      {sidebar}
      {detail}
    </div>
  )
}
