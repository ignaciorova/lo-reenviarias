import { readFileSync } from 'node:fs'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { hasDb, sql, sqlExec } from './helpers'

// Panel de la 4.0.0 contra un entorno local con la 4.0.0 activa (E2E_V4=1, E2E_LOCAL_DB=lr_e2e4, E2E_TOKEN_DIR con los JWT locales).
// Las partidas se crean por la API pública (las mismas funciones que usa el teléfono) y las cifras del panel se comparan con SQL independiente.
test.skip(!process.env.E2E_V4 || !hasDb() || !process.env.E2E_TOKEN_DIR, 'requiere entorno local con la 4.0.0 activa')

const tok = (name: string) => readFileSync(`${process.env.E2E_TOKEN_DIR}/${name}.jwt`, 'utf8').trim()
const OWNER = ['00000000-0000-4000-8000-0000000000aa', 'owner-e2e@test.local'] as const
const VIEWER = ['00000000-0000-4000-8000-0000000000cc', 'viewer-e2e@test.local'] as const

async function rpc(req: APIRequestContext, fn: string, body: Record<string, unknown>) {
  const r = await req.post(`/rest/v1/rpc/${fn}`, { data: body, headers: { apikey: tok('anon'), Authorization: `Bearer ${tok('anon')}` } })
  if (!r.ok()) throw new Error(`${fn}: ${r.status()} ${await r.text()}`)
  return r.json()
}

type Plan = { action: 'reenviar' | 'reenviar_aviso' | 'no_reenviar' | 'verificar' | 'timeout'; final?: 'reenviar' | 'reenviar_aviso' | 'no_reenviar'; effective?: boolean; belief: 'si' | 'no' | 'no_se' }

/**
 * Juega una partida completa por la API. Devuelve el id de sesión.
 * La API responde en milisegundos; desde 20261011000400 eso es una señal de actividad automatizada. Salvo con
 * { script: true }, antes de cerrar se simula en la base el ritmo de una persona (horas del servidor).
 */
async function play(req: APIRequestContext, plan: Plan[], opts: { first?: boolean; script?: boolean } = {}) {
  const sid = crypto.randomUUID()
  const p = await rpc(req, 'start_session_v4', { p_session_id: sid, p_consent: true, p_device_class: 'mobile', p_reduced_motion: false, p_entry_origin: 'qr_juego',
    p_survey_intent: null, p_survey_code: null, p_study_code: 'lo-reenviarias', p_device_replay: false })
  await rpc(req, 'submit_survey', { p_session_id: sid, p_phase: 'pre', p_answers: { primera_vez: opts.first === false ? 'No, ya había jugado' : 'Sí, es la primera vez' } })
  for (let i = 0; i < 10; i++) {
    const it = p.items[i] as { position: number; item_id: string }
    const step = plan[i]
    let card: Record<string, unknown>
    if (step.action === 'timeout') card = { first_action: null, first_action_ms: 20000 }
    else if (step.action !== 'verificar') card = { first_action: step.action, first_action_ms: 4000, belief: step.belief }
    else {
      await rpc(req, 'open_source', { p_session_id: sid, p_position: it.position, p_kind: 'medio' })
      // La lectura la mide el servidor desde la primera apertura: se adelanta la apertura para simular 5 s de lectura
      sqlExec(`update public.source_opens set opened_at = opened_at - interval '5 seconds' where session_id = '${sid}' and position = ${it.position}`)
      const says = sql<{ says: string }>(`select s ->> 'says' as says from public.news_items n, jsonb_array_elements(n.consult_sources) s where n.id = '${it.item_id}' and s ->> 'kind' = 'medio'`)[0].says
      const wrong = says === 'confirma' ? 'desmiente' : 'confirma'
      card = { first_action: 'verificar', first_action_ms: 3000, source_kind: 'medio', read_ms: 4500, evaluation: step.effective ? says : wrong, final_action: step.final, belief: step.belief }
    }
    await rpc(req, 'submit_card', { p_session_id: sid, p_position: it.position, p_card: card })
  }
  if (!opts.script) {
    sqlExec(`update public.participant_sessions set game_started_at = now() - interval '5 minutes' where id = '${sid}'`)
    sqlExec(`update public.share_decisions set created_at = now() - interval '5 minutes' + (position * 20 + (position % 4) * 3) * interval '1 second' where session_id = '${sid}'`)
  }
  await rpc(req, 'complete_session_v4', { p_session_id: sid })
  return sid
}

/** Sesiones con señales que las sacan del análisis (sin revisión «humana»), según la tabla del servidor. */
const NOT_FLAGGED = `not exists (select 1 from public.session_integrity i where i.session_id = ps.id
  and i.automation_signals && array['partida_rapida','decisiones_rapidas','ritmo_constante'] and i.review is distinct from 'humana')`

const P = (s: string): Plan[] => s.split(' ').map((t) => {
  const b = 'si' as const
  switch (t) {
    case 'R': return { action: 'reenviar', belief: b }
    case 'A': return { action: 'reenviar_aviso', belief: 'no_se' }
    case 'N': return { action: 'no_reenviar', belief: 'no' }
    case 'T': return { action: 'timeout', belief: b }
    case 'V': return { action: 'verificar', final: 'no_reenviar', effective: true, belief: 'no' }
    case 'v': return { action: 'verificar', final: 'reenviar', effective: false, belief: b }
    default: throw new Error(t)
  }
})

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
const pct = (x: number) => `${(x * 100).toLocaleString('es-CR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`

test.describe.configure({ mode: 'serial' })

test('panel 4.x: indicador principal, límites y secundarios coinciden con SQL; la encuesta aparece aparte, sin vincular', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'escritorio', 'los datos se crean una sola vez')
  await play(request, P('R R A N N V v T N R'))
  await play(request, P('N N N N N V V V A R'))
  await play(request, P('R R R R R R R A A T'))
  await play(request, P('T T T T T T T T T T'))                          // todo agotado: fuera, se cuenta aparte
  await play(request, P('R R R R R R R R R R'), { first: false })         // repetición: fuera del análisis principal
  const bot = await play(request, P('R R R R R R R R R R'), { script: true }) // a velocidad de máquina: señales, fuera del análisis
  expect(sql<{ s: string[] }>(`select automation_signals as s from public.session_integrity where session_id = '${bot}'`)[0].s).toEqual(expect.arrayContaining(['decisiones_rapidas']))

  // SQL independiente, desde las tablas (no desde las vistas del panel)
  const [x] = sql<{ n: number; main: number; lo: number; hi: number; ver: number; eff: number; nose: number; aviso: number }>(`
    with s as (
      select ps.id,
        count(*) filter (where d.state in ('E1','E2'))::numeric as unv,
        count(*) filter (where d.state between 'E1' and 'E6')::numeric as r,
        count(*) filter (where d.state = 'E7')::numeric as e7,
        count(*) filter (where d.state in ('E4','E5','E6'))::numeric as ver,
        count(*) filter (where d.effective_verification)::numeric as eff,
        count(*) filter (where d.belief = 'no_se')::numeric as nose,
        count(*) filter (where d.state in ('E2','E5'))::numeric as aviso,
        count(*) filter (where d.state in ('E1','E2','E4','E5'))::numeric as shared
      from public.participant_sessions ps join public.share_decisions d on d.session_id = ps.id
      where ps.status = 'completed' and not ps.is_test and ps.exclusion_reason is null and not coalesce(ps.device_replay, false) and ${NOT_FLAGGED}
        and exists (select 1 from public.survey_responses sr join public.survey_questions q on q.id = sr.question_id
                     where sr.session_id = ps.id and q.question_key = 'primera_vez' and sr.option_value like 'Sí%')
      group by ps.id having count(*) filter (where d.state between 'E1' and 'E6') > 0)
    select count(*)::int as n, avg(unv / r)::float as main, avg(unv / (r + e7))::float as lo, avg((unv + e7) / (r + e7))::float as hi,
           avg(ver / r)::float as ver, avg(eff / r)::float as eff, avg(nose / r)::float as nose, avg(aviso / nullif(shared, 0))::float as aviso from s`)
  expect(x.n).toBeGreaterThanOrEqual(3)

  await loginAs(page, tok('owner'), ...OWNER)
  await go(page, 'Responsabilidad (4.x)')
  await expect(page.getByRole('heading', { name: /Responsabilidad antes de compartir/ })).toBeVisible()
  const main = page.locator('div').filter({ hasText: /^Indicador principal/ }).first()
  await expect(main).toContainText(pct(x.main))
  await expect(main).toContainText(`n = ${x.n}`)
  const kpi = (label: string) => page.locator('div.rounded-xl').filter({ has: page.getByText(label, { exact: true }) })
  await expect(kpi('Límite inferior por tiempo agotado')).toContainText(pct(x.lo))
  await expect(kpi('Límite superior por tiempo agotado')).toContainText(pct(x.hi))
  await expect(kpi('Inició una consulta')).toContainText(pct(x.ver))
  await expect(kpi('Verificación efectiva')).toContainText(pct(x.eff))
  await expect(kpi('Dijo «No sé»')).toContainText(pct(x.nose))
  await expect(kpi('Compartió con aviso')).toContainText(pct(x.aviso))
  await expect(page.getByText('sin ninguna respuesta (todo E7)')).toBeVisible()

  // Integridad: la partida guiada por un script se cuenta aparte y se puede revisar
  const flagged = sql<{ n: number }>(`select count(*)::int as n from public.participant_sessions ps join public.studies st on st.id = ps.study_id
    where st.config ->> 'mode' = 'responsabilidad' and not ${NOT_FLAGGED}`)[0].n
  expect(flagged).toBeGreaterThanOrEqual(1)
  await expect(page.getByRole('heading', { name: `Actividad automatizada: ${flagged} ${flagged === 1 ? 'partida marcada' : 'partidas marcadas'}` })).toBeVisible()
  await expect(page.getByText('con señales de actividad automatizada')).toBeVisible()
  await expect(page.locator('li').filter({ hasText: bot.slice(0, 8) })).toContainText('varias decisiones seguidas demasiado rápidas')

  // Sin el filtro de primeras partidas entra la repetición
  await page.getByLabel('Solo primeras partidas (análisis principal)').uncheck()
  const nAll = sql<{ n: number }>(`select count(*)::int as n from public.participant_sessions ps where ps.status = 'completed' and not ps.is_test and ps.exclusion_reason is null and ${NOT_FLAGGED}
    and (select count(*) from public.share_decisions d where d.session_id = ps.id and d.state between 'E1' and 'E6') > 0
    and ps.study_id in (select id from public.studies where config ->> 'mode' = 'responsabilidad')`)[0].n
  expect(nAll).toBeGreaterThan(x.n)
  await expect(main).toContainText(`n = ${nAll}`)
  await page.getByLabel('Solo primeras partidas (análisis principal)').check()

  // Encuesta: instrumento independiente, en una sección aparte y sin carga de archivos ni unión por persona
  await expect(page.getByRole('heading', { name: 'Encuesta de hábitos: instrumento independiente' })).toBeVisible()
  await expect(page.getByText(/no se vincula/)).toBeVisible()
  await expect(page.locator('input[type=file]')).toHaveCount(0)
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/escritorio-10-panel.png`, fullPage: true })

  // Exportación: CSV de participantes con las mismas sesiones que la vista y registro de auditoría
  const before = sql<{ n: number }>(`select count(*)::int as n from public.audit_events where action = 'export'`)[0].n
  const dl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Participantes (CSV)' }).click()
  const file = await (await dl).path()
  const lines = readFileSync(file, 'utf8').trim().split(/\r\n/)
  const total = sql<{ n: number }>(`select count(*)::int as n from public.v_share_sessions`)[0].n
  expect(lines.length - 1).toBe(total)
  expect(lines[0]).toContain('"difusion_sin_verificar"')
  expect(lines[0]).not.toContain('codigo_encuesta')
  expect(lines[0]).toContain('"senales_automatizacion"')
  await expect.poll(() => sql<{ n: number }>(`select count(*)::int as n from public.audit_events where action = 'export'`)[0].n).toBe(before + 1)
  // La auditoría la escribe el servidor, con el número de filas que realmente entregó y la persona
  const audit = sql<{ rows: number; via: string; actor: string; dataset: string }>(`select (details ->> 'rows')::int as rows, details ->> 'via' as via, actor_id::text as actor, target_id as dataset
    from public.audit_events where action = 'export' order by id desc limit 1`)[0]
  expect(audit).toEqual({ rows: total, via: 'export_dataset', actor: OWNER[0], dataset: 'v4_sesiones' })
})

test('viewer: ve el panel 4.x pero no exporta ni lee texto libre', async ({ page }, info) => {
  test.skip(info.project.name !== 'escritorio', 'una sola vez')
  const before = sql<{ n: number }>(`select count(*)::int as n from public.audit_events where action = 'export'`)[0].n
  await loginAs(page, tok('viewer'), ...VIEWER)
  await go(page, 'Responsabilidad (4.x)')
  await expect(page.getByText('Indicador principal')).toBeVisible()
  await expect(page.getByRole('heading', { name: /^Actividad automatizada/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Revisada: es humana' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Participantes (CSV)' })).toBeDisabled()
  await expect(page.getByText(/no descargar datos/).first()).toBeVisible()
  await go(page, 'Exportar')
  await expect(page.getByRole('button', { name: 'Dataset por participante' })).toBeDisabled()
  await go(page, 'Preguntas abiertas')
  await expect(page.getByText(/solo las ven los roles analyst y owner/)).toBeVisible()
  // Por la API tampoco: el servidor rechaza la exportación
  const r = await page.request.post('/rest/v1/rpc/export_dataset', { data: { p_dataset: 'v4_sesiones', p_filters: {} }, headers: { apikey: tok('anon'), Authorization: `Bearer ${tok('viewer')}` } })
  expect(r.status()).toBeGreaterThanOrEqual(400)
  expect(sql<{ n: number }>(`select count(*)::int as n from public.audit_events where action = 'export'`)[0].n).toBe(before)
})

test('fuentes de una noticia: owner edita, viewer solo ve', async ({ page }, info) => {
  test.skip(info.project.name !== 'escritorio', 'una sola vez')
  const rev = sql<{ revision: number }>(`select revision from public.news_bank where item_key = 'f_sinpe'`)[0].revision
  await loginAs(page, tok('owner'), ...OWNER)
  await go(page, 'Banco de noticias')
  const row = page.locator('li').filter({ hasText: 'SINPE Móvil cobrará' })
  await expect(row.getByText('3 fuentes (4.x)')).toBeVisible()
  await row.getByRole('button', { name: 'Fuentes' }).click()
  await expect(page.getByRole('heading', { name: 'Fuentes para verificar' })).toBeVisible()
  const oficial = page.locator('section').filter({ hasText: '🏛️ Fuente oficial' })
  const text = 'Extracto de prueba E2E: el BCCR no anunció ningún cobro nuevo por SINPE Móvil.'
  await oficial.getByLabel(/Extracto que se muestra/).fill(text)
  await page.getByRole('button', { name: 'Guardar fuentes' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Fuentes guardadas' })).toBeVisible()
  const after = sql<{ revision: number; excerpt: string; n: number }>(`select revision, (select s ->> 'excerpt' from jsonb_array_elements(consult_sources) s where s ->> 'kind' = 'oficial') as excerpt, jsonb_array_length(consult_sources) as n from public.news_bank where item_key = 'f_sinpe'`)[0]
  expect(after).toEqual({ revision: rev + 1, excerpt: text, n: 3 })
  // La versión activa no cambia: la edición entra solo al armar una versión nueva
  const active = sql<{ excerpt: string }>(`select (select s ->> 'excerpt' from jsonb_array_elements(n.consult_sources) s where s ->> 'kind' = 'oficial') as excerpt from public.news_items n join public.studies st on st.id = n.study_id where st.status = 'active' and n.item_key = 'f_sinpe'`)[0]
  expect(active.excerpt).not.toBe(text)

  await page.getByRole('button', { name: 'Salir' }).click()
  await loginAs(page, tok('viewer'), ...VIEWER)
  await go(page, 'Banco de noticias')
  await page.locator('li').filter({ hasText: 'SINPE Móvil cobrará' }).getByRole('button', { name: 'Fuentes' }).click()
  await expect(page.getByText('Tu rol (viewer) permite ver, no editar.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Guardar fuentes' })).toHaveCount(0)
})

test('panel 4.x en el teléfono: se lee sin desbordes', async ({ page }, info) => {
  test.skip(info.project.name !== 'movil', 'vista móvil')
  await loginAs(page, tok('owner'), ...OWNER)
  await go(page, 'Responsabilidad (4.x)')
  await expect(page.getByText('Indicador principal')).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/movil-10-panel.png`, fullPage: false })
})
