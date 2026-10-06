import { test, expect } from '@playwright/test';
import { api, registerRider, deleteRider, deleteTestOrder, grantAdmin } from './helpers.js';

test.describe('Consegne: dal pannello admin al rider', () => {
  test('l\'admin crea un ordine e il rider lo accetta, ritira e consegna', async ({ browser }) => {
    const adminContext = await browser.newContext({ ignoreHTTPSErrors: true });
    const riderContext = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
    const adminPage = await adminContext.newPage();
    const riderPage = await riderContext.newPage();
    let admin;
    let rider;
    const restaurant = `Trattoria E2E ${Date.now().toString(36)}`;
    try {
      admin = await registerRider(adminPage, { name: 'Anna', surname: 'Bianchi', gender: 'F', birthDate: '1988-02-11' });
      rider = await registerRider(riderPage);
      grantAdmin(admin.email);

      // Il pannello usa l'accesso dell'app: senza sessione rimanda a /accedi e dopo il login torna qui
      await api(adminPage.request, 'POST', '/api/auth/logout');
      await adminPage.goto('/web/admin/orders/new');
      await expect(adminPage).toHaveURL(/\/accedi\?next=/);
      await adminPage.locator('#login-email').fill(admin.email);
      await adminPage.locator('#login-password').fill(admin.password);
      await adminPage.locator('button[type="submit"]').click();
      await adminPage.getByRole('button', { name: 'Accedi alla Dashboard' }).click();
      await expect(adminPage).toHaveURL(/\/web\/admin\/orders\/new$/);

      await adminPage.getByLabel('Locale / ristorante').fill(restaurant);
      await adminPage.getByLabel('Indirizzo di ritiro').fill('Via Roma 1, Milano');
      await adminPage.getByLabel('Indirizzo di consegna').fill('Via Po 9, Milano');
      await adminPage.getByLabel('Compenso (€)').fill('6.50');
      await adminPage.getByLabel('Bonus (€)').fill('1.50');
      await adminPage.getByLabel(/Consegna promessa entro/).fill('45');
      await adminPage.getByRole('button', { name: 'Crea ordine' }).click();
      await expect(adminPage.getByText(/creato e notificato/)).toBeVisible();

      await riderPage.goto('/consegne');
      const card = riderPage.getByRole('article', { name: restaurant });
      await expect(card).toBeVisible();
      await card.getByRole('button', { name: 'Accetta ordine' }).click();
      await expect(riderPage.getByText('Fase 1 di 2 • Ritiro')).toBeVisible();
      await riderPage.getByRole('button', { name: 'Conferma ritiro' }).click();
      await expect(riderPage.getByText('Fase 2 di 2 • Consegna')).toBeVisible();
      await riderPage.getByRole('button', { name: 'Conferma consegna' }).click();
      await expect(riderPage.getByText('Consegna completata ✅')).toBeVisible();
      await riderPage.keyboard.press('Escape');

      await riderPage.goto('/consegne');
      await expect(riderPage.locator('.consegne-hero-number')).toHaveText('1');
      await expect(riderPage.getByText('€8.00').first()).toBeVisible();

      await riderPage.goto('/notifiche');
      await expect(riderPage.getByText(`Nuovo ordine: ${restaurant}`)).toBeVisible();

      await adminPage.goto('/web/admin/?status=delivered');
      await expect(adminPage.getByRole('cell', { name: restaurant })).toBeVisible();
    } finally {
      deleteTestOrder(restaurant);
      await deleteRider(riderPage, rider);
      // se il test si è fermato prima del login dal form, l'admin non ha più la sessione
      if (admin) await api(adminPage.request, 'POST', '/api/auth/login', { identity: admin.email, password: admin.password }).catch(() => {});
      await deleteRider(adminPage, admin);
      await adminContext.close();
      await riderContext.close();
    }
  });
});
