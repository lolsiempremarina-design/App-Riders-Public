/**
 * Servizio per profilo, password, contatti SOS e impostazioni del rider
 * (API Flask: /api/profile, /api/sos-contacts, /api/settings).
 */
import { api } from './api';
import { mapUserToProfile } from './authService';

/** Converte la risposta di /api/profile in { profile, stats }. */
const toProfileResponse = (data) => ({
  profile: mapUserToProfile(data?.user),
  stats: {
    ridesCount: Number(data?.stats?.ridesCount || 0),
    totalDistanceKm: Number(data?.stats?.totalDistanceKm || 0),
    totalDurationMin: Number(data?.stats?.totalDurationMin || 0)
  }
});

/** Livello del rider calcolato dai km reali percorsi. */
export const riderLevelFromKm = (km) => {
  const value = Number(km) || 0;
  if (value >= 500) return { key: 'oro', label: 'LIV ORO • EXPERT' };
  if (value >= 150) return { key: 'argento', label: 'LIV ARGENTO • PRO' };
  if (value >= 30) return { key: 'bronzo', label: 'LIV BRONZO • RIDER' };
  return { key: 'base', label: 'LIV BASE • NUOVO RIDER' };
};

export const profileService = {
  /** @returns {Promise<{profile: object, stats: object}>} */
  getProfile: async () => toProfileResponse(await api.get('/profile')),

  /**
   * Aggiorna i dati di contatto e/o la foto.
   * @param {{username?: string, email?: string, phone_number?: string, avatar?: string|null}} changes
   */
  updateProfile: async (changes) => toProfileResponse(await api.patch('/profile', changes)),

  /** Cambia la password (la sessione corrente resta attiva, gli altri dispositivi vengono disconnessi). */
  changePassword: async (currentPassword, newPassword, newPasswordConfirm) =>
    api.post('/profile/password', {
      current_password: currentPassword,
      new_password: newPassword,
      new_password_confirm: newPasswordConfirm
    }),

  /** @returns {Promise<{contacts: Array<object>, maxContacts: number}>} */
  listSosContacts: async () => {
    const data = await api.get('/sos-contacts');
    return { contacts: Array.isArray(data?.contacts) ? data.contacts : [], maxContacts: data?.maxContacts || 5 };
  },

  /** @param {{name: string, phone: string, relationship?: string, email?: string, priority?: number}} contact */
  addSosContact: async (contact) => api.post('/sos-contacts', contact),

  updateSosContact: async (id, changes) => api.patch(`/sos-contacts/${id}`, changes),

  removeSosContact: async (id) => api.delete(`/sos-contacts/${id}`),

  /** @returns {Promise<{language: string, sensorsEnabled: boolean, shareLocationWithGroups: boolean}>} */
  getSettings: async () => api.get('/settings'),

  /** @param {{language?: string, sensors_enabled?: boolean, share_location_with_groups?: boolean}} changes */
  updateSettings: async (changes) => api.patch('/settings', changes)
};
