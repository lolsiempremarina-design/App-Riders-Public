import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { statsService } from '../statsService';
import { routeService } from '../routeService';
import { groupService, buildInviteLink } from '../groupService';
import { mapService } from '../mapService';
import { setCsrfToken } from '../api';
import { defaultFetchMock } from '../../test/setup';

const jsonResponse = (body, status = 200) => ({
  ok: status < 400,
  status,
  statusText: '',
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => body
});

describe('Servizi della fase 3', () => {
  let calls;

  beforeEach(() => {
    calls = [];
    setCsrfToken('csrf-test');
    globalThis.fetch = vi.fn(async (url, options = {}) => {
      calls.push({ url: String(url), method: options.method, body: options.body, headers: options.headers });
      if (String(url).includes('/stats/period')) return jsonResponse({ period: 'week', buckets: [{ key: '2026-09-24', summary: { avg_speed_kmh: 16.7 } }] });
      if (String(url).includes('/groups/3/positions')) return jsonResponse({ positions: [{ user_id: 2, username: 'x', lat: 1, lon: 2 }] });
      if (String(url).endsWith('/groups/positions')) return jsonResponse({ positions: [{ user_id: 5, username: 'y', lat: 3, lon: 4 }], group_count: 2 });
      if (String(url).endsWith('/groups')) return jsonResponse({ groups: [{ id: 3, member_count: 2 }] });
      if (String(url).includes('/v1/')) return jsonResponse([{ id: 1, lat: 45, lng: 9 }]);
      return jsonResponse({ success: true });
    });
  });

  afterEach(() => {
    globalThis.fetch = defaultFetchMock;
    setCsrfToken(null);
  });

  it('statsService chiama /api/stats e rifiuta periodi non validi', async () => {
    const data = await statsService.getPeriod('week');
    expect(calls[0].url).toBe('/api/stats/period?period=week');
    expect(data.buckets[0].summary.avgSpeedKmh).toBe(16.7);
    await expect(statsService.getPeriod('decade')).rejects.toThrow();
    await statsService.getOverview();
    expect(calls.at(-1).url).toBe('/api/stats/overview');
  });

  it('routeService: elenco paginato, dettaglio, URL del GPX ed eliminazione con CSRF', async () => {
    await routeService.list({ limit: 5, offset: 10 });
    expect(calls[0].url).toBe('/api/routes?limit=5&offset=10');
    await routeService.get(7);
    expect(calls[1].url).toBe('/api/routes/7');
    expect(routeService.gpxUrl(7)).toBe('/api/routes/7/gpx');
    await routeService.remove(7);
    expect(calls[2]).toMatchObject({ url: '/api/routes/7', method: 'DELETE' });
    expect(calls[2].headers['X-CSRFToken']).toBe('csrf-test');
  });

  it('groupService: elenco, adesione, ruoli, posizioni', async () => {
    expect(await groupService.list()).toEqual([{ id: 3, memberCount: 2 }]);
    await groupService.joinByCode('abc-defg-hij');
    expect(calls.at(-1)).toMatchObject({ url: '/api/groups/join', method: 'POST', body: JSON.stringify({ code: 'abc-defg-hij' }) });
    await groupService.joinByToken('tok');
    expect(calls.at(-1).body).toBe(JSON.stringify({ token: 'tok' }));
    await groupService.setMemberRole(3, 2, 'admin');
    expect(calls.at(-1)).toMatchObject({ url: '/api/groups/3/members/2', method: 'PATCH' });
    await groupService.removeMember(3, 2);
    expect(calls.at(-1)).toMatchObject({ url: '/api/groups/3/members/2', method: 'DELETE' });
    expect(await groupService.positions(3)).toEqual([{ userId: 2, username: 'x', lat: 1, lon: 2 }]);
    // la mappa: tutti i gruppi con una richiesta sola
    expect(await groupService.allPositions()).toEqual({ positions: [{ userId: 5, username: 'y', lat: 3, lon: 4 }], groupCount: 2 });
    expect(calls.at(-1)).toMatchObject({ url: '/api/groups/positions', method: 'GET' });
    await groupService.sharePosition(45.1, 9.2);
    expect(calls.at(-1)).toMatchObject({ url: '/api/groups/position', method: 'POST', body: JSON.stringify({ lat: 45.1, lon: 9.2 }) });
    expect(buildInviteLink('a b', 'https://localhost')).toBe('https://localhost/gruppi?invito=a%20b');
    expect(buildInviteLink(null)).toBe('');
  });

  it('mapService divide i geohash in più richieste e unisce i risultati', async () => {
    const cells = Array.from({ length: 25 }, (_, i) => `u0n${String(i).padStart(2, '0')}`);
    const points = await mapService.getPoints('parkings', cells);
    expect(calls).toHaveLength(2);
    expect(calls[0].url.startsWith('/api/v1/bicycle-parkings?gh5=u0n00,')).toBe(true);
    expect(points).toHaveLength(2);
    expect(await mapService.getPoints('parkings', [])).toEqual([]);
    await expect(mapService.getPoints('unknown', ['u0n00'])).rejects.toThrow();
  });
});
