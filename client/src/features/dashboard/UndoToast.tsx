interface Props {
  label: string
  onUndo: () => void
  onDismiss: () => void
}

export default function UndoToast({ label, onUndo, onDismiss }: Props) {
  return (
    <div className="undo-toast" role="status">
      <span className="undo-toast-label">{label} eliminado</span>
      <button className="undo-toast-action" onClick={onUndo}>Deshacer</button>
      <button className="undo-toast-close" onClick={onDismiss} aria-label="Descartar">×</button>
    </div>
  )
}
