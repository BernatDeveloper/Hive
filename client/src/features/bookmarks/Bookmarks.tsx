import { useEffect, useMemo, useRef, useState } from 'react'
import './bookmarks.css'
import type { Bookmark } from '../../types'
import { readableTextColor } from '../../shared/color'
import {
  activityText, bookmarkActivity, cleanTag, collectTags, countFilters, domainHue, faviconUrl, filterBookmarks, findDuplicate, getDomain, normalizeUrl,
} from './bookmarkUtils'
import { FILTER_LABELS } from './bookmarkUtils'
import type { BookmarkFilter } from './bookmarkUtils'
import type { BookmarkPatch } from './useBookmarks'
import { copyText } from './copyText'
import BookmarkModal from './BookmarkModal'
import TagsModal from './TagsModal'
import BookmarkFilters from './BookmarkFilters'
import BookmarkRow from './BookmarkRow'
import {
  IconBookmarkPlaceholder, IconCheck, IconCheckCircle, IconCopy, IconEdit, IconExternal, IconGrid, IconLink,
  IconList, IconRefresh, IconSearch, IconStar, IconTrash, IconX,
} from './BookmarkIcons'

interface Props {
  bookmarks: Bookmark[]
  error: string | null
  onClearError: () => void
  onCreate: (url: string) => void
  onUpdate: (id: string, patch: BookmarkPatch) => void
  onRefreshPreview: (id: string) => void
  onDelete: (id: string) => void
  onRenameTag: (from: string, to: string) => void
  onDeleteTag: (tag: string) => void
  // Abrir un marcador desde fuera (búsqueda global): limpia filtros, se
  // desplaza hasta la tarjeta y la resalta; `onFocusHandled` limpia el pedido.
  focusBookmarkId?: string | null
  onFocusHandled?: () => void
}

type ViewMode = 'grid' | 'list'
const VIEW_KEY = 'bookmarksView'

// La vista elegida (tarjetas / lista) se recuerda en el dispositivo.
function readView(): ViewMode {
  try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid' } catch { return 'grid' }
}

const HIGHLIGHT_MS = 1800

interface CardProps {
  bookmark: Bookmark
  index: number
  highlighted: boolean
  activeTag: string | null
  onToggleFavorite: () => void
  onToggleSeen: () => void
  onEdit: () => void
  onDelete: () => void
  onRefreshPreview: () => void
  onTagClick: (tag: string) => void
}

function BookmarkCard({
  bookmark: b, index, highlighted, activeTag,
  onToggleFavorite, onToggleSeen, onEdit, onDelete, onRefreshPreview, onTagClick,
}: CardProps) {
  // Guardamos QUÉ imagen/favicon falló (no un booleano): si el servidor
  // refresca la vista previa y llega otra URL, se vuelve a intentar sola.
  const [failedImage, setFailedImage] = useState<string | null>(null)
  const [failedFavicon, setFailedFavicon] = useState(false)
  const [loadedImage, setLoadedImage] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])

  const domain = getDomain(b.url)
  const favicon = faviconUrl(b.url)
  const pending = b.preview_status === 'pending'
  const showImage = !!b.image && failedImage !== b.image
  const hue = domainHue(domain)
  const activity = bookmarkActivity(b)

  async function handleCopy() {
    if (await copyText(b.url)) setCopied(true)
  }

  return (
    <article
      className={[
        'bookmark-card',
        b.seen ? 'bookmark-card--seen' : '',
        pending ? 'bookmark-card--pending' : '',
        highlighted ? 'bookmark-card--highlight' : '',
      ].filter(Boolean).join(' ')}
      style={{ '--i': Math.min(index, 14) } as React.CSSProperties}
      data-bookmark-id={b.id}
    >
      <a className="bookmark-media" href={b.url} target="_blank" rel="noopener noreferrer" tabIndex={-1} aria-hidden="true">
        {showImage ? (
          <img
            src={b.image!}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className={loadedImage === b.image ? 'is-loaded' : ''}
            onLoad={() => setLoadedImage(b.image)}
            onError={() => setFailedImage(b.image)}
          />
        ) : (
          <span
            className="bookmark-media-fallback"
            style={{ background: `linear-gradient(135deg, hsl(${hue} 70% 62%), hsl(${(hue + 45) % 360} 70% 50%))` }}
          >
            {domain.charAt(0)}
          </span>
        )}
        {pending && <span className="bookmark-shimmer" />}
      </a>

      <div className="bookmark-body">
        <div className="bookmark-site">
          {favicon && !failedFavicon ? (
            <img
              className="bookmark-favicon"
              src={favicon}
              alt=""
              width={14}
              height={14}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setFailedFavicon(true)}
            />
          ) : (
            <span className="bookmark-favicon bookmark-favicon--fallback"><IconLink size={11} /></span>
          )}
          <span className="bookmark-site-name">{b.site_name || domain}</span>
        </div>

        <a className="bookmark-title" href={b.url} target="_blank" rel="noopener noreferrer">{b.title}</a>

        {pending && !b.description ? (
          <div className="bookmark-skeleton-lines" aria-label="Cargando vista previa">
            <span /><span />
          </div>
        ) : (
          b.description && <p className="bookmark-desc">{b.description}</p>
        )}

        {b.preview_status === 'failed' && (
          <button type="button" className="bookmark-retry" onClick={onRefreshPreview}>
            <IconRefresh size={12} /> Sin vista previa · Reintentar
          </button>
        )}

        {b.tags.length > 0 && (
          <div className="bookmark-tags">
            {b.tags.map(tag => (
              <button
                key={tag}
                type="button"
                className={`bookmark-tag${activeTag === tag ? ' bookmark-tag--active' : ''}`}
                onClick={() => onTagClick(tag)}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}

        <p className="bookmark-meta">
          {activity.name && (
            <span
              className="bookmark-meta-avatar"
              style={activity.color ? { background: activity.color, color: readableTextColor(activity.color) } : undefined}
              aria-hidden="true"
            >
              {activity.name.charAt(0)}
            </span>
          )}
          <span>{activityText(activity)}</span>
        </p>
      </div>

      <footer className="bookmark-footer">
        <div className="bookmark-actions">
          <button
            type="button"
            className={`bookmark-action bookmark-action--fav${b.favorite ? ' is-on' : ''}`}
            onClick={onToggleFavorite}
            aria-pressed={b.favorite}
            aria-label={b.favorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
            title={b.favorite ? 'Quitar de favoritos' : 'Favorito'}
          >
            <IconStar filled={b.favorite} />
          </button>
          <button
            type="button"
            className={`bookmark-action bookmark-action--seen${b.seen ? ' is-on' : ''}`}
            onClick={onToggleSeen}
            aria-pressed={b.seen}
            aria-label={b.seen ? 'Marcar como pendiente' : 'Marcar como visto'}
            title={b.seen ? 'Visto — marcar como pendiente' : 'Marcar como visto'}
          >
            <IconCheckCircle filled={b.seen} />
          </button>
        </div>
        <div className="bookmark-actions">
          <a className="bookmark-action" href={b.url} target="_blank" rel="noopener noreferrer" aria-label="Abrir enlace" title="Abrir enlace">
            <IconExternal />
          </a>
          <button
            type="button"
            className={`bookmark-action${copied ? ' is-copied' : ''}`}
            onClick={handleCopy}
            aria-label="Copiar enlace"
            title={copied ? 'Copiado' : 'Copiar enlace'}
          >
            {copied ? <IconCheck /> : <IconCopy />}
          </button>
          <button type="button" className="bookmark-action" onClick={onEdit} aria-label="Editar marcador" title="Editar">
            <IconEdit />
          </button>
          <button type="button" className="bookmark-action bookmark-action--danger" onClick={onDelete} aria-label="Eliminar marcador" title="Eliminar">
            <IconTrash />
          </button>
        </div>
      </footer>
    </article>
  )
}

export default function Bookmarks({
  bookmarks, error, onClearError, onCreate, onUpdate, onRefreshPreview, onDelete, onRenameTag, onDeleteTag, focusBookmarkId, onFocusHandled,
}: Props) {
  const [urlDraft, setUrlDraft] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<BookmarkFilter>('all')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [view, setView] = useState<ViewMode>(readView)
  const [managingTags, setManagingTags] = useState(false)
  const [lastRename, setLastRename] = useState<{ from: string; to: string } | null>(null)
  // En escritorio scrollea la rejilla; en móvil, todo el contenedor (ver bookmarks.css).
  const rootRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const counts = useMemo(() => countFilters(bookmarks), [bookmarks])
  const tags = useMemo(() => collectTags(bookmarks), [bookmarks])
  const visible = useMemo(
    () => filterBookmarks(bookmarks, { query, filter, tag: activeTag }),
    [bookmarks, query, filter, activeTag],
  )
  const editing = bookmarks.find(b => b.id === editingId) ?? null
  const hasActiveFilters = query.trim() !== '' || filter !== 'all' || activeTag !== null

  function changeView(next: ViewMode) {
    setView(next)
    try { localStorage.setItem(VIEW_KEY, next) } catch { /* localStorage no disponible */ }
  }

  // Se recuerda el último renombrado: si afecta a la etiqueta que está
  // filtrando, el filtro la sigue al nombre nuevo cuando llega el cambio del
  // servidor (ver más abajo) en vez de soltarse al desaparecer el nombre viejo.
  function renameTag(from: string, to: string) {
    setLastRename({ from, to: cleanTag(to) })
    onRenameTag(from, to)
  }

  function resetFilters() {
    setQuery('')
    setFilter('all')
    setActiveTag(null)
  }

  // Si la etiqueta activa deja de existir (se quitó de la última tarjeta que
  // la tenía), el filtro quedaría vacío sin forma de verlo: se suelta durante
  // el render (mismo patrón que Lists/Notes) en vez de en un efecto.
  if (activeTag && !tags.some(t => t.tag === activeTag)) {
    const followed = lastRename?.from === activeTag && tags.some(t => t.tag === lastRename.to)
    setActiveTag(followed ? lastRename.to : null)
  }

  // Abrir desde la búsqueda global (ver Props.focusBookmarkId).
  const [appliedFocusId, setAppliedFocusId] = useState<string | null>(null)
  if (focusBookmarkId && focusBookmarkId !== appliedFocusId) {
    setAppliedFocusId(focusBookmarkId)
    resetFilters()
    setHighlightId(focusBookmarkId)
  }
  useEffect(() => {
    if (focusBookmarkId) onFocusHandled?.()
  }, [focusBookmarkId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Resalta y desplaza hasta la tarjeta señalada (búsqueda global o "ya
  // guardado"); el resalte se apaga solo.
  useEffect(() => {
    if (!highlightId) return
    scrollRef.current
      ?.querySelector(`[data-bookmark-id="${CSS.escape(highlightId)}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const t = setTimeout(() => setHighlightId(null), HIGHLIGHT_MS)
    return () => clearTimeout(t)
  }, [highlightId])

  function submit(raw: string) {
    const url = normalizeUrl(raw)
    if (!url) {
      setAddError('Eso no parece un enlace válido')
      return
    }
    const duplicate = findDuplicate(bookmarks, url)
    if (duplicate) {
      setAddError('Ya tienes guardado este enlace')
      resetFilters()
      setHighlightId(duplicate.id)
      return
    }
    onCreate(url)
    setUrlDraft('')
    setAddError(null)
    onClearError()
    // La tarjeta nueva entra arriba del todo.
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    rootRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleDelete(b: Bookmark) {
    if (editingId === b.id) setEditingId(null)
    onDelete(b.id)
  }

  const message = addError ?? error

  return (
    <div className="bookmarks-container" ref={rootRef}>
      <div className="bookmarks-toolbar">
        <form
          className="bookmarks-add"
          onSubmit={e => { e.preventDefault(); submit(urlDraft) }}
        >
          <div className="bookmarks-add-field">
            <IconLink size={16} />
            <input
              value={urlDraft}
              onChange={e => { setUrlDraft(e.target.value); setAddError(null); onClearError() }}
              // Pegar un enlace válido lo guarda al instante, sin pulsar nada más.
              onPaste={e => {
                const text = e.clipboardData.getData('text')
                if (normalizeUrl(text)) { e.preventDefault(); submit(text) }
              }}
              placeholder="Pega un enlace…"
              aria-label="Enlace a guardar"
              aria-invalid={message ? true : undefined}
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
          <button className="btn-primary" type="submit" disabled={!urlDraft.trim()}>Guardar</button>
        </form>
        {message && <p className="bookmarks-add-error" role="alert">{message}</p>}

        {bookmarks.length > 0 && (
          <>
            <div className="bookmarks-controls">
              <div className="bookmarks-search">
                <IconSearch size={15} />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Buscar…"
                  aria-label="Buscar marcadores"
                />
                {query && (
                  <button type="button" className="bookmarks-search-clear" onClick={() => setQuery('')} aria-label="Limpiar búsqueda">
                    <IconX size={12} />
                  </button>
                )}
              </div>

              <BookmarkFilters
                filter={filter}
                counts={counts}
                tags={tags}
                activeTag={activeTag}
                onFilter={setFilter}
                onTag={setActiveTag}
                onManageTags={() => setManagingTags(true)}
              />

              <div className="bookmarks-view-toggle" role="group" aria-label="Vista">
                <button
                  type="button"
                  className={view === 'grid' ? 'is-active' : ''}
                  aria-pressed={view === 'grid'}
                  aria-label="Vista de tarjetas"
                  title="Tarjetas"
                  onClick={() => changeView('grid')}
                >
                  <IconGrid />
                </button>
                <button
                  type="button"
                  className={view === 'list' ? 'is-active' : ''}
                  aria-pressed={view === 'list'}
                  aria-label="Vista de lista"
                  title="Lista"
                  onClick={() => changeView('list')}
                >
                  <IconList />
                </button>
              </div>
            </div>

            {(filter !== 'all' || activeTag) && (
              <div className="bookmarks-active" aria-label="Filtros activos">
                {filter !== 'all' && (
                  <button type="button" className="bookmarks-chip is-active" onClick={() => setFilter('all')} aria-label={`Quitar filtro ${FILTER_LABELS[filter]}`}>
                    {FILTER_LABELS[filter]} <IconX size={11} />
                  </button>
                )}
                {activeTag && (
                  <button type="button" className="bookmarks-chip is-active" onClick={() => setActiveTag(null)} aria-label={`Quitar etiqueta ${activeTag}`}>
                    #{activeTag} <IconX size={11} />
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div className={`bookmarks-scroll${view === 'list' ? ' bookmarks-scroll--list' : ''}`} ref={scrollRef}>
        {bookmarks.length === 0 ? (
          <div className="bookmarks-empty">
            <span className="bookmarks-empty-icon"><IconBookmarkPlaceholder /></span>
            <h3>Guarda tu primer enlace</h3>
            <p>Tutoriales, productos, artículos, webs… Pega una dirección arriba y la tarjeta se rellena sola con su título e imagen.</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="bookmarks-empty">
            <span className="bookmarks-empty-icon"><IconSearch size={44} /></span>
            <h3>Nada coincide</h3>
            <p>Prueba con otra búsqueda o quita algún filtro.</p>
            {hasActiveFilters && (
              <button type="button" className="btn-secondary" onClick={resetFilters}>Limpiar filtros</button>
            )}
          </div>
        ) : (
          <>
            <p className="bookmarks-count">
              {hasActiveFilters ? `${visible.length} de ${bookmarks.length}` : bookmarks.length}{' '}
              {bookmarks.length === 1 ? 'marcador' : 'marcadores'}
            </p>
            {view === 'grid' ? (
              <div className="bookmarks-grid">
                {visible.map((b, i) => (
                  <BookmarkCard
                    key={b.id}
                    bookmark={b}
                    index={i}
                    highlighted={highlightId === b.id}
                    activeTag={activeTag}
                    onToggleFavorite={() => onUpdate(b.id, { favorite: !b.favorite })}
                    onToggleSeen={() => onUpdate(b.id, { seen: !b.seen })}
                    onEdit={() => setEditingId(b.id)}
                    onDelete={() => handleDelete(b)}
                    onRefreshPreview={() => onRefreshPreview(b.id)}
                    onTagClick={tag => setActiveTag(activeTag === tag ? null : tag)}
                  />
                ))}
              </div>
            ) : (
              <div className="bookmarks-list">
                {visible.map(b => (
                  <BookmarkRow
                    key={b.id}
                    bookmark={b}
                    highlighted={highlightId === b.id}
                    onToggleFavorite={() => onUpdate(b.id, { favorite: !b.favorite })}
                    onToggleSeen={() => onUpdate(b.id, { seen: !b.seen })}
                    onEdit={() => setEditingId(b.id)}
                    onDelete={() => handleDelete(b)}
                    onRefreshPreview={() => onRefreshPreview(b.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {managingTags && (
        <TagsModal
          tags={tags}
          onRename={renameTag}
          onDelete={onDeleteTag}
          onClose={() => setManagingTags(false)}
        />
      )}

      {editing && (
        <BookmarkModal
          key={editing.id}
          bookmark={editing}
          knownTags={tags.map(t => t.tag)}
          onSave={patch => onUpdate(editing.id, patch)}
          onRefreshPreview={() => onRefreshPreview(editing.id)}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  )
}
