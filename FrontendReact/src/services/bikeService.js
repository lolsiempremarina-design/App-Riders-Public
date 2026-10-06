/**
 * Bici della community (API Flask: /api/bikes). Elenco e scheda sono pubblici (QR sulla bici);
 * collegare una bici richiede l'accesso: da quel momento le uscite GPS vengono conteggiate per lei.
 */
import { renderSVG } from 'uqr';
import { api } from './api';

const code = (value) => encodeURIComponent(value);

/** URL pubblico della scheda (quello stampato nel QR). */
export const bikePublicUrl = (bikeCode, origin = typeof window !== 'undefined' ? window.location.origin : '') =>
  `${origin}/bici/${code(bikeCode)}`;

/**
 * Immagine QR (SVG in un data URL) dell'URL pubblico della bici, generata sul telefono:
 * nessun servizio esterno riceve l'indirizzo. È vettoriale, quindi nitida a qualsiasi dimensione.
 */
export const bikeQrImageUrl = (bikeCode) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderSVG(bikePublicUrl(bikeCode), { ecc: 'M', border: 2 }))}`;

export const bikeService = {
  list: async () => {
    const data = await api.get('/bikes');
    return Array.isArray(data?.bikes) ? data.bikes : [];
  },
  get: async (bikeCode) => (await api.get(`/bikes/${code(bikeCode)}`)).bike,
  mine: async () => (await api.get('/bikes/mine')).bike,
  link: async (bikeCode) => (await api.post(`/bikes/${code(bikeCode)}/link`)).bike,
  unlink: async () => api.delete('/bikes/mine')
};
