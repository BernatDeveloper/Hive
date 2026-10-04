// @vitest-environment jsdom
// Necesita localStorage real (jsdom); el resto de tests del proyecto no lo
// necesitan y se quedan en el entorno 'node' por defecto (más rápido).
import { describe, test, expect, beforeEach } from 'vitest'
import {
  getGlobalIdentity, setGlobalIdentity, getRoomOverride, setRoomOverride,
  clearRoomOverride, hasIdentity, getIdentity, getDeviceId, IDENTITY_COLORS,
} from './identity'

beforeEach(() => {
  localStorage.clear()
})

describe('identidad global', () => {
  test('sin identidad guardada, hasIdentity es false y getGlobalIdentity es null', () => {
    expect(hasIdentity()).toBe(false)
    expect(getGlobalIdentity()).toBeNull()
  })

  test('setGlobalIdentity persiste y getGlobalIdentity la recupera', () => {
    setGlobalIdentity({ name: 'Ana', color: '#ff0000' })
    expect(hasIdentity()).toBe(true)
    expect(getGlobalIdentity()).toEqual({ name: 'Ana', color: '#ff0000' })
  })

  test('un valor corrupto en localStorage no rompe la lectura', () => {
    localStorage.setItem('identity', '{ esto no es json')
    expect(getGlobalIdentity()).toBeNull()
  })

  test('un valor con forma inválida (sin color) se ignora', () => {
    localStorage.setItem('identity', JSON.stringify({ name: 'Ana' }))
    expect(getGlobalIdentity()).toBeNull()
  })
})

describe('override por sala', () => {
  test('sin override, getRoomOverride es null', () => {
    expect(getRoomOverride('sala-1')).toBeNull()
  })

  test('setRoomOverride no afecta a otra sala ni a la identidad global', () => {
    setGlobalIdentity({ name: 'Ana', color: '#ff0000' })
    setRoomOverride('sala-1', { name: 'Ana (trabajo)', color: '#0071e3' })

    expect(getRoomOverride('sala-1')).toEqual({ name: 'Ana (trabajo)', color: '#0071e3' })
    expect(getRoomOverride('sala-2')).toBeNull()
    expect(getGlobalIdentity()).toEqual({ name: 'Ana', color: '#ff0000' })
  })

  test('clearRoomOverride borra solo el override de esa sala', () => {
    setRoomOverride('sala-1', { name: 'X', color: '#ff0000' })
    clearRoomOverride('sala-1')
    expect(getRoomOverride('sala-1')).toBeNull()
  })
})

describe('getIdentity (resolución)', () => {
  test('sin nada guardado, devuelve un invitado con color de la paleta', () => {
    const id = getIdentity('sala-1')
    expect(id.name).toBe('Invitado')
    expect(IDENTITY_COLORS).toContain(id.color)
  })

  test('con solo identidad global, la usa para cualquier sala', () => {
    setGlobalIdentity({ name: 'Ana', color: '#ff0000' })
    expect(getIdentity('sala-1')).toEqual({ name: 'Ana', color: '#ff0000' })
    expect(getIdentity('sala-2')).toEqual({ name: 'Ana', color: '#ff0000' })
  })

  test('el override de una sala tiene prioridad sobre la identidad global', () => {
    setGlobalIdentity({ name: 'Ana', color: '#ff0000' })
    setRoomOverride('sala-1', { name: 'Ana (trabajo)', color: '#0071e3' })
    expect(getIdentity('sala-1')).toEqual({ name: 'Ana (trabajo)', color: '#0071e3' })
    expect(getIdentity('sala-2')).toEqual({ name: 'Ana', color: '#ff0000' })
  })

  test('sin argumento de sala, ignora cualquier override y usa la global', () => {
    setGlobalIdentity({ name: 'Ana', color: '#ff0000' })
    setRoomOverride('sala-1', { name: 'Ana (trabajo)', color: '#0071e3' })
    expect(getIdentity()).toEqual({ name: 'Ana', color: '#ff0000' })
  })
})

describe('id de dispositivo', () => {
  test('se genera una vez, con el formato que acepta el servidor, y es estable', () => {
    const id = getDeviceId()
    expect(id).toMatch(/^[A-Za-z0-9_-]{8,64}$/)
    expect(getDeviceId()).toBe(id)
    expect(localStorage.getItem('deviceId')).toBe(id)
  })

  test('un valor guardado corrupto se sustituye por uno válido', () => {
    localStorage.setItem('deviceId', 'no vale!')
    const id = getDeviceId()
    expect(id).not.toBe('no vale!')
    expect(id).toMatch(/^[A-Za-z0-9_-]{8,64}$/)
  })
})
