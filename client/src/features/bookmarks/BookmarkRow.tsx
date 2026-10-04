import { useEffect, useState } from 'react'
import type { Bookmark } from '../../types'
import { formatRelativeTime } from '../../shared/relativeTime'
import { domainHue, faviconUrl, getDomain } from './bookmarkUtils'
import { copyText } from './copyText'
import BookmarkMenu from './BookmarkMenu'
import { IconCheck, IconCheckCircle, IconStar } from './BookmarkIcons'

interface Props {
  bookmark: Bookmark
  highlighted: boolean
  onToggleFavorite: () => void
  onToggleSeen: () => void
  onEdit: () => void
  onDelete: () => void
  onRefreshPreview: () => void
}

// Fila de la vista lista: sin imagen, una línea de título y otra de detalle
// (sitio · etiquetas · cuándo). Todo lo demás (favorito, visto, copiar,
// editar, eliminar…) va en el menú "⋯" de la derecha.
export default function BookmarkRow({
  bookmark: b, highlighted, onToggleFavorite, onToggleSeen, onEdit, onDelete, onRefreshPreview,
}: Props) {
  const [failedFavicon, setFailedFavicon] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])

  const domain = getDomain(b.url)
  const favicon = faviconUrl(b.url)
  const pending = b.preview_status === 'pending'
  const hue = domainHue(domain)

  async function handleCopy() {
    if (await copyText(b.url)) setCopied(true)
  }

  return (
    <div
      className={[
        'bookmark-row',
        b.seen ? 'bookmark-row--seen' : '',
        highlighted ? 'bookmark-row--highlight' : '',
      ].filter(Boolean).join(' ')}
      data-bookmark-id={b.id}
    >
      <a className="bookmark-row-main" href={b.url} target="_blank" rel="noopener noreferrer">
        <span className="bookmark-row-icon" style={{ background: `hsl(${hue} 70% 94%)`, color: `hsl(${hue} 60% 38%)` }}>
          {favicon && !failedFavicon ? (
            <img
              src={favicon}
              alt=""
              width={18}
              height={18}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setFailedFavicon(true)}
            />
          ) : (
            domain.charAt(0)
          )}
        </span>

        <span className="bookmark-row-text">
          <span className="bookmark-row-title">{b.title}</span>
          {pending ? (
            <span className="bookmark-row-sub bookmark-row-sub--loading" aria-label="Cargando vista previa" />
          ) : copied ? (
            <span className="bookmark-row-sub bookmark-row-sub--copied"><IconCheck size={12} /> Enlace copiado</span>
          ) : (
            <span className="bookmark-row-sub">
              {b.site_name || domain}
              {b.tags.length > 0 && <> · {b.tags.map(t => `#${t}`).join(' ')}</>}
              {b.preview_status === 'failed' && <> · sin vista previa</>}
              <span className="bookmark-row-when"> · {formatRelativeTime(b.created_at)}</span>
            </span>
          )}
        </span>
      </a>

      {b.favorite && <span className="bookmark-row-flag bookmark-row-flag--fav" title="Favorito"><IconStar size={14} filled /></span>}
      {b.seen && <span className="bookmark-row-flag bookmark-row-flag--seen" title="Visto"><IconCheckCircle size={14} filled /></span>}

      <BookmarkMenu
        bookmark={b}
        onCopy={handleCopy}
        onToggleFavorite={onToggleFavorite}
        onToggleSeen={onToggleSeen}
        onEdit={onEdit}
        onRefreshPreview={onRefreshPreview}
        onDelete={onDelete}
      />
    </div>
  )
}
