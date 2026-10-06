/**
 * Utilità geografiche per il tracciamento GPS.
 */

/** Distanza in km tra due coordinate (formula dell'emisenoverso, come il GPS worker). */
export const haversineKm = (lat1, lon1, lat2, lon2) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dPhi = toRad(lat2 - lat1);
  const dLambda = toRad(lon2 - lon1);
  const a = Math.sin(dPhi / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLambda / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
};

/** Precisione massima (m) perché una posizione venga registrata nel percorso. */
export const MAX_FIX_ACCURACY_M = 50;
/** Velocità oltre la quale uno spostamento tra due posizioni è considerato un salto del GPS. */
export const MAX_PLAUSIBLE_SPEED_KMH = 90;
/** Come il GPS worker (PAUSE_GAP_SEC): oltre questo intervallo senza punti è una pausa. */
export const PAUSE_GAP_MS = 120000;
/**
 * Da fermi la posizione del GPS "balla" di qualche metro: una posizione conta come movimento solo se è ad
 * almeno MIN_MOVE_M dall'ultima registrata (1,5 × la precisione se è meno precisa, fino a MAX_MOVE_M) e lo
 * spostamento va almeno a MIN_MOVING_SPEED_KMH (più lento è la deriva della posizione). Prima ogni "ballo"
 * si sommava: 70 m in un minuto e mezzo da fermi. Stesse regole del GPS worker (MIN_MOVE_M nel server).
 */
export const MIN_MOVE_M = 15;
export const MAX_MOVE_M = 40;
export const MIN_MOVING_SPEED_KMH = 2;
/**
 * Da fermi si registra comunque un punto ogni 15 s, nella posizione di prima: il "ballo" del GPS non diventa
 * strada né tempo in movimento, la posizione vista dai gruppi (scade dopo 90 s) resta viva e alla ripartenza
 * contano al massimo 15 s di sosta (chi spinge la bici a 4 km/h fa 15 m in 13,5 s: il suo tempo conta tutto).
 */
export const STILL_POINT_MS = 15000;

/** Spostamento minimo (m) per contare come movimento una posizione con questa precisione. */
export const moveThresholdM = (accuracy) =>
  Math.min(MAX_MOVE_M, Math.max(MIN_MOVE_M, Number.isFinite(accuracy) ? 1.5 * accuracy : 0));

/**
 * Decide se registrare una nuova posizione e quanta distanza aggiunge.
 * @param {{lat:number, lon:number, ts:number}|null} previous - ultima posizione registrata
 * @param {{lat:number, lon:number, ts:number, accuracy:number}} fix
 * @returns {{accept: boolean, moving: boolean, distanceKm: number, speedKmh: number|null, movingMs: number,
 *   point: {lat:number, lon:number}|null}} point = posizione da registrare (da fermi quella di prima)
 */
export const evaluateFix = (previous, fix) => {
  const skip = { accept: false, moving: false, distanceKm: 0, speedKmh: null, movingMs: 0, point: null };
  if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lon)) return skip;
  if (Number.isFinite(fix.accuracy) && fix.accuracy > MAX_FIX_ACCURACY_M) return skip;
  const here = { lat: fix.lat, lon: fix.lon };
  if (!previous) return { ...skip, accept: true, point: here };
  if (fix.ts <= previous.ts) return skip;
  const gapMs = fix.ts - previous.ts;
  // dopo una pausa lo spostamento non si conta (stessa regola del GPS worker)
  if (gapMs > PAUSE_GAP_MS) return { ...skip, accept: true, point: here };
  const distanceKm = haversineKm(previous.lat, previous.lon, fix.lat, fix.lon);
  const speedKmh = distanceKm / (gapMs / 3600000);
  if (speedKmh > MAX_PLAUSIBLE_SPEED_KMH) return { ...skip, speedKmh };
  if (distanceKm * 1000 >= moveThresholdM(fix.accuracy) && speedKmh >= MIN_MOVING_SPEED_KMH) {
    return { accept: true, moving: true, distanceKm, speedKmh, movingMs: gapMs, point: here };
  }
  // fermo, o ancora dentro il margine del GPS
  if (gapMs >= STILL_POINT_MS) return { ...skip, accept: true, speedKmh: 0, point: { lat: previous.lat, lon: previous.lon } };
  return { ...skip, speedKmh: 0 };
};

/** UUID v4 per l'ID di sessione (crypto.randomUUID esiste solo in contesti sicuri). */
export const newSessionId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256); // solo ambienti senza Web Crypto
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

/**
 * Chiede il permesso per i sensori di movimento (obbligatorio su iOS Safari; altrove è implicito).
 * Va chiamata direttamente dal gestore di un tocco dell'utente.
 * @returns {Promise<boolean>}
 */
export const requestMotionPermission = async () => {
  if (typeof window === 'undefined') return false;
  try {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      return (await DeviceMotionEvent.requestPermission()) === 'granted';
    }
    return typeof DeviceMotionEvent !== 'undefined';
  } catch {
    return false;
  }
};
