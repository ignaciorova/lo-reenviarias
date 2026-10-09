import { defineConfig, devices } from '@playwright/test'

// E2E contra un entorno local (PostgreSQL + PostgREST + Vite) o contra una URL desplegada (E2E_BASE_URL).
const exe = process.env.PW_CHROMIUM_PATH
export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/e2e.json' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    screenshot: 'only-on-failure',
    launchOptions: exe ? { executablePath: exe } : {},
  },
  projects: [
    { name: 'movil', use: { ...devices['Pixel 7'], launchOptions: exe ? { executablePath: exe } : {} } },
    { name: 'escritorio', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 860 }, launchOptions: exe ? { executablePath: exe } : {} } },
  ],
})
