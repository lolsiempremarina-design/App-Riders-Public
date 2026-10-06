import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchWithTimeout, DEFAULT_FETCH_TIMEOUT_MS } from '../fetchWithTimeout';

// una rete che non risponde mai, ma che si interrompe con il segnale come il vero fetch
const hangingFetch = () => vi.fn((url, init) => new Promise((resolve, reject) => {
  init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
}));

describe('fetchWithTimeout', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.useRealTimers();
  });

  it('una richiesta che non risponde viene interrotta dopo il tempo massimo (20 s come nell\'app Android)', async () => {
    vi.useFakeTimers();
    globalThis.fetch = hangingFetch();
    let settled = false;
    const request = fetchWithTimeout('/stream', { method: 'POST' }).catch((e) => e).finally(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(DEFAULT_FETCH_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect((await request).name).toBe('AbortError');
  });

  it('una risposta in tempo passa invariata e non lascia timer accesi', async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200 }));
    await expect(fetchWithTimeout('/api/x', { method: 'GET' })).resolves.toMatchObject({ status: 200 });
    expect(globalThis.fetch.mock.calls[0][1]).toMatchObject({ method: 'GET', signal: expect.any(AbortSignal) });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rispetta anche il segnale di chi chiama', async () => {
    globalThis.fetch = hangingFetch();
    const controller = new AbortController();
    const request = fetchWithTimeout('/api/x', { signal: controller.signal }, 60000);
    controller.abort();
    await expect(request).rejects.toThrow('aborted');
  });
});
