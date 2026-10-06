import { describe, it, expect, beforeEach, vi } from 'vitest';

// Capacitor finto: piattaforma nativa attivabile e plugin registrati con mock
const plugins = vi.hoisted(() => ({ native: false, registered: {}, http: { request: vi.fn() } }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => plugins.native },
  CapacitorHttp: plugins.http,
  registerPlugin: (name) => {
    plugins.registered[name] = plugins.registered[name] || {};
    return new Proxy({}, { get: (_, method) => (...args) => plugins.registered[name][method](...args) });
  }
}));
const push = vi.hoisted(() => ({}));
vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: new Proxy({}, { get: (_, method) => (...args) => push[method](...args) })
}));

import { isNativeApp } from '../platform';
import { backgroundSafeFetch, nativeFetch } from '../http';
import { watchLocation } from '../location';
import { watchMotion } from '../motion';
import { safeFilename } from '../system';
import { pushLink, registerForPush } from '../push';
import { downloadCSV, downloadJSON } from '../../utils/exportUtils';
import { deviceService } from '../../services/deviceService';

describe('App Android (Capacitor)', () => {
  beforeEach(() => {
    plugins.native = true;
    plugins.registered = {};
    plugins.http.request.mockReset();
    Object.keys(push).forEach((key) => delete push[key]);
    vi.restoreAllMocks();
  });

  it('nel browser e nei test non è l\'app nativa', () => {
    plugins.native = false;
    expect(isNativeApp()).toBe(false);
    plugins.native = true;
    expect(isNativeApp()).toBe(true);
  });

  it('HTTP nativo: URL assoluto, Referer per il CSRF e risposta come fetch', async () => {
    plugins.http.request.mockResolvedValue({ status: 201, headers: { 'Content-Type': 'application/json' }, data: { status: 'ok' } });
    const response = await nativeFetch('/stream', { method: 'POST', headers: { 'X-CSRFToken': 't' }, body: '[1]' });
    expect(plugins.http.request).toHaveBeenCalledWith(expect.objectContaining({
      url: `${window.location.origin}/stream`,
      method: 'POST',
      data: '[1]',
      headers: { Referer: `${window.location.origin}/`, 'X-CSRFToken': 't' }
    }));
    expect(response.ok).toBe(true);
    expect(response.status).toBe(201);
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('richieste da background: HTTP nativo solo nell\'app, fetch nel browser', async () => {
    plugins.http.request.mockResolvedValue({ status: 200, headers: {}, data: {} });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true });
    await backgroundSafeFetch('/sos', { method: 'POST' });
    expect(plugins.http.request).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    plugins.native = false;
    await backgroundSafeFetch('/sos', { method: 'POST' });
    // nel browser con un tempo massimo (20 s, come le richieste native): un SOS non resta appeso
    expect(fetchSpy).toHaveBeenCalledWith('/sos', { method: 'POST', signal: expect.any(AbortSignal) });
  });

  it('GPS nativo in background: posizione nel formato del browser, permesso negato = codice 1', async () => {
    let callback;
    plugins.registered.BackgroundGeolocation = {
      addWatcher: vi.fn(async (options, cb) => { callback = cb; return 'w1'; }),
      removeWatcher: vi.fn(async () => {})
    };
    const onFix = vi.fn();
    const onError = vi.fn();
    const stop = await watchLocation(onFix, onError, { title: 'RoR registra il percorso', message: 'Schermo spento ok' });
    expect(plugins.registered.BackgroundGeolocation.addWatcher).toHaveBeenCalledWith(
      expect.objectContaining({ backgroundTitle: 'RoR registra il percorso', backgroundMessage: 'Schermo spento ok', requestPermissions: true, stale: false }),
      expect.any(Function)
    );
    callback({ latitude: 45.1, longitude: 9.2, accuracy: 6, speed: 4, time: 1790000000000 });
    expect(onFix).toHaveBeenCalledWith({ coords: { latitude: 45.1, longitude: 9.2, accuracy: 6, speed: 4 }, timestamp: 1790000000000 });
    callback(null, { code: 'NOT_AUTHORIZED', message: 'denied' });
    expect(onError).toHaveBeenCalledWith({ code: 1, message: 'denied' });
    stop();
    expect(plugins.registered.BackgroundGeolocation.removeWatcher).toHaveBeenCalledWith({ id: 'w1' });
  });

  it('sensori nativi per le cadute: campioni inoltrati, stop; senza accelerometro null', async () => {
    let listener;
    const remove = vi.fn();
    plugins.registered.RorMotion = {
      addListener: vi.fn(async (event, cb) => { listener = cb; return { remove }; }),
      start: vi.fn(async () => ({ available: true })),
      stop: vi.fn(async () => {})
    };
    const onSample = vi.fn();
    const stop = await watchMotion(onSample);
    listener({ samples: [{ t: 1, x: 0, y: 0, z: 9.8 }, { t: 51, x: 0, y: 30, z: 9.8, alpha: 250 }] });
    expect(onSample).toHaveBeenCalledTimes(2);
    expect(onSample.mock.calls[1][0]).toMatchObject({ y: 30, alpha: 250 });
    stop();
    expect(remove).toHaveBeenCalled();
    expect(plugins.registered.RorMotion.stop).toHaveBeenCalled();

    plugins.registered.RorMotion.start.mockResolvedValue({ available: false });
    expect(await watchMotion(onSample)).toBeNull();
    expect(remove).toHaveBeenCalledTimes(2);
  });

  it('file CSV/JSON nell\'app: menu Condividi di Android con un nome di file sicuro', async () => {
    plugins.registered.RorSystem = { shareFile: vi.fn(async () => {}) };
    await downloadCSV('RoR guadagni/../settimana.csv', [['Data', 'Km'], ['2026-09-28', '12.5']]);
    expect(plugins.registered.RorSystem.shareFile).toHaveBeenCalledWith(expect.objectContaining({
      filename: 'RoR_guadagni_.._settimana.csv',
      text: '"Data","Km"\n"2026-09-28","12.5"',
      mimeType: 'text/csv'
    }));
    await downloadJSON('dati.json', { a: 1 });
    expect(plugins.registered.RorSystem.shareFile).toHaveBeenLastCalledWith(expect.objectContaining({
      filename: 'dati.json', text: '{\n  "a": 1\n}', mimeType: 'application/json'
    }));
    expect(safeFilename('../../etc/passwd')).toBe('.._.._etc_passwd');
    plugins.registered.RorSystem.shareFile.mockRejectedValueOnce(new Error('annullato'));
    await expect(downloadCSV('x.csv', [['a']])).rejects.toThrow('annullato');
  });

  it('push: permesso, token Firebase registrato sul server; link solo interni', async () => {
    push.checkPermissions = vi.fn(async () => ({ receive: 'prompt' }));
    push.requestPermissions = vi.fn(async () => ({ receive: 'denied' }));
    expect(await registerForPush()).toEqual({ status: 'denied' });

    push.requestPermissions = vi.fn(async () => ({ receive: 'granted' }));
    const listeners = {};
    push.addListener = vi.fn(async (event, cb) => { listeners[event] = cb; return { remove: vi.fn() }; });
    push.register = vi.fn(async () => { await Promise.resolve(); listeners.registration({ value: 'fcm-token-123' }); });
    const register = vi.spyOn(deviceService, 'register').mockResolvedValue({ registered: true, pushEnabled: true });
    expect(await registerForPush()).toEqual({ status: 'enabled' });
    expect(register).toHaveBeenCalledWith('fcm-token-123');
    register.mockResolvedValue({ registered: true, pushEnabled: false });
    expect(await registerForPush()).toEqual({ status: 'server_disabled' });

    expect(pushLink({ data: { link: '/consegne' } })).toBe('/consegne');
    expect(pushLink({ data: { link: 'https://evil.example/x' } })).toBe('/notifiche');
    expect(pushLink({ data: { link: '//evil.example' } })).toBe('/notifiche');
    expect(pushLink({})).toBe('/notifiche');
  });
});
