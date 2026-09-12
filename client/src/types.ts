// No hay tipos compartidos automáticos con el servidor (JS ESM). Estas formas
// las fija `server/test/contract.test.js`: si el servidor cambia lo que emite,
// ese test falla y hay que actualizar aquí.

export type RecurrenceRule = 'none' | 'daily' | 'weekly' | 'monthly' | 'monthly-first' | 'monthly-last' | 'annual'

// Alcance de una edición/borrado sobre una instancia de serie recurrente.
export type RecurrenceScope = 'single' | 'future' | 'all'

// Respuesta (ack) de un `delete-*`: si trae `undoToken`, hay ventana de deshacer.
export interface UndoOffer {
  undoToken?: string
  label?: string
}

export interface Event {
  id: string
  room: string
  title: string
  start: string
  end: string
  description: string
  color: string | null   // hex #rrggbb; null = hereda el primary_color de la sala
  recurrence_rule: RecurrenceRule | null
  recurrence_id: string | null
  reminder_offset: number | null
  reminder_sent: 0 | 1
  updated_at: string   // testigo de versión para la concurrencia optimista (evento único)
  last_editor_name: string | null    // identidad de dispositivo (Fase 9) — informativa, spoofeable
  last_editor_color: string | null
}

// Persona presente en la sala ahora mismo (identidad de dispositivo, no cuenta).
export interface PresencePerson {
  name: string
  color: string
}

export interface Room {
  name: string
  primary_color: string | null
  background_color: string | null
  text_color: string | null
  sidebar_color: string | null
  event_colors: string[]   // paleta de colores de evento definida en Ajustes
  timezone: string   // zona IANA; gobierna cuándo disparan los recordatorios, no el display
  created_at?: string
}

export interface List {
  id: string
  room: string
  title: string
  created_at: string
}

export interface ListItem {
  id: string
  list_id: string
  room: string
  text: string
  checked: boolean
}

export interface Note {
  id: string
  room: string
  title: string
  body: string
  created_at: string
  updated_at: string
  last_editor_name: string | null
  last_editor_color: string | null
}
