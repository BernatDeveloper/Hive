import { createPortal } from 'react-dom'
import '../../shared/popover.css'
import { usePopover } from '../../shared/usePopover'
import type { Bookmark } from '../../types'
import {
  IconCheckCircle, IconCopy, IconEdit, IconExternal, IconMore, IconRefresh, IconStar, IconTrash,
} from './BookmarkIcons'

interface Props {
  bookmark: Bookmark
  onCopy: () => void
  onToggleFavorite: () => void
  onToggleSeen: () => void
  onEdit: () => void
  onRefreshPreview: () => void
  onDelete: () => void
}

// Menú "⋯" de una fila de la vista lista: en una fila no caben los seis
// botones de la tarjeta, así que van aquí. Usa el mismo popover portado a
// <body> que los selectores (no se recorta por el scroll de la lista y se abre
// hacia arriba si no cabe debajo).
export default function BookmarkMenu({ bookmark: b, onCopy, onToggleFavorite, onToggleSeen, onEdit, onRefreshPreview, onDelete }: Props) {
  const { open, pos, wrapRef, listRef, toggle, closePopover } = usePopover(undefined, 210)

  // Cada acción cierra el menú y luego actúa.
  const run = (action: () => void) => () => { closePopover(); action() }

  return (
    <div className="bookmark-menu" ref={wrapRef}>
      <button
        type="button"
        className={`bookmark-action bookmark-menu-trigger${open ? ' is-open' : ''}`}
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Acciones de ${b.title}`}
      >
        <IconMore />
      </button>

      {open && pos && createPortal(
        <div
          ref={listRef}
          className="popover-list bookmark-menu-list"
          role="menu"
          style={{
            position: 'fixed',
            left: pos.left,
            width: pos.width,
            maxHeight: pos.maxHeight,
            ...(pos.top !== undefined ? { top: pos.top } : { bottom: pos.bottom }),
            ...pos.vars,
          } as React.CSSProperties}
        >
          <button type="button" role="menuitem" className="bookmark-menu-item" onClick={run(() => window.open(b.url, '_blank', 'noopener,noreferrer'))}>
            <IconExternal size={15} /> Abrir enlace
          </button>
          <button type="button" role="menuitem" className="bookmark-menu-item" onClick={run(onCopy)}>
            <IconCopy size={15} /> Copiar enlace
          </button>
          <button type="button" role="menuitem" className={`bookmark-menu-item${b.favorite ? ' is-on-fav' : ''}`} onClick={run(onToggleFavorite)}>
            <IconStar size={15} filled={b.favorite} /> {b.favorite ? 'Quitar de favoritos' : 'Marcar favorito'}
          </button>
          <button type="button" role="menuitem" className={`bookmark-menu-item${b.seen ? ' is-on-seen' : ''}`} onClick={run(onToggleSeen)}>
            <IconCheckCircle size={15} filled={b.seen} /> {b.seen ? 'Marcar como pendiente' : 'Marcar como visto'}
          </button>
          <button type="button" role="menuitem" className="bookmark-menu-item" onClick={run(onEdit)}>
            <IconEdit size={15} /> Editar
          </button>
          {b.preview_status === 'failed' && (
            <button type="button" role="menuitem" className="bookmark-menu-item" onClick={run(onRefreshPreview)}>
              <IconRefresh size={15} /> Reintentar vista previa
            </button>
          )}
          <div className="bookmark-menu-sep" role="separator" />
          <button type="button" role="menuitem" className="bookmark-menu-item bookmark-menu-item--danger" onClick={run(onDelete)}>
            <IconTrash size={15} /> Eliminar
          </button>
        </div>,
        document.body
      )}
    </div>
  )
}
