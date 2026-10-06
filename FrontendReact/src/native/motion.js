/**
 * Accelerometro e giroscopio per il rilevamento cadute, a 20 Hz.
 *  - Browser / PWA: evento devicemotion (si ferma con l'app in background o lo schermo spento).
 *  - App Android: plugin nativo RorMotion (android/.../RorMotionPlugin.java), che continua a schermo spento.
 * Ogni campione: { t (ms), x, y, z (m/s² con la gravità), alpha, beta, gamma (gradi/s, se c'è il giroscopio) }.
 */
import { registerPlugin } from '@capacitor/core';
import { isNativeApp } from './platform';

const RorMotion = registerPlugin('RorMotion');
export const SAMPLE_MS = 50;

/**
 * @param {(sample: {t: number, x: number, y: number, z: number, alpha?: number, beta?: number, gamma?: number}) => void} onSample
 * @returns {Promise<(() => void) | null>} funzione che ferma i sensori, o null se non ci sono
 */
export const watchMotion = async (onSample) => {
  if (isNativeApp()) {
    const listener = await RorMotion.addListener('motion', ({ samples }) => samples.forEach(onSample));
    const { available } = await RorMotion.start();
    if (!available) {
      listener.remove();
      return null;
    }
    return () => {
      listener.remove();
      RorMotion.stop().catch(() => {});
    };
  }

  if (typeof window === 'undefined' || typeof DeviceMotionEvent === 'undefined') return null;
  let acc = null;
  let gyro = null;
  const onMotion = (event) => {
    if (event.accelerationIncludingGravity) acc = event.accelerationIncludingGravity;
    if (event.rotationRate) gyro = event.rotationRate;
  };
  window.addEventListener('devicemotion', onMotion);
  // campionamento regolare dell'ultimo valore: il SignalProcessor si aspetta 20 Hz costanti
  const timer = setInterval(() => {
    if (!acc) return; // nessun dato dell'accelerometro (es. PC): rilevamento cadute non disponibile
    onSample({
      t: Date.now(), x: acc.x ?? 0, y: acc.y ?? 0, z: acc.z ?? 0,
      alpha: gyro?.alpha ?? undefined, beta: gyro?.beta ?? undefined, gamma: gyro?.gamma ?? undefined
    });
  }, SAMPLE_MS);
  return () => {
    window.removeEventListener('devicemotion', onMotion);
    clearInterval(timer);
  };
};
