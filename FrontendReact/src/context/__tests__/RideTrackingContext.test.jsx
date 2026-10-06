import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import { AppProvider, useApp } from '../AppContext';
import {
  RideTrackingProvider, useRideTracking, TRACKING_STORAGE_KEY, FALL_COUNTDOWN_SEC, FLUSH_MS, STREAM_MAX_POINTS,
  PENDING_SOS_KEY, SOS_RETRY_DELAYS_MS
} from '../RideTrackingContext';
import { requestRefresh, setPushActive } from '../../native/pushState';
import { trackingService } from '../../services/trackingService';
import { sosService } from '../../services/sosService';
import { authService } from '../../services/authService';
import { ApiError } from '../../services/api';

const PROFILE = { id: 7, username: 'rider', name: 'Mario', surname: 'Rossi', language: 'it', sensorsEnabled: true, shareLocationWithGroups: false, roles: [] };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const offline = () => new ApiError('Impossibile contattare il server.', 0, null);
const sosSent = (id, source = 'fall') => ({ alert: { id, source }, created: true, notifications: {}, contacts: [] });

let ctx;
let appCtx;
const Probe = () => {
  ctx = useRideTracking();
  appCtx = useApp();
  return null;
};

const renderProvider = () => render(
  <AppProvider>
    <RideTrackingProvider>
      <Probe />
    </RideTrackingProvider>
  </AppProvider>
);

let geo;
const fix = (lat, lon, ts, accuracy = 8, speed = 5) => ({ coords: { latitude: lat, longitude: lon, accuracy, speed }, timestamp: ts });
const emit = async (position) => {
  await act(async () => { geo.success(position); });
};

describe('RideTrackingContext — sessione GPS reale', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    localStorage.setItem('ror-user-profile', JSON.stringify(PROFILE));
    vi.spyOn(authService, 'getSession').mockResolvedValue(PROFILE);
    vi.spyOn(sosService, 'active').mockResolvedValue({ mine: null, groups: [] });
    vi.spyOn(trackingService, 'sendPoints').mockResolvedValue({ status: 'ok' });
    vi.spyOn(trackingService, 'endSession').mockResolvedValue({ status: 'ok' });
    geo = {
      watchPosition: vi.fn((success, error) => { geo.success = success; geo.error = error; return 42; }),
      clearWatch: vi.fn(),
      getCurrentPosition: vi.fn((success) => success(fix(45.1, 9.1, Date.now())))
    };
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: geo });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete navigator.geolocation;
    delete window.DeviceMotionEvent;
  });

  it('senza "Sensori" attivi non parte e spiega perché', async () => {
    localStorage.setItem('ror-user-profile', JSON.stringify({ ...PROFILE, sensorsEnabled: false }));
    authService.getSession.mockResolvedValue({ ...PROFILE, sensorsEnabled: false });
    renderProvider();
    let started;
    await act(async () => { started = await ctx.start(); });
    expect(started).toBe(false);
    expect(ctx.ride.error).toBe('sensors_disabled');
    expect(geo.watchPosition).not.toHaveBeenCalled();
  });

  it('registra le posizioni, le invia a /stream e chiude la sessione con /session/end', async () => {
    renderProvider();
    await act(async () => { await ctx.start(); });
    expect(ctx.ride.status).toBe('active');
    const sessionId = ctx.ride.sessionId;

    const t0 = 1790000000000;
    await emit(fix(45.0, 9.0, t0));
    await emit(fix(45.001, 9.0, t0 + 20000));
    await emit(fix(45.001, 9.0, t0 + 20000));            // duplicato: ignorato
    await emit(fix(45.5, 9.0, t0 + 25000));              // salto impossibile: ignorato
    await emit(fix(45.002, 9.0, t0 + 40000, 200));       // troppo impreciso: ignorato
    await emit(fix(45.002, 9.0, t0 + 40000));
    expect(ctx.ride.pendingCount).toBe(3);
    expect(ctx.ride.distanceKm).toBeCloseTo(0.222, 2);
    expect(ctx.ride.track).toHaveLength(3);

    await act(async () => { await ctx.flush(); });
    expect(trackingService.sendPoints).toHaveBeenCalledTimes(1);
    const sent = trackingService.sendPoints.mock.calls[0][0];
    expect(sent.map((p) => p.timestamp)).toEqual([t0, t0 + 20000, t0 + 40000]);
    expect(sent.every((p) => p.session_id === sessionId && p.speed_kmh === 18)).toBe(true);
    expect(ctx.ride.pointsSent).toBe(3);

    await emit(fix(45.003, 9.0, t0 + 60000));
    await act(async () => { await ctx.stop(); });
    expect(trackingService.sendPoints).toHaveBeenLastCalledWith([expect.objectContaining({ timestamp: t0 + 60000 })]);
    expect(trackingService.endSession).toHaveBeenCalledWith(sessionId);
    expect(geo.clearWatch).toHaveBeenCalledWith(42);
    expect(ctx.ride.status).toBe('idle');
    expect(ctx.lastResult).toMatchObject({ sessionId, pointsSent: 4 });
    expect(localStorage.getItem(TRACKING_STORAGE_KEY)).toBeNull();
  });

  it('"Termina" durante un invio in corso non perde i punti arrivati nel frattempo', async () => {
    renderProvider();
    await act(async () => { await ctx.start(); });
    const t0 = 1790000000000;
    await emit(fix(45.0, 9.0, t0));

    // primo invio lento (rete mobile): intanto arriva un'altra posizione
    let release;
    trackingService.sendPoints.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve({ status: 'ok' }); }));
    let inFlight;
    act(() => { inFlight = ctx.flush(); });
    await emit(fix(45.0005, 9.0, t0 + 10000));

    let stopping;
    act(() => { stopping = ctx.stop(); });
    await act(async () => { release(); await inFlight; await stopping; });

    const sent = trackingService.sendPoints.mock.calls.flatMap(([points]) => points.map((p) => p.timestamp));
    expect(sent).toEqual([t0, t0 + 10000]);
    expect(trackingService.endSession).toHaveBeenCalledTimes(1);
    expect(ctx.lastResult.pointsSent).toBe(2);
  });

  it('sessione di accesso scaduta durante il percorso: i punti restano e si inviano dopo il nuovo accesso', async () => {
    renderProvider();
    await act(async () => { await ctx.start(); });
    const sessionId = ctx.ride.sessionId;
    await emit(fix(45.0, 9.0, 1000));
    await emit(fix(45.0005, 9.0, 11000));

    // il telefono ha perso il cookie di sessione (app chiusa dal sistema): il server risponde 401
    await act(async () => { window.dispatchEvent(new CustomEvent('ror:unauthorized')); });
    expect(ctx.ride.status).toBe('paused');
    expect(ctx.ride.sessionId).toBe(sessionId);
    expect(JSON.parse(localStorage.getItem(TRACKING_STORAGE_KEY)).pending).toHaveLength(2);

    // stesso utente di nuovo dentro: il percorso si chiude e i punti arrivano al server
    await act(async () => { appCtx.registerUser(PROFILE); });
    await act(async () => { await ctx.stop(); });
    expect(trackingService.sendPoints.mock.calls.flatMap(([points]) => points.map((p) => p.timestamp))).toEqual([1000, 11000]);
    expect(trackingService.endSession).toHaveBeenCalledWith(sessionId);
  });

  it('logout volontario o accesso di un altro utente: la sessione non si riprende né si invia', async () => {
    vi.spyOn(authService, 'logout').mockResolvedValue(null);
    renderProvider();
    await act(async () => { await ctx.start(); });
    await emit(fix(45.0, 9.0, 1000));
    await act(async () => { appCtx.logoutUser(); });
    expect(ctx.ride.status).toBe('idle');
    expect(localStorage.getItem(TRACKING_STORAGE_KEY)).toBeNull();

    await act(async () => { appCtx.registerUser(PROFILE); });
    await act(async () => { await ctx.start(); });
    await emit(fix(45.0, 9.0, 1000));
    await act(async () => { appCtx.registerUser({ ...PROFILE, id: 99, username: 'altro' }); });
    expect(ctx.ride.status).toBe('idle');
    expect(trackingService.sendPoints).not.toHaveBeenCalled();
  });

  it('senza connessione tiene i punti e li reinvia nello stesso ordine', async () => {
    renderProvider();
    await act(async () => { await ctx.start(); });
    await emit(fix(45.0, 9.0, 1000));
    await emit(fix(45.0005, 9.0, 11000));
    trackingService.sendPoints.mockRejectedValueOnce(new ApiError('offline', 0, null));
    await act(async () => { await ctx.flush(); });
    expect(ctx.ride.syncError).toBe('network');
    expect(ctx.ride.pendingCount).toBe(2);
    await emit(fix(45.001, 9.0, 21000));
    await act(async () => { await ctx.flush(); });
    expect(trackingService.sendPoints.mock.calls[1][0].map((p) => p.timestamp)).toEqual([1000, 11000, 21000]);
    expect(ctx.ride.syncError).toBeNull();
  });

  it('dopo un lungo tratto senza rete invia gli arretrati a blocchi accettati da /stream, in ordine', async () => {
    // 450 punti ≈ 7 minuti senza copertura: in un'unica richiesta /stream li rifiuterebbe (422) per sempre
    const pending = Array.from({ length: 450 }, (_, i) => ({ session_id: 's-1', lat: 45 + i / 1e5, lon: 9, speed_kmh: 18, timestamp: 1000 + i * 1000 }));
    localStorage.setItem(TRACKING_STORAGE_KEY, JSON.stringify({ sessionId: 's-1', userId: 7, startedAt: 1000, activeMs: 450000, pending, track: [] }));
    trackingService.sendPoints
      .mockResolvedValueOnce({ status: 'ok' })
      .mockRejectedValueOnce(new ApiError('offline', 0, null)); // la rete cade di nuovo a metà
    renderProvider();

    await act(async () => { await ctx.flush(); });
    expect(trackingService.sendPoints.mock.calls.map(([points]) => points.length)).toEqual([STREAM_MAX_POINTS, STREAM_MAX_POINTS]);
    expect(ctx.ride.pointsSent).toBe(200);
    expect(ctx.ride.pendingCount).toBe(250);
    expect(ctx.ride.syncError).toBe('network');

    await act(async () => { await ctx.flush(); });
    const calls = trackingService.sendPoints.mock.calls;
    expect(calls.slice(2).map(([points]) => points.length)).toEqual([200, 50]);
    const delivered = [calls[0], calls[2], calls[3]].flatMap(([points]) => points.map((p) => p.timestamp));
    expect(delivered).toEqual(pending.map((p) => p.timestamp));
    expect(ctx.ride.pendingCount).toBe(0);
    expect(ctx.ride.syncError).toBeNull();
  });

  it('se il server ha i sensori disattivati mette in pausa e non perde i punti', async () => {
    renderProvider();
    await act(async () => { await ctx.start(); });
    await emit(fix(45.0, 9.0, 1000));
    trackingService.sendPoints.mockRejectedValueOnce(new ApiError('Sensor access is disabled', 403, { error: 'sensors_disabled' }));
    await act(async () => { await ctx.flush(); });
    expect(ctx.ride.status).toBe('paused');
    expect(ctx.ride.error).toBe('sensors_disabled');
    expect(ctx.ride.pendingCount).toBe(1);
  });

  it('pausa e ripresa fermano e riavviano il GPS; dopo un ricaricamento la sessione torna in pausa', async () => {
    const first = renderProvider();
    await act(async () => { await ctx.start(); });
    await emit(fix(45.0, 9.0, 1000));
    act(() => { ctx.pause(); });
    expect(ctx.ride.status).toBe('paused');
    expect(geo.clearWatch).toHaveBeenCalled();
    await act(async () => { await ctx.resume(); });
    expect(ctx.ride.status).toBe('active');
    expect(geo.watchPosition).toHaveBeenCalledTimes(2);
    const sessionId = ctx.ride.sessionId;
    first.unmount();

    trackingService.sendPoints.mockRejectedValue(new ApiError('offline', 0, null));
    renderProvider();
    expect(ctx.ride.status).toBe('paused');
    expect(ctx.ride.restored).toBe(true);
    expect(ctx.ride.sessionId).toBe(sessionId);
  });

  it('SOS manuale con l\'ultima posizione e annullamento', async () => {
    vi.spyOn(sosService, 'trigger').mockResolvedValue({ alert: { id: 5, source: 'manual' }, created: true, notifications: {}, contacts: [] });
    vi.spyOn(sosService, 'resolve').mockResolvedValue({ alert: { id: 5, status: 'resolved' } });
    renderProvider();
    await act(async () => { await ctx.start(); });
    await emit(fix(45.2, 9.3, Date.now(), 12));
    await act(async () => { await ctx.triggerSos('manual'); });
    expect(sosService.trigger).toHaveBeenCalledWith({
      source: 'manual', lat: 45.2, lon: 9.3, accuracyM: 12, sessionId: ctx.ride.sessionId, requestId: expect.stringMatching(UUID)
    });
    expect(localStorage.getItem(PENDING_SOS_KEY)).toBeNull(); // arrivato: niente più da riprovare
    expect(ctx.sos.status).toBe('sent');
    // doppio tocco su "Sto bene": una sola richiesta
    await act(async () => { await Promise.all([ctx.resolveSos(), ctx.resolveSos()]); });
    expect(sosService.resolve).toHaveBeenCalledTimes(1);
    expect(sosService.resolve).toHaveBeenCalledWith(5);
    expect(ctx.sos).toBeNull();
  });

  it('SOS senza rete: riprova da solo con lo stesso request_id finché non arriva', async () => {
    // il caso della caduta in un sottopasso: il rider a terra non può premere "Riprova"
    vi.useFakeTimers();
    vi.spyOn(sosService, 'trigger')
      .mockRejectedValueOnce(offline())
      .mockRejectedValueOnce(offline())
      .mockResolvedValue(sosSent(21));
    renderProvider();
    await act(async () => { await ctx.triggerSos('fall'); });
    expect(ctx.sos).toMatchObject({ status: 'error', retrying: true, attempt: 1 });
    const stored = JSON.parse(localStorage.getItem(PENDING_SOS_KEY));
    expect(stored).toMatchObject({ source: 'fall', userId: PROFILE.id, requestId: expect.stringMatching(UUID) });

    await act(async () => { await vi.advanceTimersByTimeAsync(SOS_RETRY_DELAYS_MS[0]); });
    expect(sosService.trigger).toHaveBeenCalledTimes(2);
    expect(ctx.sos).toMatchObject({ status: 'error', retrying: true, attempt: 2 });

    await act(async () => { await vi.advanceTimersByTimeAsync(SOS_RETRY_DELAYS_MS[1]); });
    expect(sosService.trigger).toHaveBeenCalledTimes(3);
    expect(ctx.sos.status).toBe('sent');
    const ids = sosService.trigger.mock.calls.map(([args]) => args.requestId);
    expect(new Set(ids)).toEqual(new Set([stored.requestId])); // il server riconosce i doppioni
    expect(localStorage.getItem(PENDING_SOS_KEY)).toBeNull();

    await act(async () => { await vi.advanceTimersByTimeAsync(120000); });
    expect(sosService.trigger).toHaveBeenCalledTimes(3); // arrivato: nessun altro tentativo
  });

  it('appena il server risponde al controllo degli SOS, il tentativo in attesa parte subito', async () => {
    vi.useFakeTimers();
    vi.spyOn(sosService, 'trigger').mockRejectedValueOnce(offline()).mockResolvedValue(sosSent(22));
    renderProvider();
    await act(async () => { await ctx.triggerSos('fall'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(sosService.trigger).toHaveBeenCalledTimes(1);
    await act(async () => { requestRefresh('sicurezza'); }); // il controllo /sos/active va a buon fine
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(sosService.trigger).toHaveBeenCalledTimes(2);
    expect(ctx.sos.status).toBe('sent');
  });

  it('"Sto bene: non inviarlo" ferma i tentativi', async () => {
    vi.useFakeTimers();
    vi.spyOn(sosService, 'trigger').mockRejectedValue(offline());
    renderProvider();
    await act(async () => { await ctx.triggerSos('manual'); });
    act(() => { ctx.dismissSos(); });
    expect(ctx.sos).toBeNull();
    expect(localStorage.getItem(PENDING_SOS_KEY)).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(120000); });
    expect(sosService.trigger).toHaveBeenCalledTimes(1);
  });

  it('un SOS rifiutato dal server (dati non validi) non viene ripetuto uguale', async () => {
    vi.useFakeTimers();
    vi.spyOn(sosService, 'trigger').mockRejectedValue(new ApiError('Dati non validi', 422, { error: 'validation_error' }));
    renderProvider();
    await act(async () => { await ctx.triggerSos('manual'); });
    expect(ctx.sos).toMatchObject({ status: 'error', retrying: false });
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(sosService.trigger).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(PENDING_SOS_KEY)).toBeNull();
  });

  it('un SOS rimasto sul telefono riparte dopo il riavvio dell\'app, con lo stesso request_id', async () => {
    const pending = {
      requestId: '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b', source: 'fall', lat: 45, lon: 9, accuracy: 6,
      userId: PROFILE.id, createdAt: Date.now() - 60000, attempt: 3, retryAt: Date.now() + 30000
    };
    localStorage.setItem(PENDING_SOS_KEY, JSON.stringify(pending));
    vi.spyOn(sosService, 'trigger').mockResolvedValue({ ...sosSent(30), created: false });
    renderProvider();
    await waitFor(() => expect(ctx.sos?.status).toBe('sent'));
    expect(sosService.trigger).toHaveBeenCalledWith(expect.objectContaining({
      source: 'fall', lat: 45, lon: 9, accuracyM: 6, requestId: pending.requestId
    }));
    expect(localStorage.getItem(PENDING_SOS_KEY)).toBeNull();
  });

  it('un SOS in attesa più vecchio di un\'ora, o di un altro utente, non riparte da solo', async () => {
    vi.spyOn(sosService, 'trigger');
    const old = { requestId: '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b', source: 'manual', userId: PROFILE.id, createdAt: Date.now() - 2 * 3600000, attempt: 1 };
    localStorage.setItem(PENDING_SOS_KEY, JSON.stringify(old));
    const first = renderProvider();
    await waitFor(() => expect(localStorage.getItem(PENDING_SOS_KEY)).toBeNull());
    first.unmount();

    localStorage.setItem(PENDING_SOS_KEY, JSON.stringify({ ...old, userId: 99, createdAt: Date.now() }));
    renderProvider();
    await waitFor(() => expect(localStorage.getItem(PENDING_SOS_KEY)).toBeNull());
    expect(sosService.trigger).not.toHaveBeenCalled();
    expect(ctx.sos).toBeNull();
  });

  it('SOS dei membri dei gruppi', async () => {
    sosService.active.mockResolvedValue({ mine: null, groups: [{ id: 9, username: 'anna', lat: 45, lon: 9, createdAt: '2026-09-25T10:00:00' }] });
    renderProvider();
    await waitFor(() => expect(ctx.groupAlerts).toHaveLength(1));
    expect(ctx.groupAlerts[0].username).toBe('anna');
  });

  it('SOS dei gruppi ogni 30 s, ogni 2 minuti con le push attive e subito con una push di sicurezza', async () => {
    vi.useFakeTimers();
    renderProvider();
    const run = async (ms) => { await act(async () => { vi.advanceTimersByTime(ms); }); };
    await run(0);
    expect(sosService.active).toHaveBeenCalledTimes(1);
    await run(30000);
    expect(sosService.active).toHaveBeenCalledTimes(2);

    try {
      await act(async () => { setPushActive(true); }); // app Android registrata per le push
      const calls = sosService.active.mock.calls.length;
      await run(60000);
      expect(sosService.active).toHaveBeenCalledTimes(calls);
      await run(60000);
      expect(sosService.active).toHaveBeenCalledTimes(calls + 1);
      await act(async () => { requestRefresh('consegne'); });
      expect(sosService.active).toHaveBeenCalledTimes(calls + 1);
      await act(async () => { requestRefresh('sicurezza'); }); // push "SOS da ..." con l'app aperta
      expect(sosService.active).toHaveBeenCalledTimes(calls + 2);
    } finally {
      setPushActive(false);
    }
  });

  it('fermi con il GPS che "balla": distanza e velocità a 0, un punto ogni 15 s nello stesso posto', async () => {
    renderProvider();
    await act(async () => { await ctx.start(); });
    const t0 = 1790000000000;
    const metres = (m) => m / 111000;
    // il caso della segnalazione: ±8 m di precisione e il GPS che dice 3 km/h (0,8 m/s) da fermi
    await emit(fix(45.0, 9.0, t0, 8, 0.8));
    for (let i = 1; i <= 45; i++) {
      await emit(fix(45.0 + metres(5 * Math.sin(i * 1.3)), 9.0 + metres(5 * Math.cos(i * 2.1)) * 1.41, t0 + i * 1000, 8, 0.8));
    }
    expect(ctx.ride.distanceKm).toBe(0);
    expect(ctx.ride.movingMs).toBe(0);
    expect(ctx.ride.currentSpeedKmh).toBe(0);
    expect(ctx.ride.pendingCount).toBe(4);   // il primo punto e quelli a 15, 30 e 45 s
    expect(ctx.ride.track).toEqual([[45.0, 9.0]]);

    // si riparte: 120 m in 20 s vengono contati subito
    await emit(fix(45.0 + metres(120), 9.0, t0 + 65000, 8, 6));
    expect(ctx.ride.distanceKm).toBeCloseTo(0.12, 3);
    expect(ctx.ride.movingMs).toBe(20000);
    expect(ctx.ride.currentSpeedKmh).toBeCloseTo(21.6, 1);
    await act(async () => { await ctx.flush(); });
    const sent = trackingService.sendPoints.mock.calls[0][0];
    expect(sent.map((p) => [p.lat, p.lon, p.speed_kmh])).toEqual([[45.0, 9.0, 2.88], [45.0, 9.0, 0], [45.0, 9.0, 0], [45.0, 9.0, 0], [45.0 + metres(120), 9.0, 21.6]]);
  });

  it('i punti partono ogni FLUSH_MS (20 s), non a ogni posizione', async () => {
    vi.useFakeTimers();
    renderProvider();
    await act(async () => { await ctx.start(); });
    const t0 = Date.now();
    await emit(fix(45.0, 9.0, t0));
    await emit(fix(45.0002, 9.0, t0 + 1000)); // 22 m in un secondo: movimento
    await act(async () => { vi.advanceTimersByTime(FLUSH_MS - 1000); });
    expect(trackingService.sendPoints).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(trackingService.sendPoints).toHaveBeenCalledTimes(1);
    expect(trackingService.sendPoints.mock.calls[0][0]).toHaveLength(2);
  });

  it('caduta rilevata dai sensori → conto alla rovescia → SOS automatico', async () => {
    window.DeviceMotionEvent = function DeviceMotionEvent() {};
    vi.spyOn(sosService, 'trigger').mockResolvedValue({ alert: { id: 11, source: 'fall' }, created: true, notifications: {}, contacts: [] });
    vi.useFakeTimers();
    renderProvider();
    await act(async () => { await ctx.start(); });
    expect(ctx.ride.motionActive).toBe(true);
    await emit(fix(45.0, 9.0, Date.now(), 5, 6));

    const motion = (acc, rot) => {
      const event = new Event('devicemotion');
      event.accelerationIncludingGravity = { x: 0, y: 0, z: acc };
      event.rotationRate = { alpha: rot, beta: 0, gamma: 0 };
      window.dispatchEvent(event);
    };
    const run = async (ms) => { await act(async () => { vi.advanceTimersByTime(ms); }); };

    motion(9.8, 0);
    await run(500);
    motion(120, 400);   // impatto + rotazione
    await run(50);
    await emit(fix(45.0, 9.0, Date.now(), 5, 0)); // dopo la caduta il GPS segna 0 km/h
    motion(9.8, 400);
    await run(600);
    motion(9.8, 0);     // fermo a terra
    await run(4000);
    expect(ctx.fallAlert.secondsLeft).toBeGreaterThan(0);
    expect(ctx.fallAlert.secondsLeft).toBeLessThanOrEqual(FALL_COUNTDOWN_SEC);
    expect(sosService.trigger).not.toHaveBeenCalled();

    await run(FALL_COUNTDOWN_SEC * 1000);
    expect(ctx.fallAlert).toBeNull();
    expect(sosService.trigger).toHaveBeenCalledWith(expect.objectContaining({ source: 'fall', lat: 45.0, lon: 9.0 }));
    // il punto con la caduta confermata va al GPS worker (fall_events)
    const flagged = trackingService.sendPoints.mock.calls.flatMap(([points]) => points).find((p) => p.is_confirmed_fall);
    expect(flagged).toMatchObject({ lat: 45.0, lon: 9.0, is_confirmed_fall: true });
  });

  it('"Sto bene" durante il conto alla rovescia non invia l\'SOS', async () => {
    window.DeviceMotionEvent = function DeviceMotionEvent() {};
    vi.spyOn(sosService, 'trigger');
    vi.useFakeTimers();
    renderProvider();
    await act(async () => { await ctx.start(); });
    const motion = (acc, rot) => {
      const event = new Event('devicemotion');
      event.accelerationIncludingGravity = { x: 0, y: 0, z: acc };
      event.rotationRate = { alpha: rot, beta: 0, gamma: 0 };
      window.dispatchEvent(event);
    };
    const run = async (ms) => { await act(async () => { vi.advanceTimersByTime(ms); }); };
    motion(9.8, 0); await run(500);
    motion(120, 400); await run(50);
    await emit(fix(45.0, 9.0, Date.now(), 5, 0));
    motion(9.8, 400); await run(600);
    motion(9.8, 0); await run(4000);
    expect(ctx.fallAlert).not.toBeNull();
    act(() => { ctx.cancelFall(); });
    await run(FALL_COUNTDOWN_SEC * 1000);
    expect(ctx.fallAlert).toBeNull();
    expect(sosService.trigger).not.toHaveBeenCalled();
  });
});
