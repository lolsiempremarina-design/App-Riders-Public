import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from './AppContext';
import { trackingService } from '../services/trackingService';
import { sosService } from '../services/sosService';
import { SignalProcessor } from '../tracking/SignalProcessor';
import { FallDetector } from '../tracking/FallDetector';
import { evaluateFix, haversineKm, MAX_FIX_ACCURACY_M, MIN_MOVE_M, newSessionId, requestMotionPermission } from '../tracking/geo';
import { getAudioContext, playSosSound } from '../utils/audioUtils';
import { isNativeApp } from '../native/platform';
import { isAppInForeground } from '../native/appState';
import { watchLocation } from '../native/location';
import { watchMotion } from '../native/motion';
import { requestNotificationPermission } from '../native/push';
import { usePollInterval, useRefreshOn } from '../native/pushState';
import { cancelFallAlert, showFallAlert } from '../native/system';

/**
 * Sessione di guida reale (fase 4), globale all'app così continua cambiando pagina:
 *  - posizioni GPS filtrate e inviate a /stream a blocchi, con nuovi tentativi;
 *  - chiusura con /session/end → il GPS worker salva GPX e percorso (visibile in "I miei percorsi");
 *  - rilevamento cadute a 20 Hz (accelerometro/giroscopio) con conto alla rovescia e SOS;
 *  - SOS manuale e SOS attivi dei membri dei miei gruppi (/api/sos);
 *  - sessione salvata in localStorage: dopo un ricaricamento torna "in pausa" e si può riprendere.
 * Nell'app Android (fase 7) GPS e sensori continuano con lo schermo spento (src/native/): i punti partono
 * all'arrivo delle posizioni e il conto alla rovescia dipende dall'orologio, perché in background i timer
 * della WebView rallentano.
 */

export const TRACKING_STORAGE_KEY = 'ror-ride-tracking';
// invio dei punti ogni 20 s (≈ 180 richieste/ora invece di 720): i punti restano uno al secondo, cambia solo
// quante volte partono; meno batteria e più ore di prova con il tunnel ngrok gratuito (20.000 richieste/mese)
export const FLUSH_MS = 20000;
export const STREAM_MAX_POINTS = 200; // massimo per richiesta accettato da /stream (FastAPI): gli arretrati partono a blocchi
export const FALL_COUNTDOWN_SEC = 10;
const TRACK_MAX = 3000;           // punti tenuti in memoria per la mappa
const STORED_TRACK_MAX = 500;
const RECENT_FIX_MS = 60000;      // posizione considerata attuale per l'SOS
const GPS_STALE_MS = 5000;        // oltre, per il rilevatore cadute il rider è fermo
const STILL_AFTER_MS = 10000;     // senza movimento da 10 s la velocità mostrata è 0 (non quella del "ballo" del GPS)
const SOS_POLL_MS = 30000;
const SOS_POLL_PUSH_MS = 120000;  // app Android con le push attive: l'SOS di un membro arriva subito come push

// SOS non arrivato al server (niente rete dopo una caduta in un sottopasso, server irraggiungibile): si riprova
// da soli finché non arriva o il rider lo annulla. Prima restava "SOS non inviato" con un "Riprova" da premere,
// impossibile per chi è rimasto a terra privo di sensi. Ogni tentativo porta lo stesso request_id: se uno era
// arrivato e si era persa solo la risposta, il server restituisce quell'SOS invece di avvisare due volte.
export const PENDING_SOS_KEY = 'ror-pending-sos';
export const SOS_RETRY_DELAYS_MS = [5000, 10000, 20000, 30000]; // poi ogni 30 s
const PENDING_SOS_MAX_AGE_MS = 60 * 60 * 1000; // dopo un riavvio: un SOS più vecchio di un'ora non parte da solo

const RideTrackingContext = createContext(null);

export const emptyRide = () => ({
  status: 'idle', // idle | active | paused | stopping
  sessionId: null,
  userId: null,
  startedAt: null,
  activeMs: 0,        // tempo di sessione attiva accumulato (pause escluse)
  resumedAt: null,    // inizio del tratto attivo in corso
  distanceKm: 0,
  movingMs: 0,        // tempo in movimento (soste escluse, come il GPS worker)
  maxSpeedKmh: 0,
  currentSpeedKmh: null,
  pointsSent: 0,
  pendingCount: 0,
  lastFix: null,      // {lat, lon, accuracy, ts}
  track: [],
  error: null,        // sensors_disabled | geolocation_unsupported | geolocation_denied | unauthorized
  syncError: null,    // network | not_sent | end_failed | service_unavailable | ...
  gpsWeak: false,
  motionActive: false,
  restored: false
});

/** Tempo di sessione attiva in ms all'istante `now`. */
export const rideElapsedMs = (ride, now = Date.now()) =>
  ride.activeMs + (ride.status === 'active' && ride.resumedAt ? Math.max(0, now - ride.resumedAt) : 0);

const pausedState = (ride, extra = {}) => ({
  ...ride,
  status: 'paused',
  activeMs: rideElapsedMs(ride),
  resumedAt: null,
  currentSpeedKmh: null,
  ...extra
});

const loadStoredRide = () => {
  try {
    const raw = localStorage.getItem(TRACKING_STORAGE_KEY);
    const stored = raw ? JSON.parse(raw) : null;
    return stored && stored.sessionId ? stored : null;
  } catch {
    return null;
  }
};

const loadPendingSos = () => {
  try {
    const raw = localStorage.getItem(PENDING_SOS_KEY);
    const pending = raw ? JSON.parse(raw) : null;
    return pending && pending.requestId ? pending : null;
  } catch {
    return null;
  }
};

const savePendingSos = (pending) => {
  try {
    if (pending) localStorage.setItem(PENDING_SOS_KEY, JSON.stringify(pending));
    else localStorage.removeItem(PENDING_SOS_KEY);
  } catch {
    // spazio esaurito o modalità privata: i tentativi continuano finché l'app resta aperta
  }
};

/**
 * Rete assente, server in difficoltà, accesso da rinnovare, troppe richieste o token CSRF non ottenuto
 * (la sua richiesta può essere fallita per la stessa rete): riprovare ha senso.
 */
const isRetryableSosError = (err) => {
  const status = err?.status;
  return !status || status >= 500 || status === 401 || status === 408 || status === 429 || err?.code === 'csrf_error';
};

const vibrate = (pattern) => {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(pattern);
  } catch {
    // ignorato
  }
};

/** Posizione attuale una tantum (per l'SOS senza sessione attiva). */
const currentPosition = (timeoutMs) => new Promise((resolve) => {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    resolve(null);
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy, ts: pos.timestamp || Date.now() }),
    () => resolve(null),
    { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 }
  );
});

export const RideTrackingProvider = ({ children }) => {
  const { userProfile, authStatus, showToast, t } = useApp();
  const storedRef = useRef(undefined);
  if (storedRef.current === undefined) storedRef.current = loadStoredRide();

  const [ride, setRide] = useState(() => {
    const stored = storedRef.current;
    if (!stored) return emptyRide();
    return {
      ...emptyRide(),
      status: 'paused',
      restored: true,
      sessionId: stored.sessionId,
      userId: stored.userId ?? null,
      startedAt: stored.startedAt,
      activeMs: stored.activeMs || 0,
      distanceKm: stored.distanceKm || 0,
      movingMs: stored.movingMs || 0,
      maxSpeedKmh: stored.maxSpeedKmh || 0,
      pointsSent: stored.pointsSent || 0,
      pendingCount: (stored.pending || []).length,
      track: stored.track || []
    };
  });
  const rideRef = useRef(ride);
  rideRef.current = ride;

  const bufferRef = useRef(storedRef.current?.pending || []);
  // aggiornato subito (lo stato React arriva al render successivo)
  const pointsSentRef = useRef(storedRef.current?.pointsSent || 0);
  const lastRecordedRef = useRef(storedRef.current?.lastRecorded || null);
  const lastMoveAtRef = useRef(0); // ora (ms) dell'ultima posizione contata come movimento
  const lastGpsRef = useRef(null);
  const processorRef = useRef(new SignalProcessor());
  const detectorRef = useRef(new FallDetector());
  const t0Ref = useRef(null);
  const stopLocationRef = useRef(null);
  const stopMotionRef = useRef(null);
  const sensorsGenRef = useRef(0);   // un avvio dei sensori ancora in corso viene annullato da stop/pausa
  const flushTimerRef = useRef(null);
  const lastFlushRef = useRef(0);
  const flushingRef = useRef(null);
  const wakeLockRef = useRef(null);
  const fallTimerRef = useRef(null);
  const fallActiveRef = useRef(false);
  const fallDeadlineRef = useRef(null);
  const tRef = useRef(t);
  tRef.current = t;

  const [fallAlert, setFallAlert] = useState(null); // {secondsLeft}
  const [sos, setSos] = useState(null);             // {status: sending|sent|error, source, result?, error?}
  const [groupAlerts, setGroupAlerts] = useState([]);
  const [lastResult, setLastResult] = useState(null);

  // ------------------------------------------------------------------ persistenza
  useEffect(() => {
    try {
      if (!ride.sessionId) {
        localStorage.removeItem(TRACKING_STORAGE_KEY);
        return;
      }
      localStorage.setItem(TRACKING_STORAGE_KEY, JSON.stringify({
        sessionId: ride.sessionId,
        userId: ride.userId,
        startedAt: ride.startedAt,
        activeMs: rideElapsedMs(ride),
        distanceKm: ride.distanceKm,
        movingMs: ride.movingMs,
        maxSpeedKmh: ride.maxSpeedKmh,
        pointsSent: ride.pointsSent,
        track: ride.track.slice(-STORED_TRACK_MAX),
        pending: bufferRef.current,
        lastRecorded: lastRecordedRef.current
      }));
    } catch {
      // spazio esaurito o modalità privata: la sessione continua in memoria
    }
  }, [ride]);

  // ------------------------------------------------------------------ wake lock (schermo acceso = GPS attivo)
  const acquireWakeLock = useCallback(async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.wakeLock && !wakeLockRef.current) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        wakeLockRef.current.addEventListener?.('release', () => { wakeLockRef.current = null; });
      }
    } catch {
      wakeLockRef.current = null;
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    try {
      wakeLockRef.current?.release?.();
    } catch {
      // ignorato
    }
    wakeLockRef.current = null;
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && rideRef.current.status === 'active') acquireWakeLock();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [acquireWakeLock]);

  // ------------------------------------------------------------------ sensori
  const stopSensors = useCallback(() => {
    sensorsGenRef.current += 1;
    stopLocationRef.current?.();
    stopMotionRef.current?.();
    stopLocationRef.current = null;
    stopMotionRef.current = null;
    clearInterval(flushTimerRef.current);
    flushTimerRef.current = null;
    releaseWakeLock();
  }, [releaseWakeLock]);

  // ------------------------------------------------------------------ invio dei punti
  const flush = useCallback(async () => {
    if (flushingRef.current) return flushingRef.current;
    lastFlushRef.current = Date.now();
    if (!bufferRef.current.length) return true;
    const run = (async () => {
      // i punti in coda adesso (quelli che arrivano durante l'invio partono al giro dopo); dopo un tratto
      // senza rete possono superare il limite di /stream: si inviano a blocchi, sempre in ordine
      let remaining = bufferRef.current.length;
      let payload = [];
      try {
        while (remaining > 0) {
          payload = bufferRef.current.splice(0, Math.min(remaining, STREAM_MAX_POINTS));
          await trackingService.sendPoints(payload);
          remaining -= payload.length;
          pointsSentRef.current += payload.length;
          payload = [];
          setRide((r) => ({ ...r, pointsSent: pointsSentRef.current, pendingCount: bufferRef.current.length, syncError: null }));
        }
        return true;
      } catch (err) {
        bufferRef.current = payload.concat(bufferRef.current); // stesso ordine al prossimo tentativo
        const code = err?.code || 'network';
        if (code === 'sensors_disabled' || code === 'unauthorized') {
          stopSensors();
          setRide((r) => (r.status === 'active'
            ? pausedState(r, { error: code, pendingCount: bufferRef.current.length })
            : { ...r, error: code, pendingCount: bufferRef.current.length }));
        } else {
          setRide((r) => ({ ...r, syncError: code, pendingCount: bufferRef.current.length }));
        }
        return false;
      } finally {
        flushingRef.current = null;
      }
    })();
    flushingRef.current = run;
    return run;
  }, [stopSensors]);

  // ------------------------------------------------------------------ SOS
  const pendingSosRef = useRef(null);    // {requestId, source, lat, lon, accuracy, sessionId, userId, createdAt, attempt, retryAt}
  const sosInFlightRef = useRef(false);
  const sosRetryTimerRef = useRef(null);
  const userIdRef = useRef(null);
  userIdRef.current = userProfile?.id ?? null;

  const clearSosRetry = useCallback(() => {
    clearTimeout(sosRetryTimerRef.current);
    sosRetryTimerRef.current = null;
  }, []);

  const forgetPendingSos = useCallback(() => {
    clearSosRetry();
    pendingSosRef.current = null;
    savePendingSos(null);
  }, [clearSosRetry]);

  /** Un tentativo dell'SOS in attesa; se non arriva, il prossimo è programmato (5, 10, 20, poi ogni 30 s). */
  const sendPendingSos = useCallback(async () => {
    const pending = pendingSosRef.current;
    if (!pending || sosInFlightRef.current) return;
    clearSosRetry();
    sosInFlightRef.current = true;
    // senza posizione al primo tentativo: quella della sessione, se nel frattempo ne è arrivata una recente
    const fix = rideRef.current.lastFix;
    if (!Number.isFinite(pending.lat) && fix && Date.now() - fix.ts < RECENT_FIX_MS) {
      Object.assign(pending, { lat: fix.lat, lon: fix.lon, accuracy: fix.accuracy });
    }
    pending.attempt = (pending.attempt || 0) + 1;
    savePendingSos(pending);
    setSos({ status: 'sending', source: pending.source, attempt: pending.attempt });
    try {
      const result = await sosService.trigger({
        source: pending.source,
        lat: pending.lat,
        lon: pending.lon,
        accuracyM: pending.accuracy,
        sessionId: pending.sessionId,
        requestId: pending.requestId
      });
      if (pendingSosRef.current !== pending) return; // annullato mentre la richiesta era in corso
      forgetPendingSos();
      setSos({ status: 'sent', source: pending.source, result });
    } catch (err) {
      if (pendingSosRef.current !== pending) return;
      const error = err?.message || 'Errore';
      if (!isRetryableSosError(err)) {
        // il server ha rifiutato questo SOS: riprovare uguale non servirebbe ("Riprova" ne crea uno nuovo)
        forgetPendingSos();
        setSos({ status: 'error', source: pending.source, error, retrying: false });
        return;
      }
      const delay = SOS_RETRY_DELAYS_MS[Math.min(pending.attempt - 1, SOS_RETRY_DELAYS_MS.length - 1)];
      pending.retryAt = Date.now() + delay;
      savePendingSos(pending);
      setSos({ status: 'error', source: pending.source, error, retrying: true, attempt: pending.attempt, retryAt: pending.retryAt });
      sosRetryTimerRef.current = setTimeout(() => sendPendingSosRef.current(), delay);
    } finally {
      sosInFlightRef.current = false;
      // annullato e subito richiesto di nuovo mentre questa richiesta era in corso: parte quello nuovo
      const next = pendingSosRef.current;
      if (next && next !== pending && !next.attempt) sendPendingSosRef.current();
    }
  }, [clearSosRetry, forgetPendingSos]);
  const sendPendingSosRef = useRef(sendPendingSos);
  sendPendingSosRef.current = sendPendingSos;

  /** Con l'app Android a schermo spento i timer rallentano: si controlla anche all'arrivo di GPS e sensori. */
  const retrySosIfDue = useCallback(() => {
    const pending = pendingSosRef.current;
    if (pending?.retryAt && Date.now() >= pending.retryAt && !sosInFlightRef.current) sendPendingSosRef.current();
  }, []);

  const triggerSos = useCallback(async (source = 'manual') => {
    vibrate([200, 100, 200]);
    const existing = pendingSosRef.current;
    if (existing) {
      // c'è già un SOS che aspetta la rete (o la posizione): si riprova subito quello, non se ne crea un altro
      if (existing.attempt) sendPendingSosRef.current();
      return;
    }
    const pending = {
      requestId: newSessionId(),
      source,
      sessionId: rideRef.current.sessionId || undefined,
      userId: userIdRef.current,
      createdAt: Date.now(),
      attempt: 0
    };
    pendingSosRef.current = pending;
    savePendingSos(pending);
    setSos({ status: 'sending', source, attempt: 1 });
    const fix = rideRef.current.lastFix;
    const position = fix && Date.now() - fix.ts < RECENT_FIX_MS ? fix : await currentPosition(8000);
    if (pendingSosRef.current !== pending) return; // annullato mentre si cercava la posizione
    if (position) Object.assign(pending, { lat: position.lat, lon: position.lon, accuracy: position.accuracy });
    await sendPendingSosRef.current();
  }, []);

  // un doppio tocco su "Sto bene" mandava due richieste (il server avvisa comunque una volta sola)
  const resolvingSosRef = useRef(false);
  const resolveSos = useCallback(async () => {
    if (resolvingSosRef.current) return;
    resolvingSosRef.current = true;
    const alertId = sos?.result?.alert?.id;
    try {
      if (alertId) await sosService.resolve(alertId);
      setSos(null);
      showToast(tRef.current.sosResolvedToast || 'SOS annullato: i contatti avvisati riceveranno che stai bene', 'success', 3500);
    } catch (err) {
      showToast(err?.message || 'Errore', 'error');
    } finally {
      resolvingSosRef.current = false;
    }
  }, [sos, showToast]);

  /** Chiude la schermata; se l'SOS non era ancora arrivato, il rider lo annulla e i tentativi si fermano. */
  const dismissSos = useCallback(() => {
    forgetPendingSos();
    setSos(null);
  }, [forgetPendingSos]);

  // ------------------------------------------------------------------ cadute
  const pushFlaggedPoint = useCallback((flags) => {
    const gps = lastGpsRef.current;
    const sessionId = rideRef.current.sessionId;
    if (!gps || !sessionId) return;
    const ts = Math.max(Date.now(), (lastRecordedRef.current?.ts || 0) + 1);
    // vicino all'ultimo punto registrato (rider fermo dopo la caduta): quel punto, così il "ballo" del GPS
    // non aggiunge strada
    const anchor = lastRecordedRef.current;
    const near = anchor && haversineKm(anchor.lat, anchor.lon, gps.lat, gps.lon) * 1000 < MIN_MOVE_M;
    const { lat, lon } = near ? anchor : gps;
    bufferRef.current.push({ session_id: sessionId, lat, lon, speed_kmh: 0, timestamp: ts, ...flags });
    lastRecordedRef.current = { lat, lon, ts };
    flush();
  }, [flush]);

  const endFallCountdown = useCallback(() => {
    clearInterval(fallTimerRef.current);
    fallTimerRef.current = null;
    fallActiveRef.current = false;
    fallDeadlineRef.current = null;
    setFallAlert(null);
    if (isNativeApp()) cancelFallAlert();
  }, []);

  /** Nessuna risposta dopo la caduta (o "Invia SOS ora"): SOS reale. */
  const confirmFall = useCallback(() => {
    endFallCountdown();
    detectorRef.current.confirmAlert();
    pushFlaggedPoint({ is_confirmed_fall: true }); // il worker registra la caduta in fall_events
    triggerSos('fall');
  }, [endFallCountdown, pushFlaggedPoint, triggerSos]);
  const confirmFallRef = useRef(confirmFall);
  confirmFallRef.current = confirmFall;

  /** "Sto bene": allarme annullato. */
  const cancelFall = useCallback(() => {
    endFallCountdown();
    detectorRef.current.resetAlert();
  }, [endFallCountdown]);

  /** Secondi rimasti; a zero parte l'SOS (anche se i timer sono rallentati: conta l'orologio). */
  const checkFallDeadline = useCallback(() => {
    const deadline = fallDeadlineRef.current;
    if (deadline === null) return;
    const secondsLeft = Math.ceil((deadline - Date.now()) / 1000);
    if (secondsLeft > 0) {
      setFallAlert((prev) => (prev?.secondsLeft === secondsLeft ? prev : { secondsLeft }));
    } else {
      confirmFallRef.current();
    }
  }, []);

  const startFallCountdown = useCallback(() => {
    if (fallActiveRef.current) return;
    fallActiveRef.current = true;
    fallDeadlineRef.current = Date.now() + FALL_COUNTDOWN_SEC * 1000;
    setFallAlert({ secondsLeft: FALL_COUNTDOWN_SEC });
    vibrate([500, 200, 500, 200, 500]);
    playSosSound(); // rispetta la preferenza "Suono per SOS e cadute"
    // app Android in background o a schermo spento: il rider vede l'avviso e può aprire l'app per annullare
    if (isNativeApp() && !isAppInForeground()) {
      const texts = tRef.current;
      showFallAlert(texts.nativeFallTitle || 'Caduta rilevata',
        (texts.nativeFallBody || 'SOS automatico tra {sec} secondi: apri RoR e premi "Sto bene" se non ti sei fatto male.')
          .replace('{sec}', String(FALL_COUNTDOWN_SEC)));
    }
    fallTimerRef.current = setInterval(() => {
      vibrate(200);
      checkFallDeadline();
    }, 1000);
  }, [checkFallDeadline]);

  /** Un campione di accelerometro/giroscopio (20 Hz): filtri + rilevatore di cadute. */
  const processSample = useCallback((sample) => {
    if (t0Ref.current === null) t0Ref.current = sample.t;
    const gps = lastGpsRef.current;
    const fresh = gps && Date.now() - gps.time < GPS_STALE_MS;
    let row = {
      time_sec: (sample.t - t0Ref.current) / 1000,
      acc_x: sample.x ?? 0, acc_y: sample.y ?? 0, acc_z: sample.z ?? 0,
      gyro_x: sample.alpha ?? 0, gyro_y: sample.beta ?? 0, gyro_z: sample.gamma ?? 0,
      lat: gps?.lat ?? null, lon: gps?.lon ?? null,
      speed_kmh: fresh ? gps.speed : 0,
      gps_time: gps?.time
    };
    row = processorRef.current.process(row);
    row = detectorRef.current.process(row);
    if (row.is_confirmed_fall && !fallActiveRef.current) startFallCountdown();
    else if (fallActiveRef.current) checkFallDeadline(); // i campioni nativi arrivano anche a schermo spento
    retrySosIfDue();
  }, [startFallCountdown, checkFallDeadline, retrySosIfDue]);

  // ------------------------------------------------------------------ GPS
  const onFix = useCallback((pos) => {
    const { latitude: lat, longitude: lon, accuracy, speed } = pos.coords;
    const ts = Math.round(pos.timestamp || Date.now());
    const deviceSpeed = Number.isFinite(speed) && speed >= 0 ? speed * 3.6 : null;
    lastGpsRef.current = { lat, lon, speed: deviceSpeed, time: Date.now() };
    retrySosIfDue();
    const fix = { lat, lon, accuracy, ts };
    const verdict = evaluateFix(lastRecordedRef.current, fix);
    if (verdict.moving) lastMoveAtRef.current = ts;
    // fermi da qualche secondo: velocità 0 invece di quella del "ballo" del GPS
    const still = !verdict.moving && ts - lastMoveAtRef.current >= STILL_AFTER_MS;
    if (!verdict.accept) {
      setRide((r) => ({
        ...r,
        lastFix: fix,
        gpsWeak: Number.isFinite(accuracy) && accuracy > MAX_FIX_ACCURACY_M,
        currentSpeedKmh: still ? 0 : r.currentSpeedKmh
      }));
      return;
    }
    // da fermi il punto registrato è quello di prima (verdict.point), non la posizione che "balla"
    const { point } = verdict;
    // in movimento quella del GPS (o calcolata); da fermi 0; primo punto o dopo una pausa quella del GPS
    const speedKmh = verdict.moving ? (deviceSpeed ?? verdict.speedKmh) : (verdict.speedKmh === 0 ? 0 : deviceSpeed);
    lastRecordedRef.current = { lat: point.lat, lon: point.lon, ts };
    bufferRef.current.push({
      session_id: rideRef.current.sessionId,
      lat: point.lat,
      lon: point.lon,
      speed_kmh: speedKmh === null ? null : Math.round(speedKmh * 100) / 100,
      timestamp: ts
    });
    setRide((r) => {
      const last = r.track[r.track.length - 1];
      const samePlace = last && last[0] === point.lat && last[1] === point.lon;
      const track = samePlace ? r.track
        : r.track.length >= TRACK_MAX ? [...r.track.slice(1), [point.lat, point.lon]] : [...r.track, [point.lat, point.lon]];
      return {
        ...r,
        lastFix: fix,
        gpsWeak: false,
        distanceKm: r.distanceKm + verdict.distanceKm,
        movingMs: r.movingMs + verdict.movingMs,
        currentSpeedKmh: verdict.moving ? speedKmh : (still ? 0 : r.currentSpeedKmh),
        maxSpeedKmh: verdict.moving ? Math.max(r.maxSpeedKmh, speedKmh || 0) : r.maxSpeedKmh,
        pendingCount: bufferRef.current.length,
        track
      };
    });
    // anche all'arrivo di ogni posizione: con lo schermo spento il timer dei 20 s può rallentare
    if (Date.now() - lastFlushRef.current >= FLUSH_MS) flush();
  }, [flush, retrySosIfDue]);

  const onGeoError = useCallback((err) => {
    if (err && err.code === 1) { // permesso negato
      stopSensors();
      setRide((r) => pausedState(r, { error: 'geolocation_denied' }));
    } else {
      setRide((r) => ({ ...r, gpsWeak: true }));
    }
  }, [stopSensors]);

  const beginSensors = useCallback((withMotion) => {
    stopSensors();
    const gen = sensorsGenRef.current;
    const texts = tRef.current;
    watchLocation(onFix, onGeoError, {
      title: texts.nativeTrackingTitle || 'RoR registra il percorso',
      message: texts.nativeTrackingBody || 'GPS e rilevamento cadute attivi anche a schermo spento. Termina la sessione dalla Home.'
    }).then((stop) => {
      if (gen === sensorsGenRef.current) stopLocationRef.current = stop;
      else stop(); // sessione già messa in pausa o terminata
    }).catch(() => onGeoError({ code: 2 }));
    if (withMotion) {
      watchMotion(processSample).then((stop) => {
        if (gen !== sensorsGenRef.current) stop?.();
        else if (stop) stopMotionRef.current = stop;
        else setRide((r) => ({ ...r, motionActive: false })); // telefono senza accelerometro
      }).catch(() => setRide((r) => ({ ...r, motionActive: false })));
    }
    lastFlushRef.current = Date.now();
    flushTimerRef.current = setInterval(flush, FLUSH_MS);
    acquireWakeLock();
  }, [stopSensors, onFix, onGeoError, processSample, flush, acquireWakeLock]);

  // ------------------------------------------------------------------ comandi
  /** Controlli comuni ad avvio e ripresa; va chiamata dal tocco dell'utente (permessi iOS). */
  const prepare = useCallback(() => {
    if (!userProfile?.sensorsEnabled) {
      setRide((r) => ({ ...r, error: 'sensors_disabled' }));
      return null;
    }
    if (isNativeApp()) {
      // app Android: sensori nativi senza permesso; le notifiche servono per la notifica fissa del GPS
      // e per l'avviso di caduta a schermo spento (se negate la sessione funziona lo stesso)
      getAudioContext();
      return requestNotificationPermission().then(() => true, () => true);
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setRide((r) => ({ ...r, error: 'geolocation_unsupported' }));
      return null;
    }
    // iOS/Safari attivano l'audio solo dentro un tocco dell'utente: lo si prepara qui, così
    // il suono dell'allarme caduta potrà partire più tardi dal timer
    getAudioContext();
    return requestMotionPermission();
  }, [userProfile]);

  const start = useCallback(async () => {
    if (rideRef.current.status !== 'idle') return false;
    const permission = prepare();
    if (!permission) return false;
    const withMotion = await permission;
    bufferRef.current = [];
    lastRecordedRef.current = null;
    lastGpsRef.current = null;
    pointsSentRef.current = 0;
    processorRef.current = new SignalProcessor();
    detectorRef.current = new FallDetector();
    t0Ref.current = null;
    const now = Date.now();
    setLastResult(null);
    setRide({ ...emptyRide(), status: 'active', sessionId: newSessionId(), userId: userProfile?.id ?? null, startedAt: now, resumedAt: now, motionActive: withMotion });
    beginSensors(withMotion);
    return true;
  }, [prepare, beginSensors, userProfile]);

  const pause = useCallback(() => {
    if (rideRef.current.status !== 'active') return;
    stopSensors();
    setRide((r) => pausedState(r));
    flush();
  }, [stopSensors, flush]);

  const resume = useCallback(async () => {
    if (rideRef.current.status !== 'paused') return false;
    const permission = prepare();
    if (!permission) return false;
    const withMotion = await permission;
    setRide((r) => ({ ...r, status: 'active', resumedAt: Date.now(), error: null, restored: false, motionActive: withMotion }));
    beginSensors(withMotion);
    return true;
  }, [prepare, beginSensors]);

  /** Invia i punti rimasti e chiude la sessione: il percorso viene salvato dal GPS worker. */
  const stop = useCallback(async () => {
    const current = rideRef.current;
    if (!current.sessionId || current.status === 'stopping') return false;
    stopSensors();
    setRide((r) => ({ ...(r.status === 'active' ? pausedState(r) : r), status: 'stopping', syncError: null, error: null }));
    // se un invio era già in corso, flush() restituisce quello: i punti arrivati nel frattempo
    // restano in coda e vanno inviati prima di chiudere la sessione
    let sent = await flush();
    while (sent && bufferRef.current.length) sent = await flush();
    if (!sent) {
      setRide((r) => ({ ...r, status: 'paused', syncError: r.error ? r.syncError : 'not_sent' }));
      return false;
    }
    try {
      await trackingService.endSession(current.sessionId);
    } catch (err) {
      setRide((r) => ({ ...r, status: 'paused', syncError: err?.code === 'unauthorized' ? null : 'end_failed', error: err?.code === 'unauthorized' ? 'unauthorized' : r.error }));
      return false;
    }
    const finished = rideRef.current;
    setLastResult({
      sessionId: current.sessionId,
      distanceKm: finished.distanceKm,
      activeMs: rideElapsedMs(finished),
      pointsSent: pointsSentRef.current,
      endedAt: Date.now()
    });
    bufferRef.current = [];
    lastRecordedRef.current = null;
    setRide(emptyRide());
    return true;
  }, [stopSensors, flush]);

  const clearError = useCallback(() => setRide((r) => ({ ...r, error: null, syncError: null })), []);
  const clearLastResult = useCallback(() => setLastResult(null), []);

  const discardRide = useCallback(() => {
    stopSensors();
    bufferRef.current = [];
    lastRecordedRef.current = null;
    setRide(emptyRide());
  }, [stopSensors]);

  // Logout volontario o accesso di un altro utente: la sessione non si riprende né si invia.
  // Accesso scaduto (es. il telefono ha chiuso l'app e perso il cookie): la sessione va in pausa e
  // resta sul telefono con i punti non inviati; riprende quando lo stesso utente accede di nuovo.
  // (Durante la verifica iniziale della sessione il profilo può mancare: non è un logout.)
  useEffect(() => {
    const current = rideRef.current;
    if (!current.sessionId) return;
    const otherUser = userProfile && current.userId !== null && current.userId !== userProfile.id;
    if (otherUser) {
      discardRide();
    } else if (userProfile === null && authStatus === 'anonymous' && current.status === 'active') {
      stopSensors();
      setRide((r) => pausedState(r, { restored: true }));
    }
  }, [userProfile, authStatus, stopSensors, discardRide]);

  useEffect(() => {
    const onLogout = () => {
      discardRide();
      forgetPendingSos(); // chi esce volontariamente sta bene: il suo SOS in attesa non parte più
      setSos(null);
    };
    window.addEventListener('ror:logout', onLogout);
    return () => window.removeEventListener('ror:logout', onLogout);
  }, [discardRide, forgetPendingSos]);

  // accesso di un altro utente: l'SOS in attesa del precedente non parte a nome suo
  useEffect(() => {
    const pending = pendingSosRef.current;
    if (pending && userProfile && pending.userId !== null && pending.userId !== userProfile.id) {
      forgetPendingSos();
      setSos(null);
    }
  }, [userProfile, forgetPendingSos]);

  // SOS rimasto sul telefono (app chiusa dal sistema, ricaricamento): riparte appena si sa chi è l'utente
  const sosUserId = userProfile?.id ?? null;
  useEffect(() => {
    if (sosUserId === null || pendingSosRef.current) return;
    const stored = loadPendingSos();
    if (!stored) return;
    if (stored.userId !== sosUserId || !(Date.now() - stored.createdAt <= PENDING_SOS_MAX_AGE_MS)) {
      savePendingSos(null);
      return;
    }
    pendingSosRef.current = stored;
    sendPendingSosRef.current();
  }, [sosUserId]);

  // la rete è tornata: non si aspetta il prossimo tentativo programmato
  useEffect(() => {
    const onOnline = () => {
      if (pendingSosRef.current?.attempt) sendPendingSosRef.current();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  useEffect(() => () => {
    stopSensors();
    clearInterval(fallTimerRef.current);
    clearSosRetry();
  }, [stopSensors, clearSosRetry]);

  // ------------------------------------------------------------------ SOS dei gruppi (e mio SOS ancora attivo)
  const seenAlertsRef = useRef(new Set());
  const pollUserId = userProfile?.id ?? null; // il polling si riavvia solo se cambia utente
  const sosPollMs = usePollInterval(SOS_POLL_MS, SOS_POLL_PUSH_MS);
  const pollSosRef = useRef(() => {});
  useEffect(() => {
    if (pollUserId === null) {
      setGroupAlerts([]);
      return undefined;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const data = await sosService.active();
        if (cancelled) return;
        const alerts = Array.isArray(data?.groups) ? data.groups : [];
        setGroupAlerts(alerts);
        alerts.filter((a) => !seenAlertsRef.current.has(a.id)).forEach((a) => {
          seenAlertsRef.current.add(a.id);
          vibrate([300, 100, 300]);
          showToast(`🚨 ${a.username} ${tRef.current.sosGroupToast || 'ha inviato un SOS'}`, 'warning', 6000);
        });
        if (data?.mine) setSos((prev) => prev || { status: 'sent', source: data.mine.source, result: { alert: data.mine, contacts: null, notifications: null } });
        // il server ha risposto: la rete c'è, l'SOS in attesa riprova subito. È anche ciò che corregge la schermata
        // "non inviato" quando il primo tentativo era arrivato e si era persa solo la risposta (stesso request_id).
        if (pendingSosRef.current?.attempt && !sosInFlightRef.current) sendPendingSosRef.current();
      } catch {
        // offline: si riprova al prossimo giro
      }
    };
    pollSosRef.current = poll;
    poll();
    const interval = setInterval(poll, sosPollMs);
    return () => {
      cancelled = true;
      pollSosRef.current = () => {};
      clearInterval(interval);
    };
  }, [pollUserId, showToast, sosPollMs]);

  // push di un SOS con l'app aperta o ritorno in primo piano: controllo immediato
  useRefreshOn(['sicurezza'], () => pollSosRef.current());

  const value = useMemo(() => ({
    ride, start, pause, resume, stop, flush, clearError,
    lastResult, clearLastResult,
    fallAlert, cancelFall, confirmFall,
    sos, triggerSos, resolveSos, dismissSos,
    groupAlerts
  }), [ride, start, pause, resume, stop, flush, clearError, lastResult, clearLastResult,
    fallAlert, cancelFall, confirmFall, sos, triggerSos, resolveSos, dismissSos, groupAlerts]);

  return <RideTrackingContext.Provider value={value}>{children}</RideTrackingContext.Provider>;
};

/** Stato e comandi della sessione di guida (null fuori dal provider, es. in alcuni test). */
export const useRideTracking = () => useContext(RideTrackingContext);
