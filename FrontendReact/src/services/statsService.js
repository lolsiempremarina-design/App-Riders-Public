/**
 * Statistiche reali del rider (API Flask: /api/stats/*).
 * I dati provengono dai percorsi GPS registrati e dalle attività salvate:
 * nessun valore viene stimato o generato nel frontend.
 */
import { api } from './api';

export const STATS_PERIODS = ['week', 'month', 'year', 'always'];

export const statsService = {
  /**
   * Suddivisione per periodo (chip) con serie per il grafico.
   * @param {'week'|'month'|'year'|'always'} period
   * @returns {Promise<{period: string, today: string, summary: object, buckets: Array<object>}>}
   */
  getPeriod: async (period = 'week') => {
    if (!STATS_PERIODS.includes(period)) throw new Error(`Periodo non valido: ${period}`);
    return api.get(`/stats/period?period=${period}`);
  },

  /** Ultimi 7 giorni + totali della settimana e di sempre. */
  getOverview: async () => api.get('/stats/overview')
};
