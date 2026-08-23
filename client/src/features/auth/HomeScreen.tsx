interface Props {
  onCreate: () => void
  onJoin: () => void
  notice?: string | null
}

export default function HomeScreen({ onCreate, onJoin, notice }: Props) {
  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
        </div>

        <h1 className="auth-title-hero">Calendario<br />Compartido</h1>
        <p className="auth-subtitle-hero">
          Planifica y organiza con las personas<br />que más importan
        </p>

        {notice && <p className="auth-error" style={{ marginBottom: '1.5rem' }}>{notice}</p>}

        <div className="auth-badges">
          <span className="auth-badge">Tiempo real</span>
          <span className="auth-badge">Privado</span>
          <span className="auth-badge">Personalizable</span>
        </div>

        <div className="auth-buttons">
          <button className="btn-primary" onClick={onCreate}>
            Crear sala nueva
          </button>
          <button className="btn-secondary" onClick={onJoin}>
            Unirse a sala existente
          </button>
        </div>
      </div>
    </div>
  )
}
