import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';

// App Android: GPS e sensori dai plugin nativi (finti), notifica di caduta e permesso notifiche
const native = vi.hoisted(() => ({ onFix: null, onSample: null, stopLocation: vi.fn(), stopMotion: vi.fn() }));
vi.mock('../../native/platform', () => ({ isNativeApp: () => true }));
vi.mock('../../native/appState', () => ({ isAppInForeground: () => false })); // schermo spento
vi.mock('../../native/location', () => ({
  watchLocation: vi.fn(async (onFix) => { native.onFix = onFix; return native.stopLocation; })
}));
vi.mock('../../native/motion', () => ({
  watchMotion: vi.fn(async (onSample) => { native.onSample = onSample; return native.stopMotion; })
}));
vi.mock('../../native/push', () => ({ requestNotificationPermission: vi.fn(async () => true) }));
vi.mock('../../native/system', () => ({ showFallAlert: vi.fn(), cancelFallAlert: vi.fn() }));

import { AppProvider } from '../AppContext';
import { RideTrackingProvider, useRideTracking, FALL_COUNTDOWN_SEC } from '../RideTrackingContext';
import { trackingService } from '../../services/trackingService';
import { sosService } from '../../services/sosService';
import { authService } from '../../services/authService';
import { showFallAlert, cancelFallAlert } from '../../native/system';
import { requestNotificationPermission } from '../../native/push';

const PROFILE = { id: 7, username: 'rider', name: 'Mario', language: 'it', sensorsEnabled: true, shareLocationWithGroups: false, roles: [] };
let ctx;
const Probe = () => { ctx = useRideTracking(); return null; };
const renderProvider = () => render(<AppProvider><RideTrackingProvider><Probe /></RideTrackingProvider></AppProvider>);

describe('RideTrackingContext nell\'app Android (schermo spento)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('ror-user-profile', JSON.stringify(PROFILE));
    vi.spyOn(authService, 'getSession').mockResolvedValue(PROFILE);
    vi.spyOn(sosService, 'active').mockResolvedValue({ mine: null, groups: [] });
    vi.spyOn(trackingService, 'sendPoints').mockResolvedValue({ status: 'ok' });
    vi.spyOn(sosService, 'trigger').mockResolvedValue({ alert: { id: 3, source: 'fall' }, created: true, notifications: {}, contacts: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('i punti partono all\'arrivo delle posizioni anche senza timer', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(1790000000000);
    renderProvider();
    await act(async () => { await ctx.start(); });
    expect(requestNotificationPermission).toHaveBeenCalled();
    const fix = (lat, ts) => ({ coords: { latitude: lat, longitude: 9.0, accuracy: 5, speed: 4 }, timestamp: ts });
    await act(async () => { native.onFix(fix(45.0, Date.now())); });
    // un invio ogni 20 s, non a ogni posizione (meno richieste sul tunnel e meno batteria)
    vi.setSystemTime(Date.now() + 6000);
    await act(async () => { native.onFix(fix(45.0003, Date.now())); });
    expect(trackingService.sendPoints).not.toHaveBeenCalled();
    // 21 s dopo l'avvio (il timer dei 20 s non scatta: in background è rallentato) arriva un'altra posizione
    vi.setSystemTime(Date.now() + 15000);
    await act(async () => { native.onFix(fix(45.0006, Date.now())); });
    expect(trackingService.sendPoints).toHaveBeenCalledTimes(1);
    expect(trackingService.sendPoints.mock.calls[0][0]).toHaveLength(3);
  });

  it('caduta a schermo spento: avviso di Android e SOS dopo 10 s anche con i timer fermi', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(1790000000000);
    renderProvider();
    await act(async () => { await ctx.start(); });
    await act(async () => { native.onFix({ coords: { latitude: 45.0, longitude: 9.0, accuracy: 5, speed: 0 }, timestamp: Date.now() }); });

    // campioni del plugin nativo a 20 Hz: fermo, urto con rotazione, immobile a terra
    const feed = async (ms, sample) => {
      for (let t = 0; t < ms; t += 50) {
        vi.setSystemTime(Date.now() + 50);
        await act(async () => { native.onSample({ t: Date.now(), x: 0, y: 0, z: 9.8, ...sample }); });
      }
    };
    await feed(500, {});
    await feed(50, { z: 120, alpha: 400 });
    await feed(600, { alpha: 400 });
    await feed(4000, {});
    expect(ctx.fallAlert).not.toBeNull();
    expect(showFallAlert).toHaveBeenCalledWith('Caduta rilevata', expect.stringContaining('10 secondi'));
    expect(sosService.trigger).not.toHaveBeenCalled();

    // nessun setInterval eseguito: bastano i campioni che continuano ad arrivare
    await feed(FALL_COUNTDOWN_SEC * 1000 + 200, {});
    expect(sosService.trigger).toHaveBeenCalledWith(expect.objectContaining({ source: 'fall', lat: 45.0, lon: 9.0 }));
    expect(ctx.fallAlert).toBeNull();
    expect(cancelFallAlert).toHaveBeenCalled();
  });

  it('pausa: GPS e sensori nativi fermati', async () => {
    renderProvider();
    await act(async () => { await ctx.start(); });
    await act(async () => { ctx.pause(); });
    expect(native.stopLocation).toHaveBeenCalled();
    expect(native.stopMotion).toHaveBeenCalled();
  });
});
