import { createPortal } from 'react-dom'
import '../../shared/popover.css'
import { usePopover } from '../../shared/usePopover'
import { FILTER_LABELS } from './bookmarkUtils'
import type { BookmarkFilter } from './bookmarkUtils'
import { IconCheck, IconFilter } from './BookmarkIcons'

interface Props {
  filter: BookmarkFilter
  counts: Record<BookmarkFilter, number>
  tags: { tag: string; count: number }[]
  activeTag: string | null
  onFilter: (f: BookmarkFilter) => void
  onTag: (tag: string | null) => void
  onManageTags: () => void
}

// Botón "Filtros" + panel con el estado (Todos / Favoritos / Pendientes) y las
// etiquetas. Antes iban siempre a la vista en tres filas de chips y, en
// móvil, se comían casi media pantalla; ahora ocupan un botón, con un
// contador de cuántos filtros hay activos.
export default function BookmarkFilters({ filter, counts, tags, activeTag, onFilter, onTag, onManageTags }: Props) {
  const { open, pos, wrapRef, listRef, toggle, closePopover } = usePopover(undefined, 300)
  const activeCount = (filter !== 'all' ? 1 : 0) + (activeTag ? 1 : 0)

  return (
    <div className="bookmarks-filters-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`bookmarks-filters-btn${activeCount > 0 ? ' has-active' : ''}${open ? ' is-open' : ''}`}
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={activeCount > 0 ? `Filtros (${activeCount} activos)` : 'Filtros'}
      >
        <IconFilter />
        <span className="bookmarks-filters-label">Filtros</span>
        {activeCount > 0 && <span className="bookmarks-filters-badge">{activeCount}</span>}
      </button>

      {open && pos && createPortal(
        <div
          ref={listRef}
          className="popover-list bookmarks-filters-panel"
          role="dialog"
          aria-label="Filtros"
          style={{
            position: 'fixed',
            left: pos.left,
            width: pos.width,
            maxHeight: pos.maxHeight,
            ...(pos.top !== undefined ? { top: pos.top } : { bottom: pos.bottom }),
            ...pos.vars,
          } as React.CSSProperties}
        >
          <p className="bookmarks-filters-title">Mostrar</p>
          {(Object.keys(FILTER_LABELS) as BookmarkFilter[]).map(f => (
            <button
              key={f}
              type="button"
              className={`bookmarks-filters-option${filter === f ? ' is-on' : ''}`}
              aria-pressed={filter === f}
              onClick={() => onFilter(f)}
            >
              <span className="bookmarks-filters-option-label">{FILTER_LABELS[f]}</span>
              <span className="bookmarks-chip-count">{counts[f]}</span>
              {filter === f && <IconCheck size={15} />}
            </button>
          ))}

          {tags.length > 0 && (
            <>
              <div className="bookmarks-filters-title-row">
                <p className="bookmarks-filters-title">Etiquetas</p>
                <button
                  type="button"
                  className="bookmarks-filters-manage"
                  onClick={() => { closePopover(); onManageTags() }}
                >
                  Gestionar
                </button>
              </div>
              <div className="bookmarks-filters-tags">
                {tags.map(({ tag, count }) => (
                  <button
                    key={tag}
                    type="button"
                    className={`bookmarks-chip bookmarks-chip--tag${activeTag === tag ? ' is-active' : ''}`}
                    aria-pressed={activeTag === tag}
                    onClick={() => onTag(activeTag === tag ? null : tag)}
                  >
                    #{tag}
                    <span className="bookmarks-chip-count">{count}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
