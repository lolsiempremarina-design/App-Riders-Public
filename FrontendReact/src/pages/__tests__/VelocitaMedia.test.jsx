import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '../../context/AppContext';
import { VelocitaMedia, generateChartFromRawData } from '../VelocitaMedia';
import { statsService } from '../../services/statsService';
import { PERIODS } from '../../test/statsFixtures';

const renderWithProviders = (ui) => render(
  <MemoryRouter>
    <AppProvider>{ui}</AppProvider>
  </MemoryRouter>
);

describe('VelocitaMedia con dati reali (/api/stats/period)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.spyOn(statsService, 'getPeriod').mockImplementation(async (period) => PERIODS[period]);
  });

  it('mostra i 7 giorni reali con oggi selezionato e la velocità media del giorno', async () => {
    renderWithProviders(<VelocitaMedia />);
    expect(await screen.findByText('Oggi')).toBeInTheDocument();
    expect(statsService.getPeriod).toHaveBeenCalledWith('week');
    expect(screen.getByText('24')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.getByText('16.7')).toBeInTheDocument();
    expect(screen.getAllByText(/Miglior media di una uscita: 20.0 Km\/h/).length).toBeGreaterThan(0);
  });

  it('selezionando un giorno senza uscite lo dice invece di inventare valori', async () => {
    renderWithProviders(<VelocitaMedia />);
    fireEvent.click(await screen.findByText('21'));
    expect(screen.getByText('0.0')).toBeInTheDocument();
    expect(screen.getByText('Nessuna uscita registrata in questo periodo.')).toBeInTheDocument();
    expect(screen.getByText('Nessun dato da mostrare nel grafico.')).toBeInTheDocument();
  });

  it('carica mese, anno e sempre dal backend', async () => {
    renderWithProviders(<VelocitaMedia />);
    await screen.findByText('Oggi');

    fireEvent.click(screen.getByRole('button', { name: /^Mese$/i }));
    expect(await screen.findByText('Set')).toBeInTheDocument();
    expect(screen.getByText('Apr')).toBeInTheDocument();
    expect(screen.getByText('15.5')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Anno$/i }));
    expect(await screen.findByText('2025')).toBeInTheDocument();
    expect(screen.getByText('2026')).toBeInTheDocument();
    fireEvent.click(screen.getByText('2025'));
    expect(screen.getByText('30.0')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Sempre$/i }));
    expect(await screen.findAllByText('Sempre')).toHaveLength(2); // tab + unico chip
    expect(screen.queryByText('2025')).not.toBeInTheDocument();
    expect(screen.getByText('20.3')).toBeInTheDocument();
    expect(statsService.getPeriod.mock.calls.map(([p]) => p)).toEqual(['week', 'month', 'year', 'always']);
  });

  it('usa le etichette della lingua attiva (spagnolo)', async () => {
    localStorage.setItem('ror-language', 'es');
    renderWithProviders(<VelocitaMedia />);
    expect(await screen.findByText('Hoy')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Mes$/i }));
    expect(await screen.findByText('Sept')).toBeInTheDocument();
    expect(screen.getByText('Abr')).toBeInTheDocument();
  });

  it('mostra un errore con pulsante Riprova se il backend non risponde', async () => {
    statsService.getPeriod.mockRejectedValueOnce(new Error('Server non raggiungibile'));
    renderWithProviders(<VelocitaMedia />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Server non raggiungibile');
    fireEvent.click(screen.getByRole('button', { name: 'Riprova' }));
    expect(await screen.findByText('Oggi')).toBeInTheDocument();
  });
});

describe('generateChartFromRawData', () => {
  it('scala il grafico sui valori reali e calcola le etichette dell\'asse Y', () => {
    const chart = generateChartFromRawData([
      { label: '09:00', speed: 12, distanceKm: 6, count: 1 },
      { label: '11:00', speed: 20, distanceKm: 10, count: 1 }
    ]);
    expect(chart.points).toHaveLength(2);
    expect(chart.points[0].cy).toBeGreaterThan(chart.points[1].cy);
    expect(chart.yTicks).toEqual([25, 19, 13, 7]);
    expect(generateChartFromRawData([]).points).toEqual([]);
    expect(generateChartFromRawData([{ label: 'x', speed: 10, distanceKm: 1, count: 1 }]).chartPathLine).toMatch(/^M 16,\d+ L 260,\d+$/);
  });
});
