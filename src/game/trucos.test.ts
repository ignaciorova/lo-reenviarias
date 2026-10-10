import { describe, expect, it } from 'vitest'
import { repaso, resaltar, TRUCOS, TRUCOS_POR_NOTICIA } from './trucos'

const r = (key: string, isReal: boolean, correct: boolean) => ({ key, headline: key, isReal, correct })

describe('repaso de trucos', () => {
  it('cada noticia falsa usa trucos que existen', () => {
    for (const porTruco of Object.values(TRUCOS_POR_NOTICIA)) for (const t of Object.keys(porTruco)) expect(TRUCOS[t], t).toBeDefined()
  })
  it('ordena por cuántas veces funcionó cada truco y devuelve como máximo 3', () => {
    const out = repaso([r('f_sinpe', false, false), r('f_ejercito', false, false), r('f_ccss', false, false), r('r_bus', true, true)])
    expect(out.cayo).toBe(true)
    expect(out.items).toHaveLength(3)
    expect(out.items[0].truco.id).toBe('urgencia')
    expect(out.items[0].ejemplos).toHaveLength(3)
  })
  it('rechazar una real cuenta como «desconfiar de todo»', () => {
    const out = repaso([r('r_bus', true, false), r('f_sinpe', false, true)])
    expect(out.items.map((i) => i.truco.id)).toEqual(['todo_falso'])
  })
  it('sin fallos muestra los trucos que esquivó', () => {
    const out = repaso([r('f_sinpe', false, true), r('r_bus', true, true)])
    expect(out.cayo).toBe(false)
    expect(out.items.length).toBeGreaterThan(0)
    expect(out.items.some((i) => i.truco.id === 'todo_falso')).toBe(false)
  })
})

describe('resaltar', () => {
  it('marca las frases del truco dentro del titular sin perder texto', () => {
    const h = 'La CCSS dejará de atender emergencias a personas que no tengan el seguro al día desde enero. ¡Pásalo!'
    expect(resaltar(h, 'f_ccss', 'pasalo').map((p) => p.text).join('')).toBe(h)
    expect(resaltar(h, 'f_ccss', 'pasalo').filter((p) => p.mark).map((p) => p.text)).toEqual(['¡Pásalo!'])
    expect(resaltar(h, 'f_ccss', 'miedo').filter((p) => p.mark).map((p) => p.text)).toEqual(['dejará de atender emergencias'])
    expect(resaltar(h, 'f_ccss', 'sin_fuente').some((p) => p.mark)).toBe(false)
  })
})
