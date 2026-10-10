import { describe, expect, it } from 'vitest'
import { ADJECTIVES, ANIMALS, aliasText, randomAlias } from './aliases'

describe('apodos de la tabla', () => {
  it('coinciden con los que arma el servidor (ver supabase/tests/30_tabla_puntuacion_tests.sql)', () => {
    expect(aliasText({ animal: 1, adj: 3, num: 27 })).toBe('Jaguar Implacable 27 🐆')
    expect(aliasText({ animal: 4, adj: 19, num: 0 })).toBe('Tortuga Detective 00 🐢')
    expect(aliasText({ animal: 3, adj: 0, num: 5 })).toBe('Lapa Veloz 05 🦜')
  })
  it('20 × 20 × 100 combinaciones, siempre válidas', () => {
    expect(ANIMALS).toHaveLength(20)
    expect(ADJECTIVES).toHaveLength(20)
    for (const r of [0, 0.5, 0.9999]) {
      const a = randomAlias(() => r)
      expect(a.animal).toBeLessThan(20); expect(a.adj).toBeLessThan(20); expect(a.num).toBeLessThan(100)
    }
  })
})
