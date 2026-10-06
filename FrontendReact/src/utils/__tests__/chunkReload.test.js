import { describe, it, expect, vi, afterEach } from 'vitest';
import { claimReload, installChunkReload, isReloadingForUpdate, RELOAD_GUARD_MS } from '../chunkReload';

const memoryStorage = () => {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value))
  };
};

// una finestra finta: eventi veri, sessionStorage in memoria e reload osservabile
const fakeWindow = (storage = memoryStorage()) => {
  const target = new EventTarget();
  return {
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
    sessionStorage: storage,
    location: { reload: vi.fn() }
  };
};

// come l'aiutante di Vite quando un file della pagina non arriva (404 dopo un aggiornamento)
const missingChunk = (win) => win.dispatchEvent(new Event('vite:preloadError', { cancelable: true }));

describe('ricarica dopo un aggiornamento del server (vite:preloadError)', () => {
  let uninstall = () => {};
  afterEach(() => uninstall());

  it('una pagina della versione precedente che non c\'è più ricarica l\'app una volta sola', () => {
    const win = fakeWindow();
    uninstall = installChunkReload(win);
    expect(isReloadingForUpdate()).toBe(false);

    missingChunk(win);
    missingChunk(win); // la pagina e il suo stile falliscono insieme: una ricarica, non due
    expect(win.location.reload).toHaveBeenCalledTimes(1);
    expect(isReloadingForUpdate()).toBe(true);
  });

  it('se anche dopo la ricarica il file manca resta la schermata di errore, senza ricaricare all\'infinito', () => {
    const storage = memoryStorage();
    const before = fakeWindow(storage);
    uninstall = installChunkReload(before);
    missingChunk(before);
    uninstall();

    const after = fakeWindow(storage); // la pagina ricaricata: stessa sessionStorage
    uninstall = installChunkReload(after);
    missingChunk(after);
    expect(after.location.reload).not.toHaveBeenCalled();
    expect(isReloadingForUpdate()).toBe(false);
  });

  it('un altro aggiornamento più tardi ricarica di nuovo', () => {
    const storage = memoryStorage();
    expect(claimReload(storage, 1_000)).toBe(true);
    expect(claimReload(storage, 1_000 + RELOAD_GUARD_MS - 1)).toBe(false);
    expect(claimReload(storage, 1_000 + RELOAD_GUARD_MS)).toBe(true);
  });

  it('senza sessionStorage non ricarica (non potrebbe evitare un ciclo)', () => {
    const broken = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => {} };
    const win = fakeWindow(broken);
    uninstall = installChunkReload(win);
    missingChunk(win);
    expect(win.location.reload).not.toHaveBeenCalled();
  });

  it('altri errori non ricaricano', () => {
    const win = fakeWindow();
    uninstall = installChunkReload(win);
    win.dispatchEvent(new Event('error'));
    win.dispatchEvent(new Event('unhandledrejection'));
    expect(win.location.reload).not.toHaveBeenCalled();
  });
});
