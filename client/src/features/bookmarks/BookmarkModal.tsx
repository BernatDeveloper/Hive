import { useEffect, useState } from 'react'
import '../../shared/modal.css'
import type { Bookmark } from '../../types'
import { useSwipeToDismiss } from '../../shared/useSwipeToDismiss'
import { cleanTag, getDomain, MAX_TAGS, MAX_TAG_LENGTH } from './bookmarkUtils'
import type { BookmarkPatch } from './useBookmarks'
import { IconExternal, IconRefresh, IconX } from './BookmarkIcons'

interface Props {
  bookmark: Bookmark
  // Todas las etiquetas ya usadas en la sala: se ofrecen como sugerencias.
  knownTags: string[]
  onSave: (patch: BookmarkPatch) => void
  onRefreshPreview: () => void
  onClose: () => void
}

const sameTags = (a: string[], b: string[]) => a.length === b.length && a.every((t, i) => t === b[i])

// Edición de un marcador: título, descripción y etiquetas. La URL no se edita (para
// cambiarla se guarda otra y se borra esta). Solo manda lo que cambió respecto
// a lo que había al abrir — si mientras tanto terminó de cargar la vista
// previa, no se la pisa con el título provisional de entonces.
export default function BookmarkModal({ bookmark, knownTags, onSave, onRefreshPreview, onClose }: Props) {
  const [initial] = useState(() => ({ title: bookmark.title, description: bookmark.description, tags: bookmark.tags }))
  const [title, setTitle] = useState(initial.title)
  const [description, setDescription] = useState(initial.description)
  const [tags, setTags] = useState<string[]>(initial.tags)
  const [tagDraft, setTagDraft] = useState('')
  const swipe = useSwipeToDismiss(onClose)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // Añade una o varias etiquetas de golpe (pegar «react, curso» crea dos).
  function addTags(raws: string[]) {
    const next = [...tags]
    for (const raw of raws) {
      const tag = cleanTag(raw)
      if (tag && !next.includes(tag) && next.length < MAX_TAGS) next.push(tag)
    }
    setTags(next)
    setTagDraft('')
  }

  function handleSave() {
    // Si hay una etiqueta a medio escribir, cuenta como añadida.
    const pending = cleanTag(tagDraft)
    const finalTags = pending && !tags.includes(pending) && tags.length < MAX_TAGS ? [...tags, pending] : tags
    const patch: BookmarkPatch = {}
    if (title.trim() !== initial.title) patch.title = title.trim()
    if (description.trim() !== initial.description) patch.description = description.trim()
    if (!sameTags(finalTags, initial.tags)) patch.tags = finalTags
    if (Object.keys(patch).length > 0) onSave(patch)
    onClose()
  }

  const suggestions = knownTags
    .filter(t => !tags.includes(t) && (!tagDraft.trim() || t.includes(cleanTag(tagDraft))))
    .slice(0, 8)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal bookmark-modal"
        style={swipe.style}
        role="dialog"
        aria-label="Editar marcador"
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-drag-handle" {...swipe.handleProps} />
        <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">×</button>
        <h3>Editar marcador</h3>

        <a className="bookmark-modal-url" href={bookmark.url} target="_blank" rel="noopener noreferrer">
          <span>{getDomain(bookmark.url)}</span>
          <IconExternal size={13} />
        </a>

        <label htmlFor="bookmark-title">Título</label>
        <input
          id="bookmark-title"
          value={title}
          maxLength={200}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSave() } }}
        />

        <label htmlFor="bookmark-note">Descripción</label>
        <textarea
          id="bookmark-note"
          value={description}
          maxLength={2000}
          placeholder="De qué va, por qué lo guardaste…"
          onChange={e => setDescription(e.target.value)}
        />

        <label htmlFor="bookmark-tag-input">Etiquetas</label>
        <div className="bookmark-tag-editor">
          {tags.map(tag => (
            <span key={tag} className="bookmark-tag bookmark-tag--editable">
              #{tag}
              <button type="button" onClick={() => setTags(tags.filter(t => t !== tag))} aria-label={`Quitar etiqueta ${tag}`}>
                <IconX />
              </button>
            </span>
          ))}
          {tags.length < MAX_TAGS && (
            <input
              id="bookmark-tag-input"
              className="bookmark-tag-input"
              value={tagDraft}
              maxLength={MAX_TAG_LENGTH}
              placeholder={tags.length === 0 ? 'Añadir etiqueta…' : 'Otra…'}
              onChange={e => {
                // Una coma cierra la etiqueta, como en cualquier campo de tags;
                // lo que queda tras la última coma sigue siendo el borrador.
                const parts = e.target.value.split(',')
                if (parts.length === 1) { setTagDraft(e.target.value); return }
                const draft = parts.pop() ?? ''
                addTags(parts)
                setTagDraft(draft)
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); if (tagDraft.trim()) addTags([tagDraft]); else handleSave() }
                else if (e.key === 'Backspace' && !tagDraft && tags.length > 0) setTags(tags.slice(0, -1))
              }}
              onBlur={() => { if (tagDraft.trim()) addTags([tagDraft]) }}
            />
          )}
        </div>
        {suggestions.length > 0 && (
          <div className="bookmark-tag-suggestions" aria-label="Etiquetas usadas">
            {suggestions.map(t => (
              <button
                key={t}
                type="button"
                className="bookmark-tag bookmark-tag--suggestion"
                // mouseDown (no click): el input pierde el foco antes y su
                // onBlur ya habría añadido la etiqueta a medio escribir.
                onMouseDown={e => { e.preventDefault(); addTags([t]) }}
              >
                + {t}
              </button>
            ))}
          </div>
        )}

        <div className="modal-actions bookmark-modal-actions">
          <button
            type="button"
            className="btn-ghost bookmark-modal-refresh"
            onClick={() => { onRefreshPreview(); onClose() }}
            disabled={bookmark.preview_status === 'pending'}
          >
            <IconRefresh size={14} /> Recargar vista previa
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn-primary" onClick={handleSave}>Guardar</button>
        </div>
      </div>
    </div>
  )
}
