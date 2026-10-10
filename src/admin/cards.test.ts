import { describe, expect, it } from 'vitest'
import { friendlyError, keyFromHeadline, nextVersion } from './cards'

describe('banco de noticias: utilidades', () => {
  it('genera una clave interna válida y sin repetir', () => {
    const k = keyFromHeadline('Desde mañana el peaje de la Ruta 27 costará ₡5.000', false, new Set())
    expect(k).toBe('f_desde_manana_peaje')
    expect(k).toMatch(/^[a-z0-9_]{2,40}$/)
    expect(keyFromHeadline('Desde mañana el peaje de la Ruta 27', false, new Set([k]))).toBe('f_desde_manana_peaje_2')
    expect(keyFromHeadline('¡¡!!', true, new Set())).toBe('r_noticia')
  })
  it('sugiere el siguiente número de versión', () => {
    expect(nextVersion(['1.0.0', '2.0.0', '3.0.0'])).toBe('3.1.0')
    expect(nextVersion(['3.0.0', '3.1.0', '10.0.0'])).toBe('10.1.0')
  })
  it('traduce los errores de la base', () => {
    expect(friendlyError('forbidden')).toMatch(/rol/)
    expect(friendlyError('version_existente: 3.0.0 ya existe')).toMatch(/ya existe/)
    expect(friendlyError('algo raro')).toMatch(/No se pudo guardar/)
  })
})
