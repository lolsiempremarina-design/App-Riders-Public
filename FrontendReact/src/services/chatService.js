/**
 * Chat di gruppo: storico e invio via HTTP (API Flask /api/groups/<id>/messages).
 * I messaggi in tempo reale arrivano dal WebSocket /ws/chat/<id> (hook useWebSocket); l'invio resta HTTP
 * anche con il WebSocket connesso, perché risponde con il messaggio salvato o con un errore.
 */
import { api } from './api';

const id = (value) => encodeURIComponent(value);

export const chatService = {
  /** @returns {Promise<{messages: Array<object>, hasMore: boolean}>} dal più vecchio al più recente */
  history: async (groupId, beforeId) => {
    const query = beforeId ? `?before=${id(beforeId)}` : '';
    const data = await api.get(`/groups/${id(groupId)}/messages${query}`);
    return { messages: Array.isArray(data?.messages) ? data.messages : [], hasMore: Boolean(data?.hasMore) };
  },

  /** @returns {Promise<object>} il messaggio salvato (il server lo inoltra anche via WebSocket) */
  send: async (groupId, text) => (await api.post(`/groups/${id(groupId)}/messages`, { text })).message,

  sendLocation: async (groupId, lat, lon, text) =>
    (await api.post(`/groups/${id(groupId)}/messages`, { kind: 'location', lat, lon, ...(text ? { text } : {}) })).message
};
