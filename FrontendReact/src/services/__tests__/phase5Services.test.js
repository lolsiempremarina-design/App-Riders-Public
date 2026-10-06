import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { orderService } from '../orderService';
import { notificationService } from '../notificationService';
import { bikeService, bikePublicUrl, bikeQrImageUrl } from '../bikeService';
import { chatService } from '../chatService';
import { setCsrfToken } from '../api';
import { defaultFetchMock } from '../../test/setup';

const json = (body) => ({ ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => body });

describe('Servizi della fase 5', () => {
  let calls;
  beforeEach(() => {
    calls = [];
    setCsrfToken('csrf');
    globalThis.fetch = vi.fn(async (url, options = {}) => {
      calls.push({ url: String(url), method: options.method, body: options.body });
      const u = String(url);
      if (u.includes('/orders/available')) return json({ orders: [{ id: 1, pickup_address: 'x' }] });
      if (u.includes('/orders/active')) return json({ order: null });
      if (u.includes('/orders/completed')) return json({ orders: [], summary: { deliveries: 0 } });
      if (u.includes('/notifications?')) return json({ notifications: [{ id: 3, is_read: false }], unread_count: 1 });
      if (u.endsWith('/bikes')) return json({ bikes: [{ code: 'a', in_use: false }] });
      if (u.includes('/bikes/')) return json({ bike: { code: 'a', is_mine: true } });
      if (u.includes('/messages')) return json({ messages: [{ id: 1, user_id: 2 }], has_more: true, message: { id: 9 } });
      return json({ order: { id: 1, status: 'accepted' } });
    });
  });
  afterEach(() => {
    globalThis.fetch = defaultFetchMock;
    setCsrfToken(null);
  });

  it('orderService', async () => {
    expect(await orderService.getAvailableOrders()).toEqual([{ id: 1, pickupAddress: 'x' }]);
    expect(await orderService.getActiveOrder()).toBeNull();
    expect((await orderService.acceptOrder(1)).status).toBe('accepted');
    expect(calls.at(-1)).toMatchObject({ url: '/api/orders/1/accept', method: 'POST' });
    await orderService.updateOrderStatus(1, 'released');
    expect(calls.at(-1)).toMatchObject({ url: '/api/orders/1/status', method: 'PATCH', body: JSON.stringify({ status: 'released' }) });
    expect((await orderService.getCompletedOrders('week')).summary.deliveries).toBe(0);
    expect(calls.at(-1).url).toBe('/api/orders/completed?period=week');
  });

  it('notificationService', async () => {
    expect(await notificationService.list({ afterId: 2 })).toEqual({ notifications: [{ id: 3, isRead: false }], unreadCount: 1 });
    expect(calls.at(-1).url).toBe('/api/notifications?limit=50&after_id=2');
    await notificationService.markRead(3, false);
    expect(calls.at(-1)).toMatchObject({ url: '/api/notifications/3/read', method: 'POST', body: JSON.stringify({ read: false }) });
    await notificationService.markAllRead();
    await notificationService.remove(3);
    await notificationService.clear();
    expect(calls.slice(-3).map((c) => `${c.method} ${c.url}`)).toEqual([
      'POST /api/notifications/read-all', 'DELETE /api/notifications/3', 'DELETE /api/notifications'
    ]);
  });

  it('bikeService e URL dei QR', async () => {
    expect(await bikeService.list()).toEqual([{ code: 'a', inUse: false }]);
    expect((await bikeService.get('013-001')).isMine).toBe(true);
    await bikeService.link('013-001');
    expect(calls.at(-1)).toMatchObject({ url: '/api/bikes/013-001/link', method: 'POST' });
    await bikeService.unlink();
    expect(calls.at(-1)).toMatchObject({ url: '/api/bikes/mine', method: 'DELETE' });
    expect(bikePublicUrl('013-001', 'https://ror.example')).toBe('https://ror.example/bici/013-001');
    // QR generato sul telefono (SVG), senza inviare l'indirizzo a servizi esterni
    const qr = bikeQrImageUrl('013-001');
    expect(qr.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(decodeURIComponent(qr.split(',')[1])).toMatch(/^<svg[\s\S]*<\/svg>$/);
    expect(qr).not.toMatch(/qrserver|https%3A/);
    expect(bikeQrImageUrl('013-002')).not.toBe(qr);
  });

  it('chatService', async () => {
    expect(await chatService.history(3, 50)).toEqual({ messages: [{ id: 1, userId: 2 }], hasMore: true });
    expect(calls.at(-1).url).toBe('/api/groups/3/messages?before=50');
    await chatService.send(3, 'ciao');
    expect(calls.at(-1)).toMatchObject({ method: 'POST', body: JSON.stringify({ text: 'ciao' }) });
    await chatService.sendLocation(3, 45, 9);
    expect(JSON.parse(calls.at(-1).body)).toEqual({ kind: 'location', lat: 45, lon: 9 });
  });
});
