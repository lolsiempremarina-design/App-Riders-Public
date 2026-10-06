import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { trackingService } from '../trackingService';
import { sosService, buildSosSmsLink, buildTelLink } from '../sosService';
import { setApiLanguage, setCsrfToken } from '../api';
import { getI18n } from '../../context/i18n';
import { defaultFetchMock } from '../../test/setup';
import { redirectPathFromState, adminReturnPath } from '../../utils/authUtils';

const response = (status, body) => ({
  ok: status < 400,
  status,
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => body
});

describe('trackingService (/stream, /session/end)', () => {
  afterEach(() => { globalThis.fetch = defaultFetchMock; });

  it('invia i punti con il cookie di sessione', async () => {
    globalThis.fetch = vi.fn(async () => response(200, { status: 'ok', count: 1 }));
    await trackingService.sendPoints([{ session_id: 'a', lat: 1, lon: 2, speed_kmh: null, timestamp: 5 }]);
    const [url, options] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/stream');
    expect(options.credentials).toBe('include');
    expect(JSON.parse(options.body)).toHaveLength(1);
    await trackingService.endSession('a');
    expect(globalThis.fetch.mock.calls[1][0]).toBe('/session/end');
    expect(JSON.parse(globalThis.fetch.mock.calls[1][1].body)).toEqual({ session_id: 'a' });
  });

  it('nessuna richiesta per un blocco vuoto; errori tradotti in codici', async () => {
    globalThis.fetch = vi.fn();
    await trackingService.sendPoints([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();

    globalThis.fetch = vi.fn(async () => response(403, { detail: 'Sensor access is disabled' }));
    await expect(trackingService.sendPoints([{}])).rejects.toMatchObject({ status: 403, code: 'sensors_disabled' });
    globalThis.fetch = vi.fn(async () => response(503, { detail: 'down' }));
    await expect(trackingService.endSession('a')).rejects.toMatchObject({ code: 'service_unavailable' });
    globalThis.fetch = vi.fn(async () => { throw new TypeError('offline'); });
    await expect(trackingService.sendPoints([{}])).rejects.toMatchObject({ status: 0, isNetworkError: true });
  });
});

describe('sosService', () => {
  beforeEach(() => setCsrfToken('csrf'));
  afterEach(() => {
    globalThis.fetch = defaultFetchMock;
    setCsrfToken(null);
  });

  it('invia la posizione solo se completa', async () => {
    globalThis.fetch = vi.fn(async () => response(201, { alert: { id: 1 } }));
    await sosService.trigger({ source: 'fall', lat: 45, lon: 9, accuracyM: 7, sessionId: 's' });
    expect(JSON.parse(globalThis.fetch.mock.calls[0][1].body)).toEqual({ source: 'fall', lat: 45, lon: 9, accuracy_m: 7, session_id: 's' });
    await sosService.trigger({ lat: 45 });
    expect(JSON.parse(globalThis.fetch.mock.calls[1][1].body)).toEqual({ source: 'manual' });
    await sosService.resolve(1);
    expect(globalThis.fetch.mock.calls[2][0]).toBe('/api/sos/1/resolve');
  });

  it('link per chiamate e SMS', () => {
    expect(buildTelLink('+39 333-111 22')).toBe('tel:+3933311122');
    expect(buildSosSmsLink('+39 333', 'https://osm/x')).toBe(`sms:+39333?body=${encodeURIComponent('SOS: ho bisogno di aiuto. La mia posizione: https://osm/x')}`);
  });

  it('SMS dell\'SOS nella lingua del rider, come l\'email ai contatti (prima sempre in italiano)', () => {
    const body = (link) => decodeURIComponent(link.split('?body=')[1]);
    expect(body(buildSosSmsLink('+44 7700', 'https://osm/x', getI18n('en')))).toBe('SOS: I need help. My location: https://osm/x');
    expect(body(buildSosSmsLink('+34 600', null, getI18n('es')))).toBe('SOS: necesito ayuda.');
    expect(body(buildSosSmsLink('+39 333', 'https://osm/x', getI18n('it')))).toBe('SOS: ho bisogno di aiuto. La mia posizione: https://osm/x');
  });

  it('senza rete il messaggio è nella lingua dell\'app', async () => {
    globalThis.fetch = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    setApiLanguage('en');
    try {
      await expect(sosService.active()).rejects.toMatchObject({ status: 0, message: getI18n('en').errServerUnreachable });
      setApiLanguage('es');
      await expect(sosService.active()).rejects.toMatchObject({ message: getI18n('es').errServerUnreachable });
    } finally {
      setApiLanguage(null);
    }
  });
});

describe('redirectPathFromState (ritorno dopo il login)', () => {
  it('conserva query e hash e accetta solo percorsi interni', () => {
    expect(redirectPathFromState({ from: { pathname: '/gruppi', search: '?invito=abc', hash: '#x' } })).toBe('/gruppi?invito=abc#x');
    expect(redirectPathFromState(undefined, '/profilo')).toBe('/profilo');
    expect(redirectPathFromState({ from: { pathname: '//evil.com' } })).toBe('/');
    expect(redirectPathFromState({ from: { pathname: 'https://evil.com' } })).toBe('/');
    expect(redirectPathFromState({ from: { pathname: '/login' } }, '/x')).toBe('/x');
  });
});

describe('adminReturnPath (ritorno al pannello admin Flask)', () => {
  it('accetta solo pagine del pannello /web/admin/', () => {
    expect(adminReturnPath('?next=%2Fweb%2Fadmin%2F')).toBe('/web/admin/');
    expect(adminReturnPath('?next=%2Fweb%2Fadmin%2F%3Fstatus%3Ddelivered')).toBe('/web/admin/?status=delivered');
    expect(adminReturnPath('?next=%2Fweb%2Fadmin')).toBe('/web/admin');
    expect(adminReturnPath('')).toBeNull();
    expect(adminReturnPath('?next=https%3A%2F%2Fevil.com%2Fweb%2Fadmin%2F')).toBeNull();
    expect(adminReturnPath('?next=%2F%2Fevil.com')).toBeNull();
    expect(adminReturnPath('?next=%2Fweb%2Fadministrator')).toBeNull();
    expect(adminReturnPath('?next=%2Fprofilo')).toBeNull();
  });
});
