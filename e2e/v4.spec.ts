import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
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

test('partida 4.0.0 completa: decisiones, verificación, creencia y resultado', async ({ page }) => {
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

  // La encuesta es un instrumento independiente: el resultado no la ofrece ni pide códigos
  await expect(page.getByText(/encuesta/i)).toHaveCount(0)
  await expect(page.getByRole('textbox')).toHaveCount(0)

  // Recargar la página final la muestra igual (persistencia)
  await page.reload()
  await expect(page.getByText('adivinaste si eran reales')).toBeVisible()
})

test('sin vinculación con la encuesta: la portada no pide código y no se guarda ninguno', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /reenviarías/ })).toBeVisible()
  await expect(page.getByText(/encuesta/i)).toHaveCount(0)
  await expect(page.getByRole('textbox')).toHaveCount(0)
  // Quien llega con ?origen=encuesta solo queda registrado como canal de entrada
  const sid = await startV4(page, '/?origen=encuesta')
  const s = sql<{ entry_origin: string; survey_code: string | null; survey_intent: string | null }>(`select entry_origin, survey_code, survey_intent from public.participant_sessions where id = '${sid}'`)[0]
  expect(s).toEqual({ entry_origin: 'encuesta', survey_code: null, survey_intent: null })
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

test('partida guiada por un script: termina igual, pero no entra al ranking (mensaje neutro)', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'movil', 'una sola vez')
  const anon = readFileSync(`${process.env.E2E_TOKEN_DIR}/anon.jwt`, 'utf8').trim()
  const rpc = async (fn: string, body: Record<string, unknown>) => {
    const r = await request.post(`/rest/v1/rpc/${fn}`, { data: body, headers: { apikey: anon, Authorization: `Bearer ${anon}` } })
    expect(r.ok(), `${fn}: ${await r.text()}`).toBeTruthy()
    return r.json()
  }
  // 10 tarjetas en milisegundos por la API pública, sin pasar por la interfaz
  const sid = crypto.randomUUID()
  const p = await rpc('start_session_v4', { p_session_id: sid, p_consent: true, p_device_class: 'mobile', p_reduced_motion: false, p_entry_origin: 'enlace',
    p_survey_intent: null, p_survey_code: null, p_study_code: 'lo-reenviarias', p_device_replay: false })
  await rpc('submit_survey', { p_session_id: sid, p_phase: 'pre', p_answers: { primera_vez: 'Sí, es la primera vez' } })
  for (const it of p.items as { position: number }[]) await rpc('submit_card', { p_session_id: sid, p_position: it.position, p_card: { first_action: 'reenviar', first_action_ms: 3000, belief: 'si' } })
  const summary = await rpc('complete_session_v4', { p_session_id: sid })
  expect(summary.score).toBeGreaterThan(0)

  await page.goto('/')
  await page.evaluate((id) => localStorage.setItem('lr_session_v4', id), sid)
  await page.reload()
  await expect(page.getByText('adivinaste si eran reales')).toBeVisible()
  await expect(page.getByText(String(summary.score), { exact: true })).toBeVisible()
  const board = page.getByRole('region', { name: '🏆 Ranking' })
  await expect(board.getByText('Esta partida no entra en el ranking.')).toBeVisible()
  await expect(board.getByRole('button', { name: 'Entrar al ranking (opcional)' })).toHaveCount(0)
  await expect(board).not.toContainText(/automat|bot|script|sospech/i)
  sqlExec(`update public.participant_sessions set is_test = true where id = '${sid}'`)
})
