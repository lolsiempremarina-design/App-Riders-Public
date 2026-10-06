import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// findBy*/waitFor aspettano fino a 1 s di default: la prima esecuzione dopo una modifica (Vite ricompila tutto)
// è più lenta e un test della chat superava ogni tanto quel limite pur essendo corretto (1 volta su 8 il 05/10).
// Si aspetta di più solo quando serve: i test che passano non diventano più lenti.
configure({ asyncUtilTimeout: 3000 });

/**
 * fetch di default per i test: simula un backend raggiungibile con utente NON
 * autenticato (GET /api/auth/session) e risposte JSON vuote per il resto.
 * I singoli test possono sovrascriverlo con global.fetch = vi.fn(...) o vi.spyOn.
 * È una funzione normale (non vi.fn) così resetAllMocks/restoreAllMocks non la svuotano.
 */
export const defaultFetchMock = async (url) => {
  const target = String(url);
  let body = {};
  if (target.includes('/auth/session')) {
    body = { authenticated: false, user: null, csrf_token: 'test-csrf-token' };
  } else if (target.includes('/auth/csrf') || target.includes('/auth/logout')) {
    body = { csrf_token: 'test-csrf-token', authenticated: false, user: null };
  }
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body
  };
};
globalThis.fetch = defaultFetchMock;

// Pulizia automatica del DOM dopo ogni test
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

// Mock di window.matchMedia per supporto temi e responsive design
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }))
});

// Mock di navigator.vibrate
if (typeof navigator !== 'undefined') {
  Object.defineProperty(navigator, 'vibrate', {
    writable: true,
    value: vi.fn().mockReturnValue(true)
  });
}

// Mock di ResizeObserver (una classe: da Vitest 3 un vi.fn con arrow function non si può usare con new)
global.ResizeObserver = class {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
};

// Mock di AudioContext per Web Audio API
if (typeof window !== 'undefined') {
  class MockAudioContext {
    constructor() {
      this.currentTime = 0;
      this.state = 'running';
      this.destination = {};
    }
    createOscillator() {
      return {
        type: 'sine',
        frequency: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn()
      };
    }
    createGain() {
      return {
        gain: {
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn()
        },
        connect: vi.fn()
      };
    }
    resume() {
      return Promise.resolve();
    }
  }
  window.AudioContext = MockAudioContext;
  window.webkitAudioContext = MockAudioContext;
}

