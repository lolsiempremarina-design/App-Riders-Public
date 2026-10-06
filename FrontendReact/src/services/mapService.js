/**
 * Punti d'interesse della mappa dal database del backend (API Flask: /api/v1/*),
 * interrogati per geohash a 5 caratteri al posto di servizi esterni (Overpass).
 */
import { api } from './api';

/** Livelli disponibili: chiave → percorso API (relativo a /api). */
export const POI_LAYERS = {
  parkings: '/v1/bicycle-parkings',
  fountains: '/v1/fountains',
  toilets: '/v1/toilets',
  repair: '/v1/bicycle_repair'
};

/** Numero massimo di geohash per richiesta (URL corti, risposte leggere). */
const CHUNK = 20;

export const mapService = {
  /**
   * @param {keyof POI_LAYERS} layer
   * @param {string[]} geohashes
   * @returns {Promise<Array<{id: number, lat: number, lng: number}>>}
   */
  getPoints: async (layer, geohashes) => {
    const path = POI_LAYERS[layer];
    if (!path) throw new Error(`Livello mappa sconosciuto: ${layer}`);
    if (!geohashes?.length) return [];
    const chunks = [];
    for (let i = 0; i < geohashes.length; i += CHUNK) chunks.push(geohashes.slice(i, i + CHUNK));
    const results = await Promise.all(chunks.map((c) => api.get(`${path}?gh5=${c.join(',')}`)));
    return results.flatMap((r) => (Array.isArray(r) ? r : []));
  }
};
