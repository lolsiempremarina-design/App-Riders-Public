/**
 * Token delle notifiche push dell'app Android (API Flask: /api/devices).
 * Il server lo cancella da solo al logout e quando Firebase lo rifiuta.
 */
import { api } from './api';

export const deviceService = {
  /** @returns {Promise<{registered: boolean, pushEnabled: boolean}>} pushEnabled = il server invia le push */
  register: (token) => api.post('/devices', { token, platform: 'android' }),

  unregister: (token) => api.delete('/devices', { body: { token } })
};
