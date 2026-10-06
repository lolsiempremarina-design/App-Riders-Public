import { test, expect } from '@playwright/test';

// Il certificato di sviluppo è autofirmato: senza questo flag il browser non registra il service worker.
test.use({ launchOptions: { args: ['--ignore-certificate-errors'] } });

test.describe('PWA (app installata sul telefono)', () => {
  test('dopo la prima visita l\'app si apre anche senza rete', async ({ page, context }) => {
    await page.goto('/info');
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    // la precache di Workbox deve contenere la pagina (se fallisce resta vuota e l'app non si apre offline)
    await expect.poll(async () => page.evaluate(async () => {
      const names = await caches.keys();
      return names.some((name) => name.startsWith('workbox-precache'));
    }), { timeout: 15000 }).toBe(true);
    await page.reload();

    await context.setOffline(true);
    await page.goto('/info');
    await expect(page.getByText('Come funziona RoR')).toBeVisible();
    await expect(page.getByText('Sei offline')).toBeVisible();
    await context.setOffline(false);
  });
});

test.describe("Aggiornamento del server con l'app aperta", () => {
  // senza service worker la richiesta del file arriva alla rete e si può far mancare (con il service worker
  // succede lo stesso dopo che la versione nuova ha tolto dalla cache i file di quella precedente)
  test.use({ serviceWorkers: 'block' });

  test("una pagina della versione precedente che non c'è più ricarica l'app invece di mostrare l'errore", async ({ page }) => {
    await page.goto('/info');
    await expect(page.getByText('Come funziona RoR')).toBeVisible();
    await page.evaluate(() => { window.__versionePrecedente = true; });

    // il file della pagina di login della versione caricata non esiste più sul server (404 di Nginx)
    // finché la pagina non si ricarica; dopo la ricarica arriva quello giusto
    let reloaded = false;
    page.on('request', (request) => { if (request.resourceType() === 'document') reloaded = true; });
    await page.route(/\/assets\/Login-[\w-]+\.js$/, (route) => (reloaded
      ? route.continue()
      : route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not Found' })));

    // navigazione dentro l'app, come un tocco su un link: nessun caricamento della pagina
    await page.evaluate(() => {
      window.history.pushState({}, '', '/login');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    await expect(page.locator('.auth-btn-primary')).toBeVisible();
    expect(reloaded).toBe(true);
    expect(await page.evaluate(() => window.__versionePrecedente)).toBeUndefined();
    await expect(page.getByRole('heading', { name: 'Si è verificato un imprevisto' })).toHaveCount(0);
  });
});
