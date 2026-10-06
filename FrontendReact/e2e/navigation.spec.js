import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { registerRider, deleteRider } from './helpers.js';

test.describe('Autenticazione e navigazione (backend reale)', () => {
  test('un utente non autenticato viene portato al login', async ({ page }) => {
    await page.goto('/statistiche');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('.auth-btn-primary')).toBeVisible();
  });

  test('un rider registrato naviga tra le pagine principali con i suoi dati', async ({ page }) => {
    const rider = await registerRider(page, { name: 'Giulia', surname: 'Neri', gender: 'F', birthDate: '1995-06-20' });
    try {
      await page.goto('/');
      await expect(page.getByText('Ciao, Giulia!')).toBeVisible();
      await expect(page.locator('.dev-toolbar')).toHaveCount(0); // build per gli utenti: niente barra di sviluppo

      await page.getByRole('button', { name: 'Telemetria' }).click();
      await expect(page).toHaveURL(/\/statistiche$/);
      await expect(page.getByText('Sommario')).toBeVisible();

      await page.goto('/percorsi');
      await expect(page.getByText('Nessun percorso registrato')).toBeVisible();

      await page.goto('/consegne');
      await expect(page.getByText('consegne oggi')).toBeVisible();

      await page.goto('/notifiche');
      await expect(page.getByText(/Qui arriveranno nuovi ordini/)).toBeVisible();

      await page.goto('/gruppi');
      await expect(page.getByText('Non fai ancora parte di nessun gruppo')).toBeVisible();

      await page.goto('/profilo');
      await expect(page.getByText(rider.email).first()).toBeVisible();

      // il vecchio hub con statistiche inventate porta all'elenco reale delle bici
      await page.goto('/tazzoli-13-hub');
      await expect(page).toHaveURL(/\/bici$/);
    } finally {
      await deleteRider(page, rider);
    }
  });

  test('Privacy: il file scaricato contiene i dati reali dell\'account (GDPR)', async ({ page }) => {
    const rider = await registerRider(page, { name: 'Sara', surname: 'Galli', gender: 'F', birthDate: '1991-09-09' });
    try {
      await page.goto('/privacy');
      await expect(page.getByText('Titolare del trattamento', { exact: true })).toBeVisible();
      await expect(page.getByText('180 giorni')).toBeVisible(); // tempi di conservazione dal server (NOTIFICATION_RETENTION_DAYS)
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: 'Scarica i miei dati (JSON)' }).click()
      ]);
      const data = JSON.parse(await readFile(await download.path(), 'utf8'));
      expect(data.format).toBe('ror-personal-data-export');
      expect(data.account.email).toBe(rider.email);
      expect(data.account.first_name).toBe('Sara');
      expect(JSON.stringify(data)).not.toMatch(/Kasko|Blockchain/);
    } finally {
      await deleteRider(page, rider);
    }
  });
});
