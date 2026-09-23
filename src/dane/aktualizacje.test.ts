import { describe, expect, it } from 'vitest'
import { czyNowsza, rozbijWersje } from './aktualizacje'

describe('rozbijWersje', () => {
  it('rozpoznaje znacznik wydania', () => {
    expect(rozbijWersje('v1.0.7')).toEqual([1, 0, 7])
    expect(rozbijWersje('1.0.7')).toEqual([1, 0, 7])
    expect(rozbijWersje(' v2.13.140 ')).toEqual([2, 13, 140])
  })

  it('odrzuca wszystko, co nie jest wersją', () => {
    expect(rozbijWersje('dev')).toBeNull()
    expect(rozbijWersje('web-42')).toBeNull()
    expect(rozbijWersje('v1.0')).toBeNull()
    expect(rozbijWersje('')).toBeNull()
    expect(rozbijWersje('najnowsza')).toBeNull()
  })
})

describe('czyNowsza', () => {
  it('porównuje kolejne człony liczbowo, nie tekstowo', () => {
    // Porównanie tekstowe uznałoby „v1.0.9” za nowsze niż „v1.0.10”.
    expect(czyNowsza('v1.0.10', 'v1.0.9')).toBe(true)
    expect(czyNowsza('v1.0.9', 'v1.0.10')).toBe(false)
    expect(czyNowsza('v1.0.100', 'v1.0.99')).toBe(true)
  })

  it('uwzględnia człon główny i pomocniczy', () => {
    expect(czyNowsza('v2.0.0', 'v1.9.9')).toBe(true)
    expect(czyNowsza('v1.1.0', 'v1.0.99')).toBe(true)
    expect(czyNowsza('v1.0.0', 'v2.0.0')).toBe(false)
  })

  it('ta sama wersja to nie aktualizacja', () => {
    expect(czyNowsza('v1.0.7', 'v1.0.7')).toBe(false)
    expect(czyNowsza('1.0.7', 'v1.0.7')).toBe(false)
  })

  it('nie zaczepia użytkownika przy buildzie deweloperskim ani w PWA', () => {
    // Bez sensownej wersji bieżącej nie ma czego porównywać – lepiej milczeć
    // niż pokazywać pasek aktualizacji przy każdym uruchomieniu.
    expect(czyNowsza('v9.9.9', 'dev')).toBe(false)
    expect(czyNowsza('v9.9.9', 'web-12')).toBe(false)
    expect(czyNowsza('cokolwiek', 'v1.0.0')).toBe(false)
  })
})
