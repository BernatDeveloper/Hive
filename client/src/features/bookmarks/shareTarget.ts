// Web Share Target: el manifest registra la app como destino de "Compartir"
// (Android, con la PWA instalada). El sistema abre la app en
// `/?title=…&text=…&url=…` (método GET). Aquí se saca de ahí el enlace a guardar.
// Puro — sin DOM ni red.
import { normalizeUrl } from './bookmarkUtils'

export interface SharedLink {
  url: string
  // Título de la página si la app que comparte lo manda (solo informativo: se
  // muestra en la confirmación; el título real lo lee el servidor al guardar).
  title: string | null
}

const URL_IN_TEXT = /https?:\/\/[^\s<>"']+/i

// Cuántos cierres sobran: "(https://a.com/x)" lleva un ")" que no es de la URL,
// pero "https://es.wikipedia.org/wiki/Foo_(bar)" sí lo necesita.
const surplus = (s: string, open: string, close: string) =>
  [...s].filter(c => c === close).length - [...s].filter(c => c === open).length

function trimTrailingPunctuation(url: string): string {
  let out = url
  for (;;) {
    const last = out.slice(-1)
    if ('.,;:!?»”’'.includes(last)) out = out.slice(0, -1)
    else if (last === ')' && surplus(out, '(', ')') > 0) out = out.slice(0, -1)
    else if (last === ']' && surplus(out, '[', ']') > 0) out = out.slice(0, -1)
    else if (last === '}' && surplus(out, '{', '}') > 0) out = out.slice(0, -1)
    else return out
  }
}

// Primer enlace http(s) dentro de un texto libre ("Mira esto https://… qué tal").
export function extractUrl(text: string): string | null {
  const match = text.match(URL_IN_TEXT)
  return match ? normalizeUrl(trimTrailingPunctuation(match[0])) : null
}

// `search` = location.search. null si no es un "compartir" o no hay ningún
// enlace aprovechable (una carga normal de la app no trae estos parámetros).
// Muchas apps ponen el enlace en `text` (a veces con más palabras) y dejan
// `url` vacío, así que se prueban los tres, en este orden.
export function parseShareParams(search: string): SharedLink | null {
  const params = new URLSearchParams(search)
  const rawUrl = (params.get('url') ?? '').trim()
  const text = params.get('text') ?? ''
  const title = (params.get('title') ?? '').trim()

  const url = (rawUrl ? (extractUrl(rawUrl) ?? normalizeUrl(rawUrl)) : null)
    ?? extractUrl(text)
    ?? extractUrl(title)
  if (!url) return null

  // Un "título" que en realidad es el propio enlace no aporta nada.
  const usefulTitle = title && !extractUrl(title) && title !== rawUrl ? title.slice(0, 200) : null
  return { url, title: usefulTitle }
}
