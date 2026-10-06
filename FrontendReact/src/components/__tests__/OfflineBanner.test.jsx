import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { AppProvider } from '../../context/AppContext';
import { OfflineBanner } from '../OfflineBanner';

let online = true;

describe('OfflineBanner', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
  });

  afterEach(() => {
    online = true;
    delete navigator.onLine;
  });

  it('app aperta già senza rete: avviso offline e, al ritorno della rete, avviso di ripristino', async () => {
    online = false;
    render(<AppProvider><OfflineBanner /></AppProvider>);
    expect(screen.getByText('Sei offline')).toBeInTheDocument();

    online = true;
    await act(async () => { window.dispatchEvent(new Event('online')); });
    expect(screen.getByText('Connessione ripristinata')).toBeInTheDocument();
  });
});
