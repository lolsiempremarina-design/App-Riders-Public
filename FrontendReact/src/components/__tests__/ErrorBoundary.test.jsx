import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '../ErrorBoundary';
import { installChunkReload } from '../../utils/chunkReload';

const BrokenComponent = () => {
  throw new Error('Crash simulato di test nel componente!');
};

const WorkingComponent = () => {
  return <div>Componente perfettamente funzionante</div>;
};

describe('ErrorBoundary Component', () => {
  it('renderizza normalmente i componenti figli quando non ci sono errori', () => {
    render(
      <ErrorBoundary>
        <WorkingComponent />
      </ErrorBoundary>
    );
    expect(screen.getByText('Componente perfettamente funzionante')).toBeInTheDocument();
  });

  it('cattura errori imprevisti e mostra la UI di salvataggio invece della schermata bianca', () => {
    // Silenzia il console.error di React per questo test atteso
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Si è verificato un imprevisto' })).toBeInTheDocument();
    expect(screen.getByText(/dati già salvati sul server non sono stati toccati/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ricarica schermata/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Torna alla Home/i })).toBeInTheDocument();
    // niente promesse inventate ("turni, guadagni e dati della e-bike")
    expect(document.body.textContent).not.toMatch(/e-bike|turni, guadagni/);

    consoleSpy.mockRestore();
  });

  it('usa la lingua scelta dall\'utente', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem('ror-language', 'en');
    try {
      render(
        <ErrorBoundary>
          <BrokenComponent />
        </ErrorBoundary>
      );
      expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Reload screen/ })).toBeInTheDocument();
    } finally {
      localStorage.removeItem('ror-language');
      consoleSpy.mockRestore();
    }
  });

  it('permette di reimpostare lo stato tramite callback personalizzata onReset', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handleReset = vi.fn();

    render(
      <ErrorBoundary onReset={handleReset}>
        <BrokenComponent />
      </ErrorBoundary>
    );

    const resetBtn = screen.getByRole('button', { name: /Torna alla Home/i });
    fireEvent.click(resetBtn);

    expect(handleReset).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
  });

  it('durante la ricarica per un aggiornamento del server non mostra la schermata di errore', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const target = new EventTarget();
    const storage = new Map();
    const win = {
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
      sessionStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) },
      location: { reload: vi.fn() }
    };
    const uninstall = installChunkReload(win);
    try {
      // la pagina della versione precedente non arriva: Vite lo segnala e la ricarica parte
      target.dispatchEvent(new Event('vite:preloadError'));
      expect(win.location.reload).toHaveBeenCalledTimes(1);
      render(
        <ErrorBoundary>
          <BrokenComponent />
        </ErrorBoundary>
      );
      expect(screen.getByRole('status')).toHaveTextContent("Aggiornamento dell'app in corso...");
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    } finally {
      uninstall();
      consoleSpy.mockRestore();
    }
  });

  it('usa solo colori del tema che esistono (il titolo si legge anche con il tema chiaro)', () => {
    // prima lo sfondo era var(--bg-app), che non esiste: restava sempre scuro, e con il tema chiaro
    // il titolo (--text-main scuro) non si leggeva
    const source = readFileSync(join(process.cwd(), 'src/components/ErrorBoundary.jsx'), 'utf8');
    const theme = readFileSync(join(process.cwd(), 'src/styles/core/variables.css'), 'utf8');
    const used = [...new Set([...source.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]))];
    expect(used).toContain('--bg-app-shell');
    expect(used.filter((name) => !theme.includes(`${name}:`))).toEqual([]);
  });
});