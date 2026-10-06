/**
 * fetch con un tempo massimo.
 *
 * Nel browser fetch non ne ha uno: una connessione mobile che si blocca (segnale debole, rete che cambia)
 * lasciava la richiesta in sospeso per minuti. Intanto l'invio dei punti GPS restava fermo (ogni invio
 * aspetta quello in corso), "Termina" non rispondeva e un SOS restava su "Invio in corso...".
 * L'app Android ha già 20 s nelle richieste native (src/native/http.js): qui lo stesso nel browser.
 * Allo scadere la promessa viene rifiutata come un errore di rete, e chi chiama la tratta così.
 */
export const DEFAULT_FETCH_TIMEOUT_MS = 20000;

export const fetchWithTimeout = (url, init = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) => {
  if (typeof AbortController === 'undefined') return fetch(url, init);
  const controller = new AbortController();
  const outer = init.signal;
  if (outer) {
    if (outer.aborted) controller.abort(outer.reason);
    else outer.addEventListener('abort', () => controller.abort(outer.reason), { once: true });
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
};
