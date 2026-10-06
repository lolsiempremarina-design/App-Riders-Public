import { defineConfig, devices } from '@playwright/test';

/**
 * Test end-to-end contro lo stack Docker reale (https://localhost: Nginx + React + Flask + FastAPI).
 * Prima: `docker compose up --build` in backend/. Nessuna sessione finta: ogni test crea i suoi
 * utenti tramite l'API e li elimina alla fine.
 *
 * Variabili: E2E_BASE_URL (predefinito https://localhost),
 *            E2E_BROWSER_CHANNEL (es. "msedge" per usare Edge installato senza scaricare browser).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'https://localhost',
    ignoreHTTPSErrors: true, // certificati di sviluppo autofirmati
    locale: 'it-IT',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'telefono',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        channel: process.env.E2E_BROWSER_CHANNEL || undefined
      }
    }
  ]
});
