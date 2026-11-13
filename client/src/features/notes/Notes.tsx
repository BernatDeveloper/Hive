import { useState, useEffect, useRef } from 'react'
import './notes.css'
import type { Note } from '../../types'
import type { UpdateNoteResult } from './useNotes'
import { useIsMobile } from '../../hooks/useIsMobile'
import { formatRelativeTime } from '../../shared/relativeTime'
import { parseChecklistLine, toggleChecklistLine, hasChecklistLine } from './checklist'

interface Props {
  notes: Note[]
  onCreateNote: () => void
  onUpdateNote: (id: string, title: string, body: string, updatedAt: string) => Promise<UpdateNoteResult>
  onDeleteNote: (id: string) => void
  onTogglePin: (id: string, pinned: boolean) => void
  // Abrir una nota desde fuera (búsqueda global); `onFocusHandled` limpia el
  // "pedido" en el padre para no reabrirla en cada re-render.
  focusNoteId?: string | null
  onFocusHandled?: () => void
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

const IconPin = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 17v5"/>
    <path d="M9 3h6l1 6 3 3v2H6v-2l3-3z"/>
  </svg>
)

const IconCheckSmall = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)

export default function Notes({ notes, onCreateNote, onUpdateNote, onDeleteNote, onTogglePin, focusNoteId, onFocusHandled }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [localTitle, setLocalTitle] = useState('')
  const [localBody, setLocalBody] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [conflict, setConflict] = useState<Note | null>(null)
  const [mobilePage, setMobilePage] = useState<'notes' | 'detail'>('notes')
  // Mientras el cuerpo no tiene el foco, si hay al menos una línea de
  // checklist se muestra la vista "renderizada" (checkboxes clicables) en
  // vez del textarea plano; tocarla (fuera de un checkbox) vuelve a editar.
  const [bodyFocused, setBodyFocused] = useState(false)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
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
      // Reset deliberado al cambiar de nota: también reinicia baseRef (la base
      // de la concurrencia optimista), que no puede tocarse durante el render.
      /* eslint-disable react-hooks/set-state-in-effect */
      setLocalTitle(note.title)
      setLocalBody(note.body)
      /* eslint-enable react-hooks/set-state-in-effect */
      setSaveStatus('idle')
      setBodyFocused(false)
      baseRef.current = { updated_at: note.updated_at, title: note.title, body: note.body }
    }
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Enfoca el textarea real al entrar en modo edición desde la vista
  // renderizada (ver notes-body-view más abajo).
  useEffect(() => {
    if (bodyFocused) bodyRef.current?.focus()
  }, [bodyFocused])

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

  // Resultado de la búsqueda global: abre la nota como si se hubiera tocado
  // en la barra lateral. Se aplica durante el render (mismo patrón que la
  // celebración de listas) en vez de en un efecto puro de "sincronizar
  // estado con una prop" — un efecto separado solo avisa al padre que ya se
  // consumió el pedido.
  const [appliedFocusNoteId, setAppliedFocusNoteId] = useState<string | null>(null)
  if (focusNoteId && focusNoteId !== appliedFocusNoteId) {
    setAppliedFocusNoteId(focusNoteId)
    if (focusNoteId !== selectedId) selectNote(focusNoteId)
  }

  useEffect(() => {
    if (focusNoteId) onFocusHandled?.()
  }, [focusNoteId]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Toca un checkbox de checklist en la vista renderizada: no entra en modo
  // edición, solo alterna esa línea y guarda como cualquier otro cambio.
  function toggleChecklistAt(lineIndex: number) {
    const lines = localBody.split('\n')
    lines[lineIndex] = toggleChecklistLine(lines[lineIndex])
    handleBodyChange(lines.join('\n'))
  }

  function enterBodyEdit() {
    setBodyFocused(true)
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
  const hasChecklist = hasChecklistLine(localBody)
  const wordCount = localBody.trim() ? localBody.trim().split(/\s+/).length : 0

  // Fijadas primero; dentro de cada grupo se conserva el orden recibido
  // (el servidor ya manda pinned desc, updated_at desc).
  const sortedNotes = [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned))

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
        {sortedNotes.map(note => (
          <div
            key={note.id}
            className={`notes-sidebar-item ${note.id === selectedId ? 'notes-sidebar-item--active' : ''}`}
          >
            <button
              className={`notes-pin-btn${note.pinned ? ' notes-pin-btn--on' : ''}`}
              onClick={() => onTogglePin(note.id, !note.pinned)}
              aria-label={note.pinned ? 'Desfijar nota' : 'Fijar nota'}
              aria-pressed={note.pinned}
            >
              <IconPin />
            </button>
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

          {selectedNote.last_editor_name && (
            <p className="notes-attribution">
              Editado por <strong>{selectedNote.last_editor_name}</strong> · {formatRelativeTime(selectedNote.updated_at)}
            </p>
          )}

          {showConflict && (
            <div className="notes-conflict" role="alert">
              <span>Otra persona editó esta nota. Tus cambios sin guardar no se han enviado.</span>
              <button className="btn-secondary" onClick={resolveConflict}>
                Cargar la versión actual
              </button>
            </div>
          )}

          {(bodyFocused || !hasChecklist) ? (
            <textarea
              ref={bodyRef}
              className="notes-body"
              value={localBody}
              onChange={e => handleBodyChange(e.target.value)}
              onFocus={() => setBodyFocused(true)}
              onBlur={() => setBodyFocused(false)}
              placeholder="Empieza a escribir…"
            />
          ) : (
            <div
              className="notes-body notes-body-view"
              role="button"
              tabIndex={0}
              aria-label="Editar contenido"
              onClick={enterBodyEdit}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); enterBodyEdit() } }}
            >
              {localBody.split('\n').map((line, i) => {
                const parsed = parseChecklistLine(line)
                if (parsed) {
                  return (
                    <div key={i} className="notes-checklist-line">
                      <button
                        type="button"
                        className={`notes-checklist-box${parsed.checked ? ' notes-checklist-box--on' : ''}`}
                        onClick={e => { e.stopPropagation(); toggleChecklistAt(i) }}
                        aria-label={parsed.checked ? 'Desmarcar' : 'Marcar'}
                      >
                        {parsed.checked && <IconCheckSmall />}
                      </button>
                      <span className={parsed.checked ? 'notes-checklist-text--done' : ''}>{parsed.text || ' '}</span>
                    </div>
                  )
                }
                return <div key={i} className="notes-body-line">{line || ' '}</div>
              })}
            </div>
          )}

          <div className="notes-footer">
            {wordCount} palabra{wordCount === 1 ? '' : 's'} · {localBody.length} carácter{localBody.length === 1 ? '' : 'es'}
          </div>
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
