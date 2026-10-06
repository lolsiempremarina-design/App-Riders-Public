/**
 * App Android in primo piano o no. Nella WebView di Capacitor document.visibilityState resta "visible" anche
 * con l'app in background o lo schermo spento (verificato nell'emulatore): fa fede l'evento appStateChange.
 */
import { App } from '@capacitor/app';
import { isNativeApp } from './platform';

let active = true;
let tracking = false;

const startTracking = () => {
  if (tracking) return;
  tracking = true;
  App.addListener('appStateChange', ({ isActive }) => { active = isActive; }).catch(() => {});
  App.getState().then(({ isActive }) => { active = isActive; }).catch(() => {});
};

if (isNativeApp()) startTracking();

/** true se l'utente sta guardando l'app (nel browser: pagina visibile). */
export const isAppInForeground = () => {
  if (isNativeApp()) return active;
  return typeof document === 'undefined' || document.visibilityState === 'visible';
};

/**
 * Un giro di un controllo periodico va fatto adesso? Sempre con l'app davanti; in background (scheda nascosta,
 * app Android con il GPS acceso) al massimo ogni `backgroundMs` dall'ultimo (`lastRunMs`, 0 = mai), e mai se
 * `backgroundMs` è null. Prima ogni controllo continuava come in primo piano: una scheda dimenticata aperta
 * consumava migliaia di richieste al giorno della quota del tunnel ngrok gratuito.
 */
export const shouldPollNow = (lastRunMs = 0, backgroundMs = null) => {
  if (isAppInForeground()) return true;
  return backgroundMs !== null && Date.now() - lastRunMs >= backgroundMs;
};
