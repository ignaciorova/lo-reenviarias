import { execFileSync } from 'node:child_process'
import { expect, type Page } from '@playwright/test'

/** Consulta SQL independiente contra la base local de pruebas (E2E_LOCAL_DB=lr_e2e). Devuelve filas JSON. */
export function sql<T = Record<string, unknown>>(query: string): T[] {
  const db = process.env.E2E_LOCAL_DB
  if (!db) throw new Error('E2E_LOCAL_DB no definido')
  const out = execFileSync('su', ['postgres', '-c', `psql -d ${db} -tAX -v ON_ERROR_STOP=1`], { input: `select coalesce(json_agg(t), '[]') from (${query}) t;` }).toString().trim()
  return JSON.parse(out) as T[]
}
export const hasDb = () => Boolean(process.env.E2E_LOCAL_DB)

export async function startAndAnswerOpinion(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Acepto y quiero jugar' }).click()
  await expect(page.getByRole('heading', { name: 'Primero, tu opinión honesta' })).toBeVisible()
  const toGame = page.getByRole('button', { name: 'Empezar el juego' })
  await expect(toGame).toBeDisabled()
  await page.getByLabel(/noticia impactante/).fill('Primero busco la fuente en un medio confiable.')
  await page.getByRole('radio', { name: 'A veces' }).click()
  await page.getByRole('radio', { name: 'No estoy seguro/a' }).click()
  await page.getByRole('radio', { name: 'Todos por igual' }).click()
  await expect(toGame).toBeEnabled()
  await toGame.click()
  await expect(page.getByText('Noticia 1 de 10')).toBeVisible()
  return (await page.evaluate(() => localStorage.getItem('lr_session_v2')))!
}

/** Decide la noticia actual y cierra la hoja de retroalimentación. */
export async function decideCurrent(page: Page, how: 'real' | 'falsa' | 'swipe-right' | 'swipe-left' | 'key-right' | 'key-left', n: number) {
  await expect(page.getByText(`Noticia ${n} de 10`)).toBeVisible()
  if (how === 'real') await page.getByRole('button', { name: /^Real/ }).click()
  if (how === 'falsa') await page.getByRole('button', { name: /^👈 Falsa/ }).click()
  if (how === 'key-right') await page.keyboard.press('ArrowRight')
  if (how === 'key-left') await page.keyboard.press('ArrowLeft')
  if (how.startsWith('swipe')) {
    const card = page.locator('h2').filter({ hasNotText: /^$/ }).last()
    const box = (await card.boundingBox())!
    const x = box.x + box.width / 2, y = box.y + box.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    const dx = how === 'swipe-right' ? 160 : -160
    for (let i = 1; i <= 8; i++) await page.mouse.move(x + (dx * i) / 8, y)
    await page.mouse.up()
  }
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: n < 10 ? 'Siguiente noticia' : 'Terminar' }).click()
}

/** Ejecuta una sentencia SQL sin resultado (solo entorno local). */
export function sqlExec(statement: string): void {
  const db = process.env.E2E_LOCAL_DB
  if (!db) throw new Error('E2E_LOCAL_DB no definido')
  execFileSync('su', ['postgres', '-c', `psql -d ${db} -qX -v ON_ERROR_STOP=1`], { input: `${statement};` })
}
