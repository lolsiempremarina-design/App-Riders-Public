import { describe, it, expect } from 'vitest';
import { encodeGeohash, geohashesForBounds } from '../geohash';
import { bucketLabel, countLabel, formatDuration, hoursValue, seriesLabel, weekdayShort, monthShort } from '../statsFormat';

describe('geohash', () => {
  it('codifica come la libreria standard (valori di riferimento)', () => {
    expect(encodeGeohash(45.4642, 9.19, 5)).toBe('u0nd9');
    expect(encodeGeohash(57.64911, 10.40744, 11)).toBe('u4pruydqqvj');
  });

  it('copre un riquadro con tutte le celle necessarie', () => {
    const cells = geohashesForBounds({ south: 45.44, west: 9.15, north: 45.49, east: 9.23 });
    expect(cells).toContain('u0nd9');
    expect(cells.length).toBeGreaterThan(1);
    expect(new Set(cells).size).toBe(cells.length);
    // riquadro enorme: nessuna richiesta
    expect(geohashesForBounds({ south: 40, west: 5, north: 47, east: 15 })).toEqual([]);
  });
});

describe('statsFormat', () => {
  it('etichette dei chip nella lingua richiesta', () => {
    expect(bucketLabel('week', '2026-09-24', { language: 'it', todayKey: '2026-09-24', todayLabel: 'Oggi' })).toEqual({ label: 'Oggi', num: '24' });
    expect(bucketLabel('week', '2026-09-21', { language: 'it', todayKey: '2026-09-24' })).toEqual({ label: 'Lun', num: '21' });
    expect(bucketLabel('week', '2026-09-21', { language: 'en', todayKey: 'x' }).label).toBe('Mon');
    expect(bucketLabel('month', '2026-09', { language: 'it' })).toEqual({ label: 'Set', num: null });
    expect(bucketLabel('year', '2025', {})).toEqual({ label: '2025', num: null });
    expect(bucketLabel('always', 'all', { allLabel: 'Sempre' })).toEqual({ label: 'Sempre', num: null });
    expect(weekdayShort('2026-09-24', 'es')).toBe('Jue');
    expect(monthShort('2026-05', 'es')).toBe('May');
  });

  it('etichette della serie del grafico', () => {
    expect(seriesLabel('week', '11:00', 'it')).toBe('11:00');
    expect(seriesLabel('month', '2026-09-20', 'it')).toBe('20 set');
    expect(seriesLabel('year', '2026-09', 'it')).toBe('Set');
  });

  it('durate e ore', () => {
    expect(formatDuration(5400)).toBe('1 h 30 min');
    expect(formatDuration(720)).toBe('12 min');
    expect(formatDuration(40)).toBe('40 s');
    expect(formatDuration(null)).toBe('0 s');
    expect(hoursValue(5400)).toBe('1.50');
  });
});

describe('countLabel', () => {
  it('usa il singolare solo per 1', () => {
    expect(countLabel(1, 'consegna', 'consegne')).toBe('consegna');
    expect(countLabel(0, 'consegna', 'consegne')).toBe('consegne');
    expect(countLabel(3, 'consegna', 'consegne')).toBe('consegne');
  });
});
