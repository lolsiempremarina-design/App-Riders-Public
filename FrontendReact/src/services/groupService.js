/**
 * Gruppi di rider (API Flask: /api/groups).
 */
import { api } from './api';

const id = (value) => encodeURIComponent(value);

/** Link d'invito dell'app React costruito dal token restituito ai gestori del gruppo. */
export const buildInviteLink = (token, origin = typeof window !== 'undefined' ? window.location.origin : '') =>
  token ? `${origin}/gruppi?invito=${encodeURIComponent(token)}` : '';

export const groupService = {
  /** @returns {Promise<Array<object>>} gruppi di cui faccio parte */
  list: async () => {
    const data = await api.get('/groups');
    return Array.isArray(data?.groups) ? data.groups : [];
  },

  get: async (groupId) => api.get(`/groups/${id(groupId)}`),

  /** @param {{name: string, description?: string}} group */
  create: async (group) => api.post('/groups', group),

  update: async (groupId, changes) => api.patch(`/groups/${id(groupId)}`, changes),

  /** Unisciti con il codice del gruppo (es. abc-defg-hij). */
  joinByCode: async (code) => api.post('/groups/join', { code }),

  /** Unisciti con il token di un link d'invito. */
  joinByToken: async (token) => api.post('/groups/join', { token }),

  regenerateCode: async (groupId) => api.post(`/groups/${id(groupId)}/code`),
  regenerateInvite: async (groupId) => api.post(`/groups/${id(groupId)}/invite`),
  revokeInvite: async (groupId) => api.delete(`/groups/${id(groupId)}/invite`),

  setMemberRole: async (groupId, userId, role) => api.patch(`/groups/${id(groupId)}/members/${id(userId)}`, { role }),
  removeMember: async (groupId, userId) => api.delete(`/groups/${id(groupId)}/members/${id(userId)}`),

  /** Posizioni in tempo reale degli altri membri che le condividono. */
  positions: async (groupId) => {
    const data = await api.get(`/groups/${id(groupId)}/positions`);
    return Array.isArray(data?.positions) ? data.positions : [];
  },

  /**
   * Posizioni dei membri di tutti i miei gruppi (ognuno una volta) con una sola richiesta.
   * @returns {Promise<{positions: Array<object>, groupCount: number}>}
   */
  allPositions: async () => {
    const data = await api.get('/groups/positions');
    return {
      positions: Array.isArray(data?.positions) ? data.positions : [],
      groupCount: Number(data?.groupCount) || 0
    };
  },

  /** Pubblica la mia posizione ai miei gruppi (scade dopo 90 s). */
  sharePosition: async (lat, lon) => api.post('/groups/position', { lat, lon })
};
