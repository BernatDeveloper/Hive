import { useEffect, useRef, useState } from 'react'
import '../../shared/modal.css'
import './globalSearch.css'
import type { Bookmark, Event, List, ListItem, Note } from '../../types'
import { searchAll } from './search'
import type { SearchResult } from './search'

interface Props {
  events: Event[]
  notes: Note[]
  lists: List[]
  listItems: ListItem[]
  bookmarks: Bookmark[]
  onOpenEvent: (event: Event) => void
  onOpenNote: (noteId: string) => void
  onOpenList: (listId: string) => void
  onOpenBookmark: (bookmarkId: string) => void
  onClose: () => void
}

const IconSearch = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
)

function ResultGroup({ label, results, onSelect }: { label: string; results: SearchResult[]; onSelect: (r: SearchResult) => void }) {
  if (results.length === 0) return null
  return (
    <div className="global-search-group">
      <p className="global-search-group-label">{label}</p>
      {results.map(r => (
        <button key={r.id} type="button" className="global-search-item" onClick={() => onSelect(r)}>
          <span className="global-search-item-title">{r.title}</span>
          {r.subtitle && <span className="global-search-item-subtitle">{r.subtitle}</span>}
        </button>
      ))}
    </div>
  )
}

// Búsqueda global sobre lo que ya está cargado en el cliente (eventos, notas,
// ítems de lista, marcadores) — sin red. Seleccionar un resultado navega al módulo que le
// corresponde y lo abre (ver Dashboard: onOpenEvent/onOpenNote/onOpenList).
export default function GlobalSearch({ events, notes, lists, listItems, bookmarks, onOpenEvent, onOpenNote, onOpenList, onOpenBookmark, onClose }: Props) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const results = searchAll(query, { events, notes, lists, listItems, bookmarks })
  const total = results.events.length + results.notes.length + results.listItems.length + results.bookmarks.length

  function selectEvent(r: SearchResult) { if (r.eventRef) { onOpenEvent(r.eventRef); onClose() } }
  function selectNote(r: SearchResult) { if (r.noteId) { onOpenNote(r.noteId); onClose() } }
  function selectListItem(r: SearchResult) { if (r.listId) { onOpenList(r.listId); onClose() } }
  function selectBookmark(r: SearchResult) { if (r.bookmarkId) { onOpenBookmark(r.bookmarkId); onClose() } }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="global-search" onClick={e => e.stopPropagation()}>
        <div className="global-search-input-wrap">
          <IconSearch />
          <input
            ref={inputRef}
            className="global-search-input"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar eventos, notas, listas, marcadores…"
            aria-label="Búsqueda global"
          />
          <button type="button" className="btn-ghost btn-icon" onClick={onClose} aria-label="Cerrar búsqueda">✕</button>
        </div>

        <div className="global-search-results">
          {query.trim() === '' && (
            <p className="global-search-empty">Escribe para buscar en eventos, notas, listas y marcadores</p>
          )}
          {query.trim() !== '' && total === 0 && (
            <p className="global-search-empty">Sin resultados para «{query.trim()}»</p>
          )}

          <ResultGroup label="Eventos" results={results.events} onSelect={selectEvent} />
          <ResultGroup label="Notas" results={results.notes} onSelect={selectNote} />
          <ResultGroup label="Listas" results={results.listItems} onSelect={selectListItem} />
          <ResultGroup label="Marcadores" results={results.bookmarks} onSelect={selectBookmark} />
        </div>
      </div>
    </div>
  )
}
