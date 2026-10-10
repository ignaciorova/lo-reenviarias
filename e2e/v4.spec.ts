import { expect, test, type Page } from '@playwright/test'
import { hasDb, sql, sqlExec } from './helpers'

// Flujo 4.0.0 contra un entorno local con la 4.0.0 activa (E2E_V4=1, E2E_LOCAL_DB=lr_e2e4).
const SHOTS = process.env.E2E_SHOTS
test.skip(!process.env.E2E_V4 || !hasDb(), 'requiere entorno local con la 4.0.0 activa')

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${test.info().project.name}-${name}.png` })
}

async function startV4(page: Page, url = '/') {
  await page.goto(url)
  await expect(page.getByRole('heading', { name: /reenviarías/ })).toBeVisible()
  await shot(page, '01-portada')
  const go = page.getByRole('button', { name: 'Acepto y quiero jugar' })
  await expect(go).toBeDisabled()
  await page.getByRole('radio', { name: 'Sí, es la primera vez' }).click()
  await expect(go).toBeEnabled()
  await go.click()
  await expect(page.getByText('Noticia 1 de 10')).toBeVisible()
  return (await page.evaluate(() => localStorage.getItem('lr_session_v4')))!
}

async function belief(page: Page, b: 'si' | 'no' | 'no_se', n: number, shotName?: string) {
  const sheet = page.getByRole('dialog', { name: '¿Te la crees?' })
  await expect(sheet).toBeVisible()
  if (shotName) await shot(page, shotName)
  await sheet.getByRole('button', { name: b === 'si' ? /Sí, me la creo/ : b === 'no' ? /No, no me la creo/ : /No sé/ }).click()
  const why = page.getByRole('heading', { name: '¿Por qué?' })
  if (await why.isVisible().catch(() => false)) await page.getByRole('button', { name: 'No tiene fuente' }).click()
  const fb = page.getByRole('dialog').filter({ has: page.locator('#fb-title') })
  await expect(fb).toBeVisible()
  if (shotName) await shot(page, `${shotName}-resultado`)
  await fb.getByRole('button', { name: n < 10 ? 'Siguiente noticia' : 'Ver mi resultado' }).click()
}

test('partida 4.0.0 completa: decisiones, verificación, creencia, resultado y encuesta', async ({ page }) => {
  const sid = await startV4(page, '/?origen=qr_juego')
  await shot(page, '02-tarjeta')
  // 1 reenviar (botón), 2 no reenviar (tecla), 3 con aviso, 4 verificar → oficial, 5 tiempo agotado, 6..10 deslizar/botones
  await page.getByRole('button', { name: 'Reenviar 👉' }).click()
  await belief(page, 'si', 1, '03-creencia')
  await expect(page.getByText('Noticia 2 de 10')).toBeVisible()
  await page.keyboard.press('ArrowLeft')
  await belief(page, 'no', 2)
  await page.getByRole('button', { name: '⚠️ Reenviar con aviso' }).click()
  await belief(page, 'no_se', 3)
  await page.getByRole('button', { name: '🔍 Verificar primero' }).click()
  await expect(page.getByRole('heading', { name: '🔍 ¿Dónde lo verificas?' })).toBeVisible()
  await shot(page, '04-fuentes')
  await page.getByRole('button', { name: /Fuente oficial/ }).click()
  await expect(page.getByRole('heading', { name: '¿Qué dice esta fuente sobre la noticia?' })).toBeVisible()
  await page.waitForTimeout(2300)
  await shot(page, '05-lectura')
  await page.getByRole('button', { name: /La desmiente/ }).click()
  await expect(page.getByRole('heading', { name: 'Ya verificaste. ¿Qué haces?' })).toBeVisible()
  await shot(page, '06-final')
  await page.getByRole('button', { name: '👈 No reenviar' }).click()
  await belief(page, 'no', 4)
  // 5: se deja correr el tiempo (20 s)
  await expect(page.getByText('Noticia 5 de 10')).toBeVisible()
  const fb5 = page.getByRole('dialog').filter({ has: page.locator('#fb-title') })
  await expect(fb5).toBeVisible({ timeout: 25_000 })
  await expect(fb5.getByRole('heading', { name: '¡Se acabó el tiempo!' })).toBeVisible()
  await fb5.getByRole('button', { name: 'Siguiente noticia' }).click()
  for (let n = 6; n <= 10; n++) {
    await expect(page.getByText(`Noticia ${n} de 10`)).toBeVisible()
    await page.getByRole('button', { name: n % 2 ? 'Reenviar 👉' : '👈 No reenviar' }).click()
    await belief(page, n % 3 === 0 ? 'no_se' : 'si', n)
  }
  await expect(page.getByText('adivinaste si eran reales')).toBeVisible()
  await shot(page, '07-resultado')

  const rows = sql<{ position: number; state: string; effective_verification: boolean; read_ms: number | null }>(
    `select position, state, effective_verification, read_ms from public.share_decisions where session_id = '${sid}' order by position`)
  expect(rows.map((r) => r.state)).toEqual(['E1', 'E3', 'E2', 'E6', 'E7', 'E3', 'E1', 'E3', 'E1', 'E3'])
  expect(rows[3].read_ms).toBeGreaterThanOrEqual(2000)
  const s = sql<{ status: string; entry_origin: string; survey_code: string | null }>(`select status, entry_origin, survey_code from public.participant_sessions where id = '${sid}'`)[0]
  expect(s).toMatchObject({ status: 'completed', entry_origin: 'qr_juego', survey_code: null })

  // Encuesta después de jugar: abre Google Forms con el código prellenado y lo enlaza a la sesión
  // Sin salir a internet: se responde la página de Google Forms con un HTML mínimo y se lee la URL pedida
  const formRequests: string[] = []
  await page.context().route('https://docs.google.com/**', (r) => { formRequests.push(r.request().url()); return r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Formulario</h1>' }) })
  const popup = page.waitForEvent('popup')
  await page.getByRole('button', { name: 'Responder la encuesta' }).click()
  const p = await popup
  await expect.poll(() => formRequests.length).toBeGreaterThan(0)
  const u = new URL(formRequests[0])
  expect(u.hostname).toBe('docs.google.com')
  expect(u.searchParams.get('usp')).toBe('pp_url')
  const code = u.searchParams.get('entry.1234567890')!
  expect(code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/)
  await p.close()
  await expect.poll(() => sql<{ survey_code: string; survey_intent: string }>(`select survey_code, survey_intent from public.participant_sessions where id = '${sid}'`)[0])
    .toEqual({ survey_code: code.replace('-', ''), survey_intent: 'despues' })

  // Recargar la página final la muestra igual (persistencia)
  await page.reload()
  await expect(page.getByText('adivinaste si eran reales')).toBeVisible()
})

test('entrada por el QR de la encuesta: /codigo da un código y el juego lo ofrece', async ({ page }) => {
  await page.goto('/codigo')
  const shown = (await page.locator('p.font-mono').textContent())!.trim()
  expect(shown).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/)
  await shot(page, '08-codigo')
  await page.goto('/?origen=encuesta')
  await expect(page.getByText('¡Gracias por responder la encuesta!')).toBeVisible()
  await expect(page.getByText(shown)).toBeVisible()
  await shot(page, '09-portada-desde-encuesta')
  const sid = await startV4(page, '/?origen=encuesta')
  const s = sql<{ survey_code: string; entry_origin: string; survey_intent: string }>(`select survey_code, entry_origin, survey_intent from public.participant_sessions where id = '${sid}'`)[0]
  expect(s).toEqual({ survey_code: shown.replace('-', ''), entry_origin: 'encuesta', survey_intent: 'antes' })
})

test('código mal escrito: avisa y no deja empezar; sin código se puede jugar', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Ya la respondí' }).click()
  await page.getByLabel(/Tu código de la encuesta/).fill('ABCD-EFGH')
  await page.getByRole('radio', { name: 'Sí, es la primera vez' }).click()
  await expect(page.getByText('Ese código no es válido')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Acepto y quiero jugar' })).toBeDisabled()
  await page.getByLabel(/Tu código de la encuesta/).fill('')
  await page.getByRole('button', { name: 'Acepto y quiero jugar' }).click()
  await expect(page.getByText('Noticia 1 de 10')).toBeVisible()
})

test('recarga a mitad de una verificación: retoma en las fuentes y no pierde la apertura', async ({ page }) => {
  const sid = await startV4(page)
  await page.getByRole('button', { name: '🔍 Verificar primero' }).click()
  await page.getByRole('button', { name: /Medio de noticias/ }).click()
  await expect(page.getByRole('heading', { name: '¿Qué dice esta fuente sobre la noticia?' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: '🔍 ¿Dónde lo verificas?' })).toBeVisible()
  await page.getByRole('button', { name: /Medio de noticias/ }).click()
  await page.getByRole('button', { name: /No dice nada claro/ }).click()
  await page.getByRole('button', { name: '⚠️ Reenviar con aviso' }).click()
  await belief(page, 'no_se', 1)
  const r = sql<{ state: string; sources_opened: string[] }>(`select state, sources_opened from public.share_decisions where session_id = '${sid}'`)[0]
  expect(r.state).toBe('E5')
  expect(r.sources_opened).toEqual(['medio'])
  sqlExec(`update public.participant_sessions set is_test = true where id = '${sid}'`)
})
