// Copia al portapapeles. `navigator.clipboard` no existe fuera de un contexto
// seguro (p. ej. probando desde el móvil por http://<ip-local>), así que cae a
// un textarea temporal + execCommand.
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}
