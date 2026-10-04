// Saneado de la identidad de quien edita (nombre + color de dispositivo).
// Informativa y spoofeable: cualquier valor ausente o con forma inválida se
// guarda como null, nunca se rechaza la escritura.
const HEX = /^#[0-9a-fA-F]{6}$/
const MAX_EDITOR_NAME = 40

export function sanitizeEditorName(name) {
  return typeof name === 'string' && name.trim().length > 0 ? name.trim().slice(0, MAX_EDITOR_NAME) : null
}

export function sanitizeEditorColor(color) {
  return typeof color === 'string' && HEX.test(color) ? color.toLowerCase() : null
}
