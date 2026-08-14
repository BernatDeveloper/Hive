import type { EventCategory, RecurrenceRule } from '../../types'

export const CATEGORIES: Record<EventCategory, { label: string; icon: string; color: string }> = {
  otro:       { label: 'Otro',       icon: '📌', color: '#8E8E93' },
  personal:   { label: 'Personal',   icon: '🏠', color: '#30D158' },
  trabajo:    { label: 'Trabajo',    icon: '💼', color: '#0071E3' },
  social:     { label: 'Social',     icon: '🎉', color: '#BF5AF2' },
  cumpleanos: { label: 'Cumpleaños', icon: '🎂', color: '#FF375F' },
  vacaciones: { label: 'Vacaciones', icon: '✈️',  color: '#FF9F0A' },
  salud:      { label: 'Salud',      icon: '❤️',  color: '#FF453A' },
}

export const RECURRENCE_LABELS: Record<RecurrenceRule, string> = {
  none:            'Sin repetición',
  daily:           'Cada día',
  weekly:          'Cada semana',
  monthly:         'Cada mes, mismo día',
  'monthly-first': 'Primer día del mes',
  'monthly-last':  'Último día del mes',
  annual:          'Cada año',
}

export const RECURRENCE_OPTIONS: Record<RecurrenceRule, { label: string; sub: string }> = {
  none:            { label: 'Sin repetición', sub: '' },
  daily:           { label: 'Diario',         sub: '1 año' },
  weekly:          { label: 'Semanal',        sub: '2 años' },
  monthly:         { label: 'Mensual',        sub: 'mismo día' },
  'monthly-first': { label: 'Primer día',     sub: 'del mes' },
  'monthly-last':  { label: 'Último día',     sub: 'del mes' },
  annual:          { label: 'Anual',          sub: '10 años' },
}
