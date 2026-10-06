/**
 * SOS del rider (API Flask: /api/sos).
 */
import { api } from './api';

/** Numero unico di emergenza europeo. */
export const EMERGENCY_NUMBER = '112';

/**
 * Link sms: con testo precompilato (l'invio resta un'azione dell'utente sul telefono).
 * @param {object} [texts] - traduzioni dell'app (t): il testo è nella lingua del rider, come l'email SOS ai contatti
 *   (prima era sempre in italiano)
 */
export const buildSosSmsLink = (phone, mapUrl, texts = {}) => {
  const body = texts.sosSmsBody || 'SOS: ho bisogno di aiuto.';
  const where = (texts.sosSmsPosition || 'La mia posizione: {url}').replace('{url}', mapUrl || '');
  const text = mapUrl ? `${body} ${where}` : body;
  return `sms:${String(phone || '').replace(/[^\d+]/g, '')}?body=${encodeURIComponent(text)}`;
};

export const buildTelLink = (phone) => `tel:${String(phone || '').replace(/[^\d+]/g, '')}`;

export const sosService = {
  /**
   * @param {{source?: 'manual'|'fall', lat?: number, lon?: number, accuracyM?: number, sessionId?: string,
   *   requestId?: string}} options - requestId (UUID) uguale in tutti i tentativi automatici dello stesso SOS
   * @returns {Promise<{alert: object, created: boolean, notifications: object, contacts: Array<object>}>}
   */
  trigger: async ({ source = 'manual', lat, lon, accuracyM, sessionId, requestId } = {}) => {
    const body = { source };
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      body.lat = lat;
      body.lon = lon;
      if (Number.isFinite(accuracyM)) body.accuracy_m = accuracyM;
    }
    if (sessionId) body.session_id = sessionId;
    if (requestId) body.request_id = requestId;
    // un SOS dopo una caduta può partire con lo schermo spento (app Android)
    return api.post('/sos', body, { background: true });
  },

  resolve: async (alertId) => api.post(`/sos/${encodeURIComponent(alertId)}/resolve`),

  /** @returns {Promise<{mine: object|null, groups: Array<object>}>} */
  active: async () => api.get('/sos/active')
};
