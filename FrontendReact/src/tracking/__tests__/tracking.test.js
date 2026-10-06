import { describe, it, expect } from 'vitest';
import { SignalProcessor } from '../SignalProcessor';
import { FallDetector } from '../FallDetector';
import { evaluateFix, haversineKm, MIN_MOVE_M, moveThresholdM, newSessionId, PAUSE_GAP_MS } from '../geo';

const base = { acc_x: 0, acc_y: 0, acc_z: 9.8, gyro_x: 0, gyro_y: 0, gyro_z: 0, lat: null, lon: null, speed_kmh: 20 };

describe('SignalProcessor (porting fedele)', () => {
  it('calcola modulo, jerk, rugosità e mantiene la velocità GPS', () => {
    const sp = new SignalProcessor();
    const first = sp.process({ ...base, time_sec: 0 });
    expect(first.acc_magnitude).toBeCloseTo(9.8);
    expect(first.jerk).toBe(0);
    expect(first.roughness).toBe(0);
    const second = sp.process({ ...base, time_sec: 0.05, acc_z: 30 });
    expect(second.acc_magnitude).toBeGreaterThan(9.8);
    expect(second.jerk).toBeGreaterThan(0);
    expect(second.roughness).toBeGreaterThan(0);
    expect(second.speed_kmh).toBe(20);
  });

  it('senza velocità GPS la stima dagli spostamenti', () => {
    const sp = new SignalProcessor();
    sp.process({ ...base, speed_kmh: null, lat: 45, lon: 9, gps_time: 0, time_sec: 0 });
    const row = sp.process({ ...base, speed_kmh: null, lat: 45.001, lon: 9, gps_time: 10000, time_sec: 10 });
    expect(row.speed_kmh).toBeCloseTo(40.08, 1); // 111 m in 10 s
  });
});

describe('FallDetector (porting fedele)', () => {
  /** Simula: impatto forte + rotazione, poi 3 s da fermi. */
  const simulateFall = (detector, { stillSpeed = 0, rotation = 300 } = {}) => {
    const rows = [];
    for (let i = 0; i <= 80; i++) {
      const time_sec = i * 0.05;
      const impact = i === 10;
      rows.push(detector.process({
        time_sec,
        acc_magnitude: impact ? 45 : 9.8,
        jerk: impact ? 600 : 0,
        roughness: 0.5,
        gyro_magnitude: i >= 10 && i <= 20 ? rotation : 0,
        speed_kmh: i > 10 ? stillSpeed : 22
      }));
    }
    return rows;
  };

  it('conferma una caduta con impatto, rotazione e immobilità', () => {
    const detector = new FallDetector(() => 1000);
    const rows = simulateFall(detector);
    const confirmedAt = rows.findIndex((r) => r.is_confirmed_fall);
    expect(confirmedAt).toBeGreaterThan(60); // dopo la finestra di immobilità di 3 s
    expect(detector.pending_alert).toBe(true);
  });

  it('non conferma se il rider continua a muoversi o se manca la rotazione', () => {
    expect(simulateFall(new FallDetector(() => 1000), { stillSpeed: 18 }).some((r) => r.is_confirmed_fall)).toBe(false);
    expect(simulateFall(new FallDetector(() => 1000), { rotation: 50 }).some((r) => r.is_confirmed_fall)).toBe(false);
  });

  it('"Sto bene" annulla l\'allarme e segnala una sola volta la cancellazione', () => {
    const detector = new FallDetector(() => 1000);
    simulateFall(detector);
    detector.resetAlert();
    const next = detector.process({ time_sec: 10, acc_magnitude: 9.8, jerk: 0, roughness: 0, gyro_magnitude: 0, speed_kmh: 0 });
    expect(next.is_confirmed_fall).toBe(false);
    expect(next.is_cancelled_fall).toBe(true);
    const after = detector.process({ time_sec: 10.05, acc_magnitude: 9.8, jerk: 0, roughness: 0, gyro_magnitude: 0, speed_kmh: 0 });
    expect(after.is_cancelled_fall).toBe(false);
  });
});

describe('geo', () => {
  it('haversine come il GPS worker', () => {
    expect(haversineKm(45, 9, 45.001, 9)).toBeCloseTo(0.1112, 3);
  });

  it('filtra posizioni imprecise, salti e duplicati; dopo una pausa non conta la distanza', () => {
    const prev = { lat: 45, lon: 9, ts: 1000000 };
    expect(evaluateFix(null, { lat: 45, lon: 9, ts: 1, accuracy: 10 })).toMatchObject({ accept: true, moving: false, distanceKm: 0, point: { lat: 45, lon: 9 } });
    expect(evaluateFix(null, { lat: 45, lon: 9, ts: 1, accuracy: 120 }).accept).toBe(false);
    expect(evaluateFix(prev, { lat: 45.001, lon: 9, ts: prev.ts, accuracy: 5 }).accept).toBe(false);
    const ok = evaluateFix(prev, { lat: 45.001, lon: 9, ts: prev.ts + 20000, accuracy: 5 });
    expect(ok).toMatchObject({ accept: true, moving: true, movingMs: 20000, point: { lat: 45.001, lon: 9 } });
    expect(ok.distanceKm).toBeCloseTo(0.1112, 3);
    expect(ok.speedKmh).toBeCloseTo(20, 0);
    expect(evaluateFix(prev, { lat: 45.01, lon: 9, ts: prev.ts + 5000, accuracy: 5 }).accept).toBe(false); // 800 km/h
    expect(evaluateFix(prev, { lat: 45.05, lon: 9, ts: prev.ts + PAUSE_GAP_MS + 1, accuracy: 5 }))
      .toMatchObject({ accept: true, moving: false, distanceKm: 0, movingMs: 0, point: { lat: 45.05, lon: 9 } });
  });

  it('da fermi il "ballo" del GPS non diventa strada: un punto ogni 15 s nella posizione di prima', () => {
    // un minuto e mezzo fermi, una posizione al secondo fino a 6 m attorno allo stesso punto (prima: ~70 m)
    let previous = { lat: 45, lon: 9, ts: 0 };
    let distance = 0;
    let movingMs = 0;
    const recorded = [];
    const metres = (m) => m / 111000;
    for (let i = 1; i <= 90; i++) {
      const fix = { lat: 45 + metres(6 * Math.sin(i * 1.7)), lon: 9 + metres(6 * Math.cos(i * 2.3)) * 1.41, ts: i * 1000, accuracy: 8 };
      const verdict = evaluateFix(previous, fix);
      distance += verdict.distanceKm;
      movingMs += verdict.movingMs;
      if (verdict.accept) {
        previous = { ...verdict.point, ts: fix.ts };
        recorded.push(previous);
      }
    }
    expect(distance).toBe(0);
    expect(movingMs).toBe(0);
    expect(recorded.map((p) => p.ts)).toEqual([15000, 30000, 45000, 60000, 75000, 90000]);
    expect(recorded.every((p) => p.lat === 45 && p.lon === 9)).toBe(true);
  });

  it('spostamento minimo più grande con una posizione meno precisa', () => {
    expect(moveThresholdM(5)).toBe(MIN_MOVE_M);
    expect(moveThresholdM(20)).toBe(30);
    expect(moveThresholdM(45)).toBe(40);
    const prev = { lat: 45, lon: 9, ts: 0 };
    const twentyMetres = { lat: 45 + 20 / 111000, lon: 9, ts: 5000 };
    expect(evaluateFix(prev, { ...twentyMetres, accuracy: 5 }).moving).toBe(true);
    expect(evaluateFix(prev, { ...twentyMetres, accuracy: 20 }).moving).toBe(false);
  });

  it('chi cammina piano con la bici conta, la deriva lenta no; ripartendo dopo una sosta si conta subito', () => {
    const prev = { lat: 45, lon: 9, ts: 0 };
    // 16 m in 14 s = 4 km/h: movimento
    expect(evaluateFix(prev, { lat: 45 + 16 / 111000, lon: 9, ts: 14000, accuracy: 5 })).toMatchObject({ moving: true, movingMs: 14000 });
    // 8 m in 14 s, poi il punto delle soste (15 s): la deriva lenta della posizione non conta
    expect(evaluateFix(prev, { lat: 45 + 8 / 111000, lon: 9, ts: 14000, accuracy: 5 }).accept).toBe(false);
    const still = evaluateFix(prev, { lat: 45 + 3 / 111000, lon: 9, ts: 15000, accuracy: 5 });
    expect(still).toMatchObject({ accept: true, moving: false, point: { lat: 45, lon: 9 } });
    // chi riparte viene contato al primo spostamento vero
    const restart = evaluateFix({ ...still.point, ts: 15000 }, { lat: 45 + 25 / 111000, lon: 9, ts: 18000, accuracy: 5 });
    expect(restart).toMatchObject({ moving: true, movingMs: 3000 });
    expect(restart.distanceKm).toBeCloseTo(0.025, 3);
  });

  it('genera UUID v4 validi per la sessione', () => {
    expect(newSessionId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
