import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  apiClient,
  api,
  ApiError,
  getCsrfToken,
  setCsrfToken,
  snakeToCamel,
  normalizeData,
  setApiLanguage
} from '../api';
import {
  authService, mapUserToProfile, authErrorMessage, fieldErrorsToList, REGISTRATION_FIELD_LABELS
} from '../authService';
import { getI18n } from '../../context/i18n';

const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: '',
  json: async () => body
});

describe('API Client (sessione cookie + CSRF) & Normalizzatore', () => {
  beforeEach(() => {
    setCsrfToken(null);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('snakeToCamel & normalizeData', () => {
    it('converte chiavi snake_case in camelCase', () => {
      expect(snakeToCamel('time_limit')).toBe('timeLimit');
      expect(snakeToCamel('total_order_pay')).toBe('totalOrderPay');
      expect(snakeToCamel('alreadyCamel')).toBe('alreadyCamel');
      expect(snakeToCamel('single')).toBe('single');
    });

    it('normalizza ricorsivamente oggetti nidificati e array con chiavi snake_case', () => {
      const normalized = normalizeData({
        order_id: 101,
        delivery_details: { customer_address: 'Via Dante 12', is_hot: true },
        items_list: [{ item_name: 'Pizza', item_qty: 2 }]
      });

      expect(normalized).toEqual({
        orderId: 101,
        deliveryDetails: { customerAddress: 'Via Dante 12', isHot: true },
        itemsList: [{ itemName: 'Pizza', itemQty: 2 }]
      });
    });

    it('preserva intatti tipi primitivi, null e undefined', () => {
      expect(normalizeData(null)).toBeNull();
      expect(normalizeData(undefined)).toBeUndefined();
      expect(normalizeData(42)).toBe(42);
      expect(normalizeData('string')).toBe('string');
    });
  });

  describe('apiClient', () => {
    it('invia sempre i cookie di sessione e normalizza la risposta', async () => {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ status_ok: true }));

      const res = await apiClient('/test');

      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/test');
      expect(options.credentials).toBe('include');
      expect(options.headers.Authorization).toBeUndefined();
      expect(res).toEqual({ statusOk: true });
    });

    it('recupera il token CSRF e lo invia nelle richieste POST', async () => {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        if (url.endsWith('/auth/csrf')) return jsonResponse({ csrf_token: 'csrf-123' });
        return jsonResponse({ ok: true });
      });

      await api.post('/auth/logout', { a: 1 });

      const postCall = fetchMock.mock.calls.find(([url]) => url.endsWith('/auth/logout'));
      expect(postCall[1].headers['X-CSRFToken']).toBe('csrf-123');
      expect(postCall[1].headers['Content-Type']).toBe('application/json');
      expect(postCall[1].body).toBe(JSON.stringify({ a: 1 }));
      expect(getCsrfToken()).toBe('csrf-123');
    });

    it('aggiorna il token CSRF quando il server ne restituisce uno nuovo', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ authenticated: false, csrf_token: 'fresh-token' }));
      await api.get('/auth/session');
      expect(getCsrfToken()).toBe('fresh-token');
    });

    it('in caso di token CSRF scaduto ne richiede uno nuovo e riprova una volta', async () => {
      setCsrfToken('old-token');
      let posts = 0;
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
        if (url.endsWith('/auth/csrf')) return jsonResponse({ csrf_token: 'new-token' });
        posts += 1;
        if (options.headers['X-CSRFToken'] === 'old-token') {
          return jsonResponse({ error: 'csrf_error', message: 'expired' }, 400);
        }
        return jsonResponse({ saved: true });
      });

      const res = await api.post('/something', {});
      expect(res).toEqual({ saved: true });
      expect(posts).toBe(2);
      expect(fetchMock.mock.calls.at(-1)[1].headers['X-CSRFToken']).toBe('new-token');
    });

    it('lancia ApiError con codice e campi non validi', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({ error: 'validation_error', message: 'Dati non validi', fields: { email: 'Email già registrata' } }, 422)
      );

      const error = await apiClient('/bad').catch((e) => e);
      expect(error).toBeInstanceOf(ApiError);
      expect(error.status).toBe(422);
      expect(error.code).toBe('validation_error');
      expect(error.fields).toEqual({ email: 'Email già registrata' });
      expect(error.message).toBe('Dati non validi');
    });

    it('emette ror:unauthorized solo quando la sessione non è valida', async () => {
      const spy = vi.fn();
      window.addEventListener('ror:unauthorized', spy);
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({ error: 'unauthorized' }, 401));
      await expect(apiClient('/protected')).rejects.toThrow();
      expect(spy).toHaveBeenCalledTimes(1);

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({ error: 'invalid_credentials' }, 401));
      await expect(apiClient('/auth/session')).rejects.toThrow();
      expect(spy).toHaveBeenCalledTimes(1);
      window.removeEventListener('ror:unauthorized', spy);
    });

    it('segnala gli errori di rete come ApiError con isNetworkError', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
      const error = await apiClient('/offline').catch((e) => e);
      expect(error.isNetworkError).toBe(true);
      expect(error.status).toBe(0);
    });

    it('una richiesta che non risponde diventa un errore di rete dopo il tempo massimo, anche per il token CSRF', async () => {
      // prima una POST (come l'SOS) restava appesa per sempre se /auth/csrf o la richiesta non rispondevano
      vi.useFakeTimers();
      try {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((url, init) => new Promise((resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }));
        let settled = false;
        const request = apiClient('/sos', { method: 'POST', body: {} }).catch((e) => e).finally(() => { settled = true; });
        await vi.advanceTimersByTimeAsync(20000);       // /auth/csrf interrotta: la POST parte senza token
        expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/auth/csrf', '/api/sos']);
        await vi.advanceTimersByTimeAsync(29999);
        expect(settled).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        const error = await request;
        expect(error).toBeInstanceOf(ApiError);
        expect(error.isNetworkError).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('authService', () => {
    const backendUser = {
      id: 7,
      username: 'mario_rossi',
      email: 'mario@example.com',
      first_name: 'Mario',
      last_name: 'Rossi',
      phone_number: '+39 348 1234567',
      tax_id_code: 'RSSMRA85M01H501Q',
      date_of_birth: '1985-08-01',
      avatar: null,
      roles: [],
      is_admin: false
    };

    it('login invia identity/password/remember e restituisce il profilo mappato', async () => {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        if (url.endsWith('/auth/csrf')) return jsonResponse({ csrf_token: 't' });
        return jsonResponse({ authenticated: true, user: backendUser, csrf_token: 't2' });
      });

      const profile = await authService.login('mario@example.com', 'Secret123', false);

      const loginCall = fetchMock.mock.calls.find(([url]) => url.endsWith('/auth/login'));
      expect(JSON.parse(loginCall[1].body)).toEqual({ identity: 'mario@example.com', password: 'Secret123', remember: false });
      expect(profile).toMatchObject({
        id: 7,
        name: 'Mario',
        surname: 'Rossi',
        phone: '+39 348 1234567',
        fiscalCode: 'RSSMRA85M01H501Q',
        photo: '/icons/avatar-placeholder.svg' // senza foto: sagoma neutra
      });
    });

    it('getSession restituisce null se il server non ha una sessione attiva', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ authenticated: false, user: null }));
      await expect(authService.getSession()).resolves.toBeNull();
    });

    it('mapUserToProfile gestisce input vuoti e foto personalizzate', () => {
      expect(mapUserToProfile(null)).toBeNull();
      expect(mapUserToProfile({ avatar: 'data:image/jpeg;base64,AAA' }).hasCustomPhoto).toBe(true);
    });

    it('authErrorMessage e fieldErrorsToList producono messaggi leggibili', () => {
      expect(authErrorMessage(new ApiError('x', 401, { error: 'invalid_credentials' }))).toMatch(/non corrett/);
      expect(authErrorMessage(new ApiError('x', 0))).toMatch(/server/);
      expect(fieldErrorsToList({ tax_id_code: 'Codice errato' })).toEqual([
        { field: 'tax_id_code', label: 'Codice fiscale', message: 'Codice errato' }
      ]);
    });

    it('le etichette dei campi seguono la lingua dell\'app', () => {
      const fields = { email: 'Este email ya está registrado.', tax_id_code: 'x', 'sos_contact.phone': 'y' };
      expect(fieldErrorsToList(fields, getI18n('es')).map((item) => item.label))
        .toEqual(['Email', 'Código fiscal', 'Teléfono SOS']);
      expect(fieldErrorsToList(fields, getI18n('en')).map((item) => item.label))
        .toEqual(['Email', 'Tax code', 'SOS phone']);
      // ogni campo che il server può segnalare ha la sua etichetta in tutte e tre le lingue
      ['it', 'en', 'es'].forEach((code) => {
        expect(Object.keys(getI18n(code).fieldLabels).sort()).toEqual(Object.keys(REGISTRATION_FIELD_LABELS).sort());
      });
    });
  });

  describe('lingua dei messaggi del server', () => {
    afterEach(() => setApiLanguage(null));

    it('ogni richiesta dice al server la lingua dell\'app (Accept-Language)', async () => {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}));
      setApiLanguage('es');
      await apiClient('/test');
      expect(fetchMock.mock.calls[0][1].headers['Accept-Language']).toBe('es');

      setApiLanguage(null);
      await apiClient('/test');
      expect(fetchMock.mock.calls[1][1].headers['Accept-Language']).toBeUndefined();
    });
  });
});
