import { describe, it, expect, afterEach, vi } from 'vitest';
import { shouldPollNow } from '../appState';
import { REFRESH_EVENT } from '../pushState';

const setVisibility = (state) => {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
};

describe('Controlli periodici con la pagina nascosta', () => {
  afterEach(() => {
    setVisibility('visible');
  });

  it('con la pagina visibile si controlla sempre', () => {
    setVisibility('visible');
    expect(shouldPollNow()).toBe(true);
    expect(shouldPollNow(Date.now(), 120000)).toBe(true);
  });

  it('con la pagina nascosta niente richieste, o al massimo una ogni intervallo di background', () => {
    setVisibility('hidden');
    expect(shouldPollNow()).toBe(false); // ordini, mappa: nessuno guarda
    expect(shouldPollNow(Date.now() - 30000, 120000)).toBe(false);
    expect(shouldPollNow(Date.now() - 130000, 120000)).toBe(true); // notifiche: ogni 2 minuti
  });

  it('quando la pagina torna visibile si chiede di ricaricare tutto', () => {
    const handler = vi.fn();
    window.addEventListener(REFRESH_EVENT, handler);
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    window.removeEventListener(REFRESH_EVENT, handler);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].detail).toEqual({ category: null });
  });
});
