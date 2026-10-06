/**
 * Guadagni e punteggio del rider (API Flask: /api/rider/earnings, /api/score).
 * I guadagni sono la somma di compenso + bonus degli ordini consegnati: l'app non gestisce pagamenti.
 */
import { api } from './api';

export const riderService = {
  /**
   * @param {'today'|'week'|'month'|'year'|'all'} [period='week']
   * @returns {Promise<{period: string, summary: object, days: Array<object>}>}
   */
  getEarnings: async (period = 'week') => api.get(`/rider/earnings?period=${encodeURIComponent(period)}`),

  /** @returns {Promise<{today: string, days: Array<object>, total: number, rules: object}>} */
  getScore: async (days = 7) => api.get(`/score?days=${Number(days) || 7}`)
};
