import { readFileSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import { hasDb, sql } from './helpers'

// Entorno LOCAL: la base local no tiene Supabase Storage, así que la subida y la descarga de archivos
// del bucket «noticias» se simulan aquí. Todo lo demás (RPC, RLS, versiones) es la base real de pruebas.
const tok = (name: string) => (process.env.E2E_TOKEN_DIR ? readFileSync(`${process.env.E2E_TOKEN_DIR}/${name}.jwt`, 'utf8').trim() : '')
const OWNER = ['00000000-0000-4000-8000-0000000000aa', 'owner-e2e@test.local'] as const
const JPG = readFileSync('public/media/v3/bus.jpg')

async function loginAs(page: Page, token: string, id: string, email: string) {
  await page.goto('/admin')
  await page.evaluate(([t, i, e]) => {
    const exp = Math.floor(Date.now() / 1000) + 3600
    localStorage.setItem('lr-admin-auth', JSON.stringify({ access_token: t, refresh_token: 'local', token_type: 'bearer', expires_in: 3600, expires_at: exp, user: { id: i, email: e, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } }))
  }, [token, id, email])
  await page.reload()
}
async function go(page: Page, name: string) {
  await page.getByRole('button', { name: 'Salir' }).waitFor()
  const menu = page.getByRole('button', { name: 'Menú' })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('link', { name, exact: true }).click()
}
async function fakeStorage(page: Page) {
  const uploads: string[] = []
  await page.route('**/storage/v1/object/noticias/*', async (route) => {
    uploads.push(route.request().url())
    await route.fulfill({ json: { Key: `noticias/${route.request().url().split('/').pop()}`, Id: 'x' } })
  })
  await page.route('**/storage/v1/object/public/noticias/*', (route) => route.fulfill({ body: JPG, contentType: 'image/jpeg' }))
  return uploads
}

test.describe('Banco de noticias y versiones', () => {
  test.skip(!process.env.E2E_TOKEN_DIR || !hasDb(), 'requiere entorno local')

  test('owner crea una noticia con imagen, arma una versión, la activa y vuelve atrás', async ({ page }, info) => {
    const uploads = await fakeStorage(page)
    const tag = info.project.name
    const headline = `Desde mañana el peaje de la ruta 27 costará ₡5.000 (${tag} ${Date.now() % 100000})`
    const before = sql<{ version: string }>(`select version from studies where code = 'lo-reenviarias' and status = 'active'`)[0].version

    await loginAs(page, tok('owner'), ...OWNER)
    await go(page, 'Banco de noticias')
    await expect(page.getByRole('heading', { name: 'Banco de noticias' })).toBeVisible()
    await expect(page.getByText('Filtros')).toHaveCount(0)
    await expect(page.locator('li').filter({ hasText: 'El pasaje de una ruta de bus en Alajuela' })).toBeVisible()

    // Nueva noticia con imagen
    await page.getByRole('button', { name: '+ Nueva noticia' }).click()
    await page.getByLabel('Titular (lo que lee el jugador)').fill(headline)
    await page.getByRole('radio', { name: 'Falsa' }).check()
    await page.getByLabel('Categoría').fill('Transporte')
    await page.getByLabel('Quién la reenvía').fill('Primo Luis')
    await page.getByLabel('Etiqueta superior').fill('URGENTE')
    await page.getByLabel(/Subir imagen/).setInputFiles('public/media/v3/bus.jpg')
    const preview = page.getByRole('complementary', { name: 'Vista previa' })
    await expect(preview.locator('img[src*="/storage/v1/object/public/noticias/"]')).toBeVisible()
    expect(uploads).toHaveLength(1)
    await page.getByLabel('Descripción de la imagen (para lectores de pantalla)').fill('Foto de una caseta de peaje')
    await page.getByRole('button', { name: 'Facebook' }).click()
    await expect(preview.getByText('compartió una publicación')).toBeVisible()
    await page.getByLabel('Pista de la lupa').fill('No hay anuncio del MOPT ni del CONAVI.')
    await page.getByLabel('Explicación (se muestra al responder)').fill('Es inventada para este juego.')
    await page.getByRole('button', { name: 'Guardar en el banco' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Noticia creada' })).toBeVisible()

    const [card] = sql<{ item_key: string; src: string; frame: string; revision: number }>(`
      select item_key, display->'media'->>'src' as src, display->'media'->>'frame' as frame, revision from news_bank where headline = '${headline.replace(/'/g, "''")}'`)
    expect(card.src).toMatch(/^\/storage\/v1\/object\/public\/noticias\/[a-f0-9-]+\.jpg$/)
    expect(card.frame).toBe('facebook')
    expect(card.item_key).toMatch(/^f_desde_manana_peaje/)

    // Editar una noticia que está en juego: no cambia la versión activa
    const bus = page.locator('li').filter({ hasText: 'El pasaje de una ruta de bus en Alajuela' })
    await bus.getByRole('button', { name: 'Editar' }).click()
    await page.getByLabel('Etiqueta superior').fill(`SUBE ${tag}`.slice(0, 20))
    await page.getByRole('button', { name: 'Guardar en el banco' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Cambios guardados' })).toBeVisible()
    expect(sql(`select 1 from news_items n join studies s on s.id = n.study_id where s.status = 'active' and n.item_key = 'r_bus' and n.display->>'band' like 'SUBE%'`)).toHaveLength(0)

    // Armar una versión con la noticia nueva
    await go(page, 'Versiones del juego')
    await page.getByRole('button', { name: '+ Armar versión nueva' }).click()
    await page.locator('label').filter({ hasText: headline }).getByRole('checkbox').check()
    await expect(page.getByRole('status').filter({ hasText: '11 elegidas' })).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: 'verá 10 al azar' })).toBeVisible()
    const version = await page.getByLabel('Número').inputValue()
    await page.getByRole('button', { name: 'Crear borrador' }).click()
    await expect(page.getByRole('alert')).toContainText('nota de cambios')
    await page.getByLabel(/Qué cambia/).fill('Se agrega la noticia del peaje (prueba E2E).')
    await page.getByRole('button', { name: 'Crear borrador' }).click()
    await expect(page.getByRole('status').filter({ hasText: `Borrador ${version} creado` })).toBeVisible()
    expect(sql(`select status from studies where version = '${version}'`)).toEqual([{ status: 'draft' }])

    // Activar con confirmación
    const row = page.locator('li').filter({ has: page.locator('b', { hasText: new RegExp(`^${version.replace(/\./g, '\\.')}$`) }) })
    await row.getByRole('button', { name: 'Activar' }).click()
    await expect(page.getByRole('alertdialog')).toContainText(`La ${before} queda cerrada`)
    await page.getByRole('button', { name: `Sí, activar ${version}` }).click()
    await expect(page.getByRole('status').filter({ hasText: `ya juegan la ${version}` })).toBeVisible()
    expect(sql(`select version from studies where code = 'lo-reenviarias' and status = 'active'`)).toEqual([{ version }])
    expect(sql(`select count(*)::int as n from news_items n join studies s on s.id = n.study_id where s.version = '${version}'`)).toEqual([{ n: 11 }])

    // Volver a la versión anterior desde la misma pantalla
    const prev = page.locator('li').filter({ has: page.locator('b', { hasText: new RegExp(`^${before.replace(/\./g, '\\.')}$`) }) })
    await prev.getByRole('button', { name: 'Volver a activar' }).click()
    await page.getByRole('button', { name: `Sí, activar ${before}` }).click()
    await expect(page.getByRole('status').filter({ hasText: `ya juegan la ${before}` })).toBeVisible()
    expect(sql(`select version from studies where code = 'lo-reenviarias' and status = 'active'`)).toEqual([{ version: before }])
  })

  test('viewer ve el banco pero no puede editar ni activar', async ({ page }) => {
    await loginAs(page, tok('viewer'), '00000000-0000-4000-8000-0000000000cc', 'viewer-e2e@test.local')
    await go(page, 'Banco de noticias')
    await expect(page.locator('li').filter({ hasText: 'El pasaje de una ruta de bus en Alajuela' })).toBeVisible()
    await expect(page.getByRole('button', { name: '+ Nueva noticia' })).toHaveCount(0)
    await page.locator('li').filter({ hasText: 'El pasaje de una ruta de bus en Alajuela' }).getByRole('button', { name: 'Ver' }).click()
    await expect(page.getByText('Tu rol (viewer) permite ver')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Guardar en el banco' })).toHaveCount(0)
    await go(page, 'Versiones del juego')
    await expect(page.getByRole('button', { name: '+ Armar versión nueva' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Activar/ })).toHaveCount(0)
  })
})
