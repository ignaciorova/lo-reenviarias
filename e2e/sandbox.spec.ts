import { test, expect } from '@playwright/test'

// Sandbox 3.0.0 (solo en la rama claude/sandbox-noticias-ilustradas): no debe llamar a Supabase ni guardar nada.
test('sandbox de noticias ilustradas: ronda completa sin llamadas al servidor', async ({ page }) => {
  const external: string[] = []
  page.on('request', (r) => { if (/\/(rest|auth)\/v1\//.test(r.url()) || !r.url().startsWith(new URL(page.url() || 'http://x').origin)) external.push(r.url()) })
  await page.goto('/sandbox')
  external.length = 0
  await page.getByRole('button', { name: 'Jugar con imágenes' }).click()
  await expect(page.getByRole("img", { name: /bus blanco y verde/ })).toBeVisible()
  await page.getByRole('button', { name: /Real/ }).click()
  await expect(page.getByRole('heading', { name: '¡Bien! Era real' })).toBeVisible()
  await page.getByRole('button', { name: 'Siguiente noticia' }).click()
  await page.getByRole('button', { name: /Falsa/ }).click()
  await page.getByRole('button', { name: 'Siguiente noticia' }).click()
  const video = page.locator('video')
  await expect(video).toHaveJSProperty('muted', true)
  await page.getByRole('button', { name: /Real/ }).click()
  await page.getByRole('button', { name: 'Siguiente noticia' }).click()
  await page.getByRole('button', { name: /Falsa/ }).click()
  await page.getByRole('button', { name: 'Terminar' }).click()
  await expect(page.getByText('Con imágenes: 4 de 4 correctas')).toBeVisible()
  await page.getByRole('button', { name: 'Jugar sin imágenes (versión actual)' }).click()
  await expect(page.getByRole("img", { name: /bus blanco y verde/ })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: /pasaje de una ruta de bus/ })).toBeVisible()
  expect(external).toEqual([])
})
