/**
 * Risposte di esempio di GET /api/stats/* (già in camelCase, come le restituisce il client API)
 * per i test delle pagine di statistiche.
 */
export const summary = (overrides = {}) => ({
  count: 0,
  distanceKm: 0,
  durationSec: 0,
  avgSpeedKmh: 0,
  bestSpeedKmh: 0,
  pauseSec: 0,
  pauseUnknownCount: 0,
  ...overrides
});

const bucket = (key, start, end, sum = {}, series = []) => ({ key, start, end, summary: summary(sum), series });

export const WEEK = {
  period: 'week',
  today: '2026-09-24',
  timezone: 'Europe/Rome',
  summary: summary({ count: 3, distanceKm: 31, durationSec: 7200, avgSpeedKmh: 15.5, bestSpeedKmh: 20, pauseSec: 600, pauseUnknownCount: 1 }),
  buckets: [
    bucket('2026-09-18', '2026-09-18', '2026-09-18'),
    bucket('2026-09-19', '2026-09-19', '2026-09-19'),
    bucket('2026-09-20', '2026-09-20', '2026-09-20', { count: 1, distanceKm: 6, durationSec: 1800, avgSpeedKmh: 12, bestSpeedKmh: 12 },
      [{ key: '09:00', count: 1, distanceKm: 6, durationSec: 1800, avgSpeedKmh: 12 }]),
    bucket('2026-09-21', '2026-09-21', '2026-09-21'),
    bucket('2026-09-22', '2026-09-22', '2026-09-22'),
    bucket('2026-09-23', '2026-09-23', '2026-09-23'),
    // un percorso con 10 min di pause e uno più vecchio senza l'ultimo punto (pause non note)
    bucket('2026-09-24', '2026-09-24', '2026-09-24', { count: 2, distanceKm: 25, durationSec: 5400, avgSpeedKmh: 16.67, bestSpeedKmh: 20, pauseSec: 600, pauseUnknownCount: 1 }, [
      { key: '00:00', count: 1, distanceKm: 10, durationSec: 1800, avgSpeedKmh: 20 },
      { key: '11:00', count: 1, distanceKm: 15, durationSec: 3600, avgSpeedKmh: 15 }
    ])
  ]
};

export const MONTH = {
  period: 'month',
  today: '2026-09-24',
  summary: summary({ count: 3, distanceKm: 31, durationSec: 7200, avgSpeedKmh: 15.5, bestSpeedKmh: 20, pauseSec: 600, pauseUnknownCount: 1 }),
  buckets: ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08'].map((k) => bucket(k, `${k}-01`, `${k}-28`)).concat([
    bucket('2026-09', '2026-09-01', '2026-09-30', { count: 3, distanceKm: 31, durationSec: 7200, avgSpeedKmh: 15.5, bestSpeedKmh: 20, pauseSec: 600, pauseUnknownCount: 1 }, [
      { key: '2026-09-20', count: 1, distanceKm: 6, durationSec: 1800, avgSpeedKmh: 12 },
      { key: '2026-09-24', count: 2, distanceKm: 25, durationSec: 5400, avgSpeedKmh: 16.67 }
    ])
  ])
};

export const YEAR = {
  period: 'year',
  today: '2026-09-24',
  summary: summary({ count: 4, distanceKm: 61, durationSec: 10800, avgSpeedKmh: 20.33, bestSpeedKmh: 30, pauseSec: 600, pauseUnknownCount: 1 }),
  buckets: [
    bucket('2025', '2025-01-01', '2025-12-31', { count: 1, distanceKm: 30, durationSec: 3600, avgSpeedKmh: 30, bestSpeedKmh: 30 },
      [{ key: '2025-03', count: 1, distanceKm: 30, durationSec: 3600, avgSpeedKmh: 30 }]),
    bucket('2026', '2026-01-01', '2026-12-31', { count: 3, distanceKm: 31, durationSec: 7200, avgSpeedKmh: 15.5, bestSpeedKmh: 20, pauseSec: 600, pauseUnknownCount: 1 },
      [{ key: '2026-09', count: 3, distanceKm: 31, durationSec: 7200, avgSpeedKmh: 15.5 }])
  ]
};

export const ALWAYS = {
  period: 'always',
  today: '2026-09-24',
  summary: YEAR.summary,
  buckets: [bucket('all', '2025-03-02', '2026-09-24', YEAR.summary, [
    { key: '2025-03', count: 1, distanceKm: 30, durationSec: 3600, avgSpeedKmh: 30 },
    { key: '2026-09', count: 3, distanceKm: 31, durationSec: 7200, avgSpeedKmh: 15.5 }
  ])]
};

export const PERIODS = { week: WEEK, month: MONTH, year: YEAR, always: ALWAYS };

export const OVERVIEW = {
  today: '2026-09-24',
  timezone: 'Europe/Rome',
  days: WEEK.buckets.map((b) => ({ date: b.key, ...b.summary })),
  week: WEEK.summary,
  allTime: YEAR.summary
};
