import { api } from './api';
import { downloadJSON } from '../utils/exportUtils';

/**
 * Dati personali (GDPR): esportazione completa e informazioni privacy dal server.
 */
export const accountService = {
  /** Scarica GET /api/account/export così com'è (chiavi originali del server) come file JSON. */
  async downloadExport(username = 'rider') {
    const data = await api.get('/account/export', { raw: true });
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    await downloadJSON(`ror-dati-personali-${username}-${day}.json`, data);
    return data;
  },

  /** Titolare del trattamento e tempi di conservazione configurati sul server (pubblico). */
  privacyInfo: () => api.get('/legal/privacy', { raw: true })
};
