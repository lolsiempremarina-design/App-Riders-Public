/**
 * Test unitari per il client API HTTP (apiClient) di RoR.
 * Verifica il comportamento del client con mock a livello di rete isolato:
 * - Invio dei cookie di sessione (credentials: 'include') senza token JWT
 * - Gestione della sessione scaduta (401 Unauthorized → evento ror:unauthorized)
 * - Rilevamento e rilancio di errori descrittivi dal backend
 * - Gestione delle risposte HTTP 204 No Content
 * - Serializzazione automatica dei payload JSON
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient, setCsrfToken } from '../services/api';

// Mock globale per fetch
global.fetch = vi.fn();

describe('API Client HTTP Tests (apiClient)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setCsrfToken('csrf-test');
  });

  it('dovrebbe inviare i cookie di sessione senza header Authorization', async () => {
    fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true }) });

    await apiClient('/test-endpoint');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/test-endpoint'),
      expect.objectContaining({ credentials: 'include' })
    );
    expect(fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('dovrebbe emettere ror:unauthorized quando la sessione è scaduta (401)', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'unauthorized', message: 'Authentication required.' })
    });

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    await expect(apiClient('/secure-endpoint')).rejects.toThrow('Authentication required.');
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'ror:unauthorized' }));
  });

  it('dovrebbe lanciare un errore descrittivo quando lo status HTTP non è ok', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({ message: 'Dati di input non validi' })
    });

    await expect(apiClient('/error-endpoint')).rejects.toThrow('Dati di input non validi');
  });

  it('dovrebbe restituire null in caso di risposta 204 No Content', async () => {
    fetch.mockResolvedValueOnce({ ok: true, status: 204 });

    const result = await apiClient('/empty-endpoint');
    expect(result).toBeNull();
  });

  it('dovrebbe serializzare in JSON il body e inviare il token CSRF', async () => {
    fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });

    const bodyPayload = { riderId: 'ROR-2026', batteryLevel: 94 };
    await apiClient('/telemetry/submit', { method: 'POST', body: bodyPayload });

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify(bodyPayload),
        headers: expect.objectContaining({ 'X-CSRFToken': 'csrf-test', 'Content-Type': 'application/json' })
      })
    );
  });
});
