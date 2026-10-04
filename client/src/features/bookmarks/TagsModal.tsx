import { useEffect, useState } from 'react'
import '../../shared/modal.css'
import { useSwipeToDismiss } from '../../shared/useSwipeToDismiss'
import { cleanTag } from './bookmarkUtils'
import { IconCheck, IconEdit, IconTrash, IconX } from './BookmarkIcons'

interface Props {
  tags: { tag: string; count: number }[]
  onRename: (from: string, to: string) => void
  onDelete: (tag: string) => void
  onClose: () => void
}

// Gestión de etiquetas de toda la sala: renombrar (o unir con otra existente)
// y borrar. Las etiquetas solo se podían editar marcador a marcador, así que un
// error de escritura ("react" / "reactjs") dejaba duplicados sin arreglo. Los
// cambios se aplican a todos los marcadores a la vez en el servidor; la lista
// se redibuja sola con los `bookmarks` actualizados que llegan por socket.
export default function TagsModal({ tags, onRename, onDelete, onClose }: Props) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const swipe = useSwipeToDismiss(onClose)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  function startEdit(tag: string) {
    setEditing(tag)
    setDraft(tag)
  }

  function commit() {
    if (editing === null) return
    const next = cleanTag(draft)
    if (next && next !== editing) onRename(editing, next)
    setEditing(null)
  }

  const draftClean = cleanTag(draft)
  // Renombrar a una que ya existe no es un error: se unen.
  const mergesInto = editing !== null && draftClean && draftClean !== editing && tags.some(t => t.tag === draftClean)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal bookmark-modal"
        style={swipe.style}
        role="dialog"
        aria-label="Gestionar etiquetas"
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-drag-handle" {...swipe.handleProps} />
        <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">×</button>
        <h3>Gestionar etiquetas</h3>
        <p className="tags-modal-hint">Los cambios se aplican a todos los marcadores de la sala.</p>

        {tags.length === 0 ? (
          <p className="tags-modal-empty">Aún no hay etiquetas. Añádelas editando un marcador.</p>
        ) : (
          <ul className="tags-modal-list">
            {tags.map(({ tag, count }) => (
              <li key={tag} className="tags-modal-row">
                {editing === tag ? (
                  <>
                    <div className="tags-modal-edit">
                      <input
                        value={draft}
                        autoFocus
                        maxLength={30}
                        aria-label={`Nuevo nombre para ${tag}`}
                        onChange={e => setDraft(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); commit() }
                          else if (e.key === 'Escape') { e.stopPropagation(); setEditing(null) }
                        }}
                      />
                      {mergesInto && <p className="tags-modal-merge">Ya existe #{draftClean}: se unirán.</p>}
                    </div>
                    <button type="button" className="bookmark-action is-confirm" onClick={commit} aria-label="Guardar nombre" title="Guardar">
                      <IconCheck />
                    </button>
                    <button type="button" className="bookmark-action" onClick={() => setEditing(null)} aria-label="Cancelar" title="Cancelar">
                      <IconX size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="bookmark-tag tags-modal-tag">#{tag}</span>
                    <span className="tags-modal-count">{count} {count === 1 ? 'marcador' : 'marcadores'}</span>
                    <button type="button" className="bookmark-action" onClick={() => startEdit(tag)} aria-label={`Renombrar ${tag}`} title="Renombrar">
                      <IconEdit />
                    </button>
                    <button type="button" className="bookmark-action bookmark-action--danger" onClick={() => onDelete(tag)} aria-label={`Borrar etiqueta ${tag}`} title="Borrar de todos">
                      <IconTrash />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="modal-actions">
          <button type="button" className="btn-primary" onClick={onClose}>Listo</button>
        </div>
      </div>
    </div>
  )
}
