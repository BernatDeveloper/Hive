import { useEffect } from 'react'
import './bookmarks.css'
import '../../shared/modal.css'
import type { Bookmark } from '../../types'
import { useSwipeToDismiss } from '../../shared/useSwipeToDismiss'
import { getDomain } from './bookmarkUtils'
import type { SharedLink } from './shareTarget'

interface Props {
  link: SharedLink
  // Marcador que ya guarda este mismo enlace (si lo hay): no se duplica.
  duplicate: Bookmark | undefined
  onSave: () => void
  onShowExisting: () => void
  onCancel: () => void
}

// Confirmación al llegar desde "Compartir" del sistema (Web Share Target). Se
// pide confirmar en vez de guardar a ciegas: así un enlace con parámetros
// manipulados (`/?url=…`) no añade marcadores sin que la persona lo vea, y se
// puede ver qué se va a guardar antes de que el servidor lo descargue.
export default function ShareLinkDialog({ link, duplicate, onSave, onShowExisting, onCancel }: Props) {
  const swipe = useSwipeToDismiss(onCancel)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal share-dialog"
        style={swipe.style}
        role="dialog"
        aria-label="Guardar enlace compartido"
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-drag-handle" {...swipe.handleProps} />
        <button type="button" className="modal-close" onClick={onCancel} aria-label="Cerrar">×</button>
        <h3>{duplicate ? 'Ya lo tienes guardado' : 'Guardar en Marcadores'}</h3>

        <div className="share-dialog-link">
          <span className="share-dialog-domain">{getDomain(link.url)}</span>
          {link.title && <span className="share-dialog-title">{link.title}</span>}
          <span className="share-dialog-url">{link.url}</span>
        </div>

        {duplicate && <p className="share-dialog-note">Está guardado como «{duplicate.title}».</p>}

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>{duplicate ? 'Cerrar' : 'Cancelar'}</button>
          {duplicate ? (
            <button type="button" className="btn-primary" onClick={onShowExisting} autoFocus>Ver marcador</button>
          ) : (
            <button type="button" className="btn-primary" onClick={onSave} autoFocus>Guardar</button>
          )}
        </div>
      </div>
    </div>
  )
}
