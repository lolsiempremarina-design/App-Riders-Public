/**
 * Ordini di consegna (API Flask: /api/orders). Gli ordini li crea l'amministratore
 * dal pannello /web/admin/; il rider li accetta, conferma il ritiro e la consegna.
 */
import { api } from './api';

export const ORDER_PERIODS = ['today', 'week', 'month', 'year', 'all'];

export const orderService = {
  /** @returns {Promise<Array<object>>} offerte ancora valide, le più recenti per prime */
  getAvailableOrders: async () => {
    const data = await api.get('/orders/available');
    return Array.isArray(data?.orders) ? data.orders : [];
  },

  /** @returns {Promise<object|null>} l'ordine accettato o ritirato dal rider */
  getActiveOrder: async () => (await api.get('/orders/active'))?.order || null,

  /** @returns {Promise<object>} l'ordine accettato (409 order_unavailable / active_order_exists) */
  acceptOrder: async (orderId) => (await api.post(`/orders/${encodeURIComponent(orderId)}/accept`)).order,

  /**
   * @param {'picked_up'|'delivered'|'released'} status
   * @returns {Promise<object>} l'ordine aggiornato
   */
  updateOrderStatus: async (orderId, status) =>
    (await api.patch(`/orders/${encodeURIComponent(orderId)}/status`, { status })).order,

  /** @returns {Promise<{period: string, orders: Array<object>, summary: object}>} */
  getCompletedOrders: async (period = 'today') => api.get(`/orders/completed?period=${encodeURIComponent(period)}`)
};
