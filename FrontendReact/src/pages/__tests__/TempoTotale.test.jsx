import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '../../context/AppContext';
import { TempoTotale } from '../TempoTotale';
import { statsService } from '../../services/statsService';
import { PERIODS } from '../../test/statsFixtures';

const renderWithProviders = (ui) => render(
  <MemoryRouter>
    <AppProvider>{ui}</AppProvider>
  </MemoryRouter>
);

describe('TempoTotale con dati reali (/api/stats/period)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.spyOn(statsService, 'getPeriod').mockImplementation(async (period) => PERIODS[period]);
  });

  it('il tempo in sella di oggi è tempo in movimento più pause, con le percentuali reali', async () => {
    renderWithProviders(<TempoTotale />);
    expect(await screen.findByText('Oggi')).toBeInTheDocument();
    expect(screen.getByText('1.67')).toBeInTheDocument(); // 5400 s in movimento + 600 s di pause
    expect(screen.getByText(/2 uscite registrate • 1 h 40 min/)).toBeInTheDocument();
    expect(screen.getByText('1.50')).toBeInTheDocument(); // in movimento
    expect(screen.getByText('90% del Totale')).toBeInTheDocument();
    expect(screen.getByText('0.17')).toBeInTheDocument(); // pause
    expect(screen.getByText('10% del Totale')).toBeInTheDocument();
    // un percorso più vecchio non ha l'ultimo punto: le sue pause non si inventano, lo si dichiara
    expect(screen.getByText(/senza pause registrate: 1\. Per queste conta solo il tempo in movimento/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Pause'));
    expect(await screen.findByText(/in pausa o senza posizioni GPS per più di 2 minuti/)).toBeInTheDocument();
  });

  it('un\'uscita senza pause è tutta tempo in movimento e non mostra avvisi', async () => {
    renderWithProviders(<TempoTotale />);
    await screen.findByText('Oggi');
    fireEvent.click(screen.getByRole('button', { name: /^Anno$/i }));
    expect(await screen.findByText('2025')).toBeInTheDocument();
    expect(screen.getByText('2.17')).toBeInTheDocument(); // 2026 selezionato
    fireEvent.click(screen.getByText('2025'));
    expect(screen.getAllByText('1.00')).toHaveLength(2); // tempo in sella = tempo in movimento
    expect(screen.getByText('0.00')).toBeInTheDocument();
    expect(screen.getByText('100% del Totale')).toBeInTheDocument();
    expect(screen.getByText('0% del Totale')).toBeInTheDocument();
    expect(screen.queryByText(/senza pause registrate/)).not.toBeInTheDocument();
  });

  it('mostra i mesi e il chip unico di Sempre', async () => {
    renderWithProviders(<TempoTotale />);
    await screen.findByText('Oggi');
    fireEvent.click(screen.getByRole('button', { name: /^Mese$/i }));
    expect(await screen.findByText('Set')).toBeInTheDocument();
    expect(screen.getByText('2.17')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Mag'));
    expect(screen.getByText('Nessuna uscita registrata in questo periodo.')).toBeInTheDocument();
    expect(screen.queryByText(/% del Totale/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Sempre$/i }));
    expect(await screen.findAllByText('Sempre')).toHaveLength(2);
    expect(screen.getByText('3.17')).toBeInTheDocument();
  });
});
