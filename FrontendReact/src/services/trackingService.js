/**
 * Invio dei punti GPS al servizio di ingestione (FastAPI dietro Nginx, stesso dominio):
 *  - POST /stream        → array di punti della sessione (RabbitMQ → GPS worker)
 *  - POST /session/end   → chiusura della sessione: il worker scrive il GPX e la riga in rider_shifts
 * L'autenticazione è il cookie di sessione Flask (FastAPI lo verifica su /auth/check_session).
 * Nell'app Android partono dal codice nativo: continuano anche a schermo spento (src/native/http.js).
 */
import { ApiError } from './api';
import { backgroundSafeFetch } from '../native/http';

const INGEST_BASE = (import.meta.env.VITE_INGEST_URL || '').replace(/\/$/, '');

const post = async (path, body) => {
  let response;
  try {
    response = await backgroundSafeFetch(`${INGEST_BASE}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    });
  } catch {
    throw new ApiError('Connessione assente: i punti verranno inviati appena possibile.', 0, null);
  }
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    const code = { 401: 'unauthorized', 403: 'sensors_disabled', 422: 'validation_error', 503: 'service_unavailable' }[response.status] || 'server_error';
    if (response.status === 401 && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('ror:unauthorized'));
    throw new ApiError(typeof data?.detail === 'string' ? data.detail : `Errore HTTP ${response.status}`, response.status, { error: code, detail: data?.detail });
  }
  return data;
};

export const trackingService = {
  /**
   * @param {Array<{session_id: string, lat: number, lon: number, speed_kmh: number|null, timestamp: number,
   *   is_confirmed_fall?: boolean, is_cancelled_fall?: boolean}>} points
   */
  sendPoints: async (points) => (points.length ? post('/stream', points) : { status: 'ok', count: 0 }),

  endSession: async (sessionId) => post('/session/end', { session_id: sessionId })
};
