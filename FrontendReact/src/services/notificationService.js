/**
 * Notifiche in app create dal server (ordini, SOS, gruppi, bici): API Flask /api/notifications.
 */
import { api } from './api';

const categoryQuery = (category) => (category ? `?category=${encodeURIComponent(category)}` : '');

export const notificationService = {
  /** @returns {Promise<{notifications: Array<object>, unreadCount: number}>} */
  list: async ({ limit = 50, afterId } = {}) => {
    const query = new URLSearchParams({ limit: String(limit) });
    if (afterId) query.set('after_id', String(afterId));
    const data = await api.get(`/notifications?${query}`);
    return { notifications: Array.isArray(data?.notifications) ? data.notifications : [], unreadCount: data?.unreadCount || 0 };
  },
  markRead: async (id, read = true) => api.post(`/notifications/${encodeURIComponent(id)}/read`, { read }),
  /** @param {string|null} [category] - solo questa categoria (quella sullo schermo); senza: tutte */
  markAllRead: async (category) => api.post(`/notifications/read-all${categoryQuery(category)}`),
  remove: async (id) => api.delete(`/notifications/${encodeURIComponent(id)}`),
  /** @param {string|null} [category] - solo questa categoria (quella sullo schermo); senza: tutte */
  clear: async (category) => api.delete(`/notifications${categoryQuery(category)}`)
};
