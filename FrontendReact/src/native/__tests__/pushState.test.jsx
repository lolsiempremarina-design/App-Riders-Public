import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { isPushActive, requestRefresh, setPushActive, usePollInterval, useRefreshOn } from '../pushState';

describe('push attive e aggiornamenti immediati (meno richieste nell\'app Android)', () => {
  afterEach(() => setPushActive(false));

  it('controlli periodici più radi solo mentre le push funzionano', () => {
    const { result } = renderHook(() => usePollInterval(30000, 120000));
    expect(result.current).toBe(30000);
    act(() => setPushActive(true));
    expect(isPushActive()).toBe(true);
    expect(result.current).toBe(120000);
    act(() => setPushActive(false)); // logout o permesso tolto
    expect(result.current).toBe(30000);
  });

  it('push ricevuta: aggiorna solo chi segue la sua categoria; ritorno in primo piano: tutti', () => {
    const orders = vi.fn();
    const everything = vi.fn();
    renderHook(() => {
      useRefreshOn(['consegne'], orders);
      useRefreshOn(null, everything);
    });
    act(() => requestRefresh('sicurezza'));
    expect(orders).not.toHaveBeenCalled();
    expect(everything).toHaveBeenCalledTimes(1);
    act(() => requestRefresh('consegne'));
    expect(orders).toHaveBeenCalledTimes(1);
    act(() => requestRefresh()); // resume
    expect(orders).toHaveBeenCalledTimes(2);
    expect(everything).toHaveBeenCalledTimes(3);
  });

  it('smontato il componente non riceve più richieste', () => {
    const onRefresh = vi.fn();
    const { unmount } = renderHook(() => useRefreshOn(['sicurezza'], onRefresh));
    unmount();
    act(() => requestRefresh('sicurezza'));
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
