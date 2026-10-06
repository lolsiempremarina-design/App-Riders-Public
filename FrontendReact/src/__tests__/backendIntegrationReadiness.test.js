import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setCsrfToken } from '../services/api';
import { authService } from '../services/authService';
import { orderService } from '../services/orderService';
import { riderService } from '../services/riderService';
import { profileService, riderLevelFromKm } from '../services/profileService';

describe('Backend Integration Readiness & Contract Verification Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    setCsrfToken('csrf-readiness');
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Autenticazione con sessione Flask (cookie + CSRF)', () => {
    it('authService.login invia POST /api/auth/login con cookie e token CSRF e restituisce il profilo', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          authenticated: true,
          csrf_token: 'rotated-token',
          user: { id: 1, email: 'rider@ror.com', username: 'rider', first_name: 'Marco', last_name: 'Rider' }
        })
      });

      const profile = await authService.login('rider@ror.com', 'SuperSecret123!');

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/auth/login',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          headers: expect.objectContaining({ 'X-CSRFToken': 'csrf-readiness' }),
          body: JSON.stringify({ identity: 'rider@ror.com', password: 'SuperSecret123!', remember: true })
        })
      );
      expect(profile.name).toBe('Marco');
      expect(profile.surname).toBe('Rider');
      expect(localStorage.getItem('ror-auth-token')).toBeNull();
    });

    it('authService.register invia il payload in snake_case a POST /api/auth/register', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ authenticated: true, user: { id: 2, first_name: 'Mario', last_name: 'Rossi' } })
      });

      const payload = { username: 'mario', email: 'mario@example.com', first_name: 'Mario', last_name: 'Rossi' };
      const profile = await authService.register(payload);

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/auth/register',
        expect.objectContaining({ method: 'POST', body: JSON.stringify(payload) })
      );
      expect(profile.name).toBe('Mario');
    });
  });

  describe('2. Gestione Ordini & Consegne (REST Contract, fase 5)', () => {
    const jsonResponse = (body) => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => body
    });

    it('orderService.getAvailableOrders legge /api/orders/available e normalizza in camelCase', async () => {
      global.fetch = vi.fn().mockResolvedValue(jsonResponse({
        orders: [{ id: 201, restaurant: 'Trattoria', pickup_address: 'Via Roma 1', delivery_address: 'Via Po 9', pay: 6.5, bonus: 1.5, total: 8, seconds_left: 120 }]
      }));
      const orders = await orderService.getAvailableOrders();
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/orders/available'), expect.objectContaining({ method: 'GET' }));
      expect(orders).toEqual([{ id: 201, restaurant: 'Trattoria', pickupAddress: 'Via Roma 1', deliveryAddress: 'Via Po 9', pay: 6.5, bonus: 1.5, total: 8, secondsLeft: 120 }]);
    });

    it('orderService.acceptOrder invia POST /orders/:orderId/accept e restituisce l’ordine', async () => {
      global.fetch = vi.fn().mockResolvedValue(jsonResponse({ order: { id: 201, status: 'accepted', accepted_at: '2026-09-10T10:00:00' } }));
      const order = await orderService.acceptOrder(201);
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/orders/201/accept'), expect.objectContaining({ method: 'POST' }));
      expect(order.acceptedAt).toBe('2026-09-10T10:00:00');
    });

    it('orderService.updateOrderStatus invia PATCH /orders/:orderId/status con lo stato', async () => {
      global.fetch = vi.fn().mockResolvedValue(jsonResponse({ order: { id: 201, status: 'delivered' } }));
      const order = await orderService.updateOrderStatus(201, 'delivered');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/orders/201/status'),
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'delivered' }) })
      );
      expect(order.status).toBe('delivered');
    });
  });

  describe('3. Profilo, contatti SOS e impostazioni (fase 2)', () => {
    const jsonOk = (body, status = 200) => ({
      ok: true,
      status,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => body
    });

    it('profileService.getProfile legge /api/profile e restituisce profilo + statistiche reali', async () => {
      global.fetch = vi.fn().mockResolvedValue(jsonOk({
        user: { id: 3, first_name: 'Ana', last_name: 'Lopez', avatar: null, sensors_enabled: true },
        stats: { rides_count: 4, total_distance_km: 51.2, total_duration_min: 180 }
      }));

      const { profile, stats } = await profileService.getProfile();

      expect(global.fetch).toHaveBeenCalledWith('/api/profile', expect.objectContaining({ method: 'GET', credentials: 'include' }));
      expect(profile.name).toBe('Ana');
      expect(profile.sensorsEnabled).toBe(true);
      expect(stats).toEqual({ ridesCount: 4, totalDistanceKm: 51.2, totalDurationMin: 180 });
    });

    it('profileService gestisce i contatti SOS con GET/POST/PATCH/DELETE su /api/sos-contacts', async () => {
      global.fetch = vi.fn().mockResolvedValue(jsonOk({ contacts: [{ id: 1, name: 'Mamma', phone: '+39 333 1234567' }], max_contacts: 5 }));
      const { contacts, maxContacts } = await profileService.listSosContacts();
      expect(contacts[0].name).toBe('Mamma');
      expect(maxContacts).toBe(5);

      global.fetch = vi.fn().mockResolvedValue(jsonOk({ id: 2, name: 'Fratello', phone: '+39 333 9876543' }, 201));
      await profileService.addSosContact({ name: 'Fratello', phone: '+39 333 9876543' });
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/sos-contacts',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Fratello', phone: '+39 333 9876543' }) })
      );

      global.fetch = vi.fn().mockResolvedValue(jsonOk({ id: 2 }));
      await profileService.updateSosContact(2, { priority: 2 });
      expect(global.fetch).toHaveBeenCalledWith('/api/sos-contacts/2', expect.objectContaining({ method: 'PATCH' }));

      global.fetch = vi.fn().mockResolvedValue(jsonOk({ success: true }));
      await profileService.removeSosContact(2);
      expect(global.fetch).toHaveBeenCalledWith('/api/sos-contacts/2', expect.objectContaining({ method: 'DELETE' }));
    });

    it('profileService.updateSettings e changePassword inviano i campi in snake_case', async () => {
      global.fetch = vi.fn().mockResolvedValue(jsonOk({ language: 'es', sensors_enabled: true, share_location_with_groups: false }));
      const settings = await profileService.updateSettings({ sensors_enabled: true });
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/settings',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ sensors_enabled: true }) })
      );
      expect(settings.sensorsEnabled).toBe(true);

      global.fetch = vi.fn().mockResolvedValue(jsonOk({ success: true }));
      await profileService.changePassword('old-pass', 'New-Pass-123', 'New-Pass-123');
      expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({
        current_password: 'old-pass',
        new_password: 'New-Pass-123',
        new_password_confirm: 'New-Pass-123'
      });
    });

    it('riderLevelFromKm calcola il livello dai km reali', () => {
      expect(riderLevelFromKm(0).key).toBe('base');
      expect(riderLevelFromKm(40).key).toBe('bronzo');
      expect(riderLevelFromKm(200).key).toBe('argento');
      expect(riderLevelFromKm(800).key).toBe('oro');
    });

    it('riderService.getEarnings e getScore leggono /api/rider/earnings e /api/score', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ summary: { earnings: 42.5, deliveries: 5 }, days: [] })
      });
      const earnings = await riderService.getEarnings('month');
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/rider/earnings?period=month'), expect.objectContaining({ method: 'GET' }));
      expect(earnings.summary).toEqual({ earnings: 42.5, deliveries: 5 });
      await riderService.getScore(7);
      expect(global.fetch).toHaveBeenLastCalledWith(expect.stringContaining('/score?days=7'), expect.objectContaining({ method: 'GET' }));
    });
  });
});
