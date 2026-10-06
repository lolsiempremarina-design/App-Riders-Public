/**
 * Ricarica la pagina quando manca un file JavaScript di una versione precedente.
 *
 * Le pagine si caricano solo quando si aprono (React.lazy). Dopo un aggiornamento del server i file della
 * versione precedente non ci sono più, e il nuovo service worker (skipWaiting + clientsClaim) li toglie anche
 * dalla cache: chi aveva l'app aperta con la versione vecchia, aprendo una pagina non ancora caricata
 * (Percorsi, Privacy, Impostazioni...), vedeva la schermata "Si è verificato un imprevisto" finché non
 * ricaricava a mano. Vite segnala questo caso con l'evento `vite:preloadError`: si ricarica una volta e la
 * pagina arriva dalla versione nuova.
 *
 * Una seconda ricarica entro RELOAD_GUARD_MS non si fa: se il file manca davvero (server mal configurato)
 * resta la schermata di errore invece di ricaricare all'infinito.
 */
const STORAGE_KEY = 'ror-chunk-reload-at';
export const RELOAD_GUARD_MS = 10_000;

let reloading = false;

/** True dopo che è partita la ricarica: la schermata di errore mostra "aggiornamento in corso". */
export const isReloadingForUpdate = () => reloading;

/** Registra l'ora della ricarica e dice se farla (no se ce n'è stata una da meno di RELOAD_GUARD_MS). */
export const claimReload = (storage, now = Date.now()) => {
  try {
    const last = Number(storage.getItem(STORAGE_KEY));
    if (last && now - last >= 0 && now - last < RELOAD_GUARD_MS) return false;
    storage.setItem(STORAGE_KEY, String(now));
    return true;
  } catch {
    // sessionStorage non disponibile: senza il controllo si rischierebbe un ciclo di ricariche
    return false;
  }
};

export const installChunkReload = (win = window) => {
  const onPreloadError = () => {
    if (reloading) return;
    let storage = null;
    try {
      storage = win.sessionStorage;
    } catch {
      return;
    }
    if (!claimReload(storage)) return;
    reloading = true;
    win.location.reload();
  };
  win.addEventListener('vite:preloadError', onPreloadError);
  return () => {
    win.removeEventListener('vite:preloadError', onPreloadError);
    reloading = false;
  };
};
