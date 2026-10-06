import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '../../context/AppContext';
import { Statistiche } from '../Statistiche';
import { statsService } from '../../services/statsService';
import { riderService } from '../../services/riderService';
import { OVERVIEW } from '../../test/statsFixtures';

const renderWithProviders = (ui) => render(
  <MemoryRouter>
    <AppProvider>{ui}</AppProvider>
  </MemoryRouter>
);

describe('Statistiche con dati reali (/api/stats/overview)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.spyOn(statsService, 'getOverview').mockResolvedValue(OVERVIEW);
    vi.spyOn(riderService, 'getScore').mockResolvedValue({
      today: '2026-09-24', total: 315,
      days: [{ date: '2026-09-24', score: 295, deliveries: 3 }, { date: '2026-09-20', score: 20, deliveries: 1 }]
    });
    vi.spyOn(riderService, 'getEarnings').mockResolvedValue({ summary: {}, days: [{ date: '2026-09-24', deliveries: 3, earnings: 24.5 }] });
  });

  it('mostra km, velocità e tempo di oggi calcolati dal backend', async () => {
    renderWithProviders(<Statistiche />);
    expect(await screen.findAllByText('Oggi')).not.toHaveLength(0);
    expect(screen.getByText('25.0')).toBeInTheDocument(); // km di oggi
    expect(screen.getByText('16.7')).toBeInTheDocument(); // velocità media
    expect(screen.getByText('1.67')).toBeInTheDocument(); // ore: 1 h 30 in movimento + 10 min di pause
    expect(screen.getByText('1 h 40 min')).toBeInTheDocument();
    expect(screen.getByText('+25.0 km')).toBeInTheDocument(); // ieri 0 km
    expect(screen.getByText('2 uscite registrate')).toBeInTheDocument();
    expect(screen.getByText(/Da sempre: 4 uscite registrate • 61.0 km/)).toBeInTheDocument();
  });

  it('selezionando un altro giorno aggiorna i valori', async () => {
    renderWithProviders(<Statistiche />);
    fireEvent.click(await screen.findByText('20'));
    expect(screen.getByText('6.0')).toBeInTheDocument();
    expect(screen.getByText('12.0')).toBeInTheDocument();
    expect(screen.getByText('1 uscita registrata')).toBeInTheDocument();
  });

  it('consegne e punteggio del giorno arrivano dal server', async () => {
    renderWithProviders(<Statistiche />);
    await screen.findByText('25.0');
    expect(screen.getByText('€24.50')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('295')).toBeInTheDocument();
    expect(screen.getByText('7 gg: 315')).toBeInTheDocument();
    expect(screen.queryByText(/Gold Pro|100% Puntuale|180 Punti|Presto disponibile/)).not.toBeInTheDocument();
  });
});
