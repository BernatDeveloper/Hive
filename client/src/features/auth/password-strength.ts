export const MIN_PASSWORD = 8

export type Strength = 'débil' | 'media' | 'fuerte'

// Heurística simple: longitud + variedad de caracteres.
export function passwordStrength(pw: string): { level: Strength; score: number } {
  let score = 0
  if (pw.length >= MIN_PASSWORD) score++
  if (pw.length >= 12) score++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++
  if (/\d/.test(pw)) score++
  if (/[^a-zA-Z0-9]/.test(pw)) score++

  const level: Strength = score <= 1 ? 'débil' : score <= 3 ? 'media' : 'fuerte'
  return { level, score }
}
