// Checklist dentro de una nota: una línea "- [ ] texto" / "- [x] texto" se
// detecta y se renderiza como checkbox clicable en vez de texto plano (ver
// Notes.tsx). Puro — sin dependencias de React ni del DOM.

export interface ChecklistLine {
  indent: string
  checked: boolean
  text: string
}

const CHECKLIST_RE = /^(\s*)[-*]\s\[([ xX])\]\s?(.*)$/

export function parseChecklistLine(line: string): ChecklistLine | null {
  const m = CHECKLIST_RE.exec(line)
  if (!m) return null
  return { indent: m[1], checked: m[2].toLowerCase() === 'x', text: m[3] }
}

export function toggleChecklistLine(line: string): string {
  const parsed = parseChecklistLine(line)
  if (!parsed) return line
  return `${parsed.indent}- [${parsed.checked ? ' ' : 'x'}] ${parsed.text}`
}

export function hasChecklistLine(body: string): boolean {
  return body.split('\n').some(l => CHECKLIST_RE.test(l))
}
