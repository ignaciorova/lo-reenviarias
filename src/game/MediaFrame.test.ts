import { describe, expect, it } from 'vitest'
import { MediaSchema } from './MediaFrame'

const ok = { kind: 'image', src: '/media/v3/bus.jpg', alt: 'Foto de un bus', frame: 'whatsapp' }

describe('MediaSchema (imágenes de la versión 3.0.0)', () => {
  it('acepta archivos del propio sitio', () => {
    expect(MediaSchema.safeParse(ok).success).toBe(true)
    expect(MediaSchema.safeParse({ ...ok, kind: 'video', src: '/media/v3/cuba.mp4', webm: '/media/v3/cuba.webm', poster: '/media/v3/cuba-poster.jpg', focus: '20% 50%' }).success).toBe(true)
  })
  it('rechaza otros dominios, esquemas y rutas fuera de /media/', () => {
    for (const src of ['https://example.com/a.jpg', '//example.com/a.jpg', 'javascript:alert(1)', 'data:image/png;base64,AAAA', '/media/../admin.jpg', '/sandbox/bus.jpg']) {
      expect(MediaSchema.safeParse({ ...ok, src }).success, src).toBe(false)
    }
    expect(MediaSchema.safeParse({ ...ok, poster: 'https://example.com/p.jpg' }).success).toBe(false)
    expect(MediaSchema.safeParse({ ...ok, focus: 'url(x)' }).success).toBe(false)
  })
})
