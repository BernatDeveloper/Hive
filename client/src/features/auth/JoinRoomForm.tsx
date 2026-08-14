import { useState } from 'react'

const IconArrowLeft = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="19" y1="12" x2="5" y2="12"/>
    <polyline points="12 19 5 12 12 5"/>
  </svg>
)

interface Props {
  onBack: () => void
  onSubmit: (name: string, password: string) => void
  error: string
  loading: boolean
}

export default function JoinRoomForm({ onBack, onSubmit, error, loading }: Props) {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !password) return
    onSubmit(name.trim(), password)
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <button className="btn-ghost btn-icon btn-back" onClick={onBack} aria-label="Volver"><IconArrowLeft /></button>
        <div className="auth-form-header">
          <h1>Unirse a sala</h1>
          <p>Introduce el nombre y contraseña de la sala</p>
        </div>
        <form onSubmit={handleSubmit} className="auth-form">
          <label className="auth-label">
            Nombre de sala
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Nombre de la sala"
              autoFocus
            />
          </label>
          <label className="auth-label">
            Contraseña
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Contraseña de la sala"
            />
          </label>
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Conectando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
