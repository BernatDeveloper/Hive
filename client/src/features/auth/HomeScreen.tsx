import HiveLogo from '../../shared/HiveLogo'

interface Props {
  onCreate: () => void
  onJoin: () => void
  notice?: string | null
  // 'info' = aviso orientativo (azul), no un error (rojo, por defecto).
  noticeTone?: 'error' | 'info'
}

export default function HomeScreen({ onCreate, onJoin, notice, noticeTone = 'error' }: Props) {
  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo">
          <HiveLogo size={38} />
        </div>

        <h1 className="auth-title-hero">Hive</h1>
        <p className="auth-subtitle-hero">
          Planifica y organiza con las personas<br />que más importan
        </p>

        {notice && <p className={noticeTone === 'info' ? 'auth-info' : 'auth-error'} style={{ marginBottom: '1.5rem' }}>{notice}</p>}

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

        <p className="auth-model-notice">
          Sin cuentas: compartes el nombre y la contraseña de la sala con tu
          grupo. Por eso mismo, guárdalos bien — no hay recuperación. Las
          salas sin actividad durante 2 años y los eventos de hace más de 3
          años se eliminan automáticamente.
        </p>
        <p className="auth-legal-link">
          <a href="/privacidad" target="_blank" rel="noopener noreferrer">Política de privacidad</a>
        </p>
      </div>
    </div>
  )
}
