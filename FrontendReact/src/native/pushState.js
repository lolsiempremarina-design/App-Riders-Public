/**
 * Notifiche push attive su questo telefono (app Android) e richieste di aggiornamento immediato.
 * Con le push attive (permesso concesso e token registrato su un server con Firebase configurato) le
 * novità arrivano subito come notifica: notifiche, SOS dei gruppi e ordini si possono controllare più
 * di rado, risparmiando richieste (il tunnel ngrok gratuito ne concede 20.000 al mese) e batteria.
 * Nel browser le push non ci sono e restano gli intervalli normali. Nessun plugin qui: è solo stato.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';

let active = false;
const listeners = new Set();

export const isPushActive = () => active;

export const setPushActive = (value) => {
  const next = Boolean(value);
  if (next === active) return;
  active = next;
  listeners.forEach((listener) => listener());
};

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** true se le push arrivano su questo telefono (il componente si aggiorna quando cambia). */
export const usePushActive = () => useSyncExternalStore(subscribe, isPushActive, isPushActive);

/** Intervallo di un controllo periodico: più lungo quando le push avvisano subito. */
export const usePollInterval = (normalMs, withPushMs) => (usePushActive() ? withPushMs : normalMs);

export const REFRESH_EVENT = 'ror:refresh';

/** Chiede di ricaricare subito i dati di una categoria del server (null = tutto, es. app di nuovo in primo piano). */
export const requestRefresh = (category = null) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(REFRESH_EVENT, { detail: { category: category || null } }));
};

// Nel browser, pagina di nuovo visibile: si ricarica tutto come al ritorno in primo piano dell'app Android
// (NativeAppBridge; nella WebView questo evento non arriva). I controlli periodici saltano i giri mentre
// nessuno guarda (native/appState.js): così si recupera subito quello che è successo nel frattempo.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') requestRefresh();
  });
}

/**
 * Esegue `onRefresh` a ogni requestRefresh() di una delle `categories` (null = qualsiasi) e a ogni
 * richiesta generica: push ricevuta con l'app aperta o ritorno in primo piano.
 */
export const useRefreshOn = (categories, onRefresh) => {
  const callbackRef = useRef(onRefresh);
  callbackRef.current = onRefresh;
  const key = categories ? categories.join(',') : null;
  useEffect(() => {
    const wanted = key === null ? null : key.split(',');
    const handler = (event) => {
      const category = event.detail?.category ?? null;
      if (category === null || wanted === null || wanted.includes(category)) callbackRef.current();
    };
    window.addEventListener(REFRESH_EVENT, handler);
    return () => window.removeEventListener(REFRESH_EVENT, handler);
  }, [key]);
};
