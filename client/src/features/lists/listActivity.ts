// Texto de la "última modificación" de una lista (quién y cuándo). Puro.
import type { List } from '../../types'
import { formatRelativeTime } from '../../shared/relativeTime'

export const NO_ACTIVITY_TEXT = 'Aún sin modificaciones registradas'

// "Modificada por Ana · hace 2 min"; sin nombre de editor, "Modificada · hace 2 min".
// Una lista sin registro (anterior a esta función y no tocada desde entonces)
// → NO_ACTIVITY_TEXT: la línea se muestra siempre, si no la función parece no
// existir hasta que alguien hace el primer cambio.
export function listActivityText(list: Pick<List, 'last_editor_name' | 'edited_at'>, now?: number): string {
  if (!list.edited_at) return NO_ACTIVITY_TEXT
  const when = formatRelativeTime(list.edited_at, now)
  return list.last_editor_name ? `Modificada por ${list.last_editor_name} · ${when}` : `Modificada · ${when}`
}
