import { test, expect } from '@playwright/test';
import { registerRider, deleteRider, api } from './helpers.js';

test.describe('Chat di gruppo in tempo reale (WebSocket)', () => {
  test('un messaggio arriva all\'altro membro senza ricaricare', async ({ browser }) => {
    const contextA = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
    const contextB = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    let riderA;
    let riderB;
    try {
      riderA = await registerRider(pageA, { name: 'Marco', surname: 'Rossi' });
      riderB = await registerRider(pageB, { name: 'Sara', surname: 'Galli', gender: 'F', birthDate: '1994-09-02' });
      const group = await api(pageA.request, 'POST', '/api/groups', { name: 'E2E Navigli' });
      await api(pageB.request, 'POST', '/api/groups/join', { code: group.code });

      await pageA.goto(`/gruppo-chat?id=${group.id}`);
      await pageB.goto(`/gruppo-chat?id=${group.id}`);
      await expect(pageA.getByText('In tempo reale')).toBeVisible({ timeout: 15000 });
      await expect(pageB.getByText('In tempo reale')).toBeVisible({ timeout: 15000 });

      const text = `Arrivo tra 5 minuti ${Date.now().toString(36)}`;
      await pageA.getByLabel('Testo del messaggio').fill(text);
      await pageA.getByRole('button', { name: 'Invia' }).click();

      await expect(pageB.getByText(text)).toBeVisible({ timeout: 10000 });
      await expect(pageA.getByText(text)).toBeVisible();

      // la risposta torna indietro in tempo reale
      await pageB.getByLabel('Testo del messaggio').fill('Ricevuto!');
      await pageB.getByRole('button', { name: 'Invia' }).click();
      await expect(pageA.getByText('Ricevuto!')).toBeVisible({ timeout: 10000 });

      // e resta nello storico dopo il ricaricamento
      await pageB.reload();
      await expect(pageB.getByText(text)).toBeVisible();
    } finally {
      await deleteRider(pageA, riderA);
      await deleteRider(pageB, riderB);
      await contextA.close();
      await contextB.close();
    }
  });
});
