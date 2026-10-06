/**
 * Storico dei percorsi GPS registrati (API Flask: /api/routes).
 */
import { api, ApiError, getApiBaseUrl, serverUnreachableMessage } from './api';
import { shareTextFile } from '../native/system';

export const routeService = {
  /** @returns {Promise<{routes: Array<object>, total: number, limit: number, offset: number}>} */
  list: async ({ limit = 20, offset = 0 } = {}) => api.get(`/routes?limit=${limit}&offset=${offset}`),

  /** Dettaglio con i punti della traccia: points = [[lat, lon, isoTime], ...]. */
  get: async (id) => api.get(`/routes/${encodeURIComponent(id)}`),

  /** URL del file GPX (stesso dominio: il cookie di sessione viene inviato dal browser). */
  gpxUrl: (id) => `${getApiBaseUrl()}/routes/${encodeURIComponent(id)}/gpx`,

  /** App Android: il GPX si condivide con il menu di Android (la WebView non scarica file). */
  shareGpx: async (id, filename) => {
    let response;
    try {
      response = await fetch(routeService.gpxUrl(id), { credentials: 'include' });
    } catch {
      throw new ApiError(serverUnreachableMessage(), 0, null);
    }
    if (!response.ok) throw new ApiError(`Errore HTTP ${response.status}`, response.status, null);
    await shareTextFile(filename, await response.text(), 'application/gpx+xml');
  },

  remove: async (id) => api.delete(`/routes/${encodeURIComponent(id)}`)
};
