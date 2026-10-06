import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AppProvider } from '../../context/AppContext';
import { Percorsi } from '../Percorsi';
import { routeService } from '../../services/routeService';

const ROUTES = [
  { id: 7, sessionId: 'a', startedAt: '2026-09-24T11:00:00', endedAt: '2026-09-24T11:30:00', distanceKm: 12, durationSec: 1800, avgSpeedKmh: 24, hasGpx: true },
  { id: 5, sessionId: 'b', startedAt: '2026-09-20T18:00:00', endedAt: '2026-09-20T18:15:00', distanceKm: 3, durationSec: 900, avgSpeedKmh: 12, hasGpx: false }
];

const MapProbe = () => {
  const location = useLocation();
  return <div>mappa {location.search}</div>;
};

const renderPage = () => render(
  <MemoryRouter initialEntries={['/percorsi']}>
    <AppProvider>
      <Routes>
        <Route path="/percorsi" element={<Percorsi />} />
        <Route path="/mappa" element={<MapProbe />} />
      </Routes>
    </AppProvider>
  </MemoryRouter>
);

describe('Percorsi (storico GPS reale)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.spyOn(routeService, 'list').mockResolvedValue({ routes: ROUTES, total: 2, limit: 20, offset: 0 });
  });

  it('elenca i percorsi con link GPX solo se il file esiste', async () => {
    renderPage();
    expect(await screen.findByText('2 percorsi registrati')).toBeInTheDocument();
    expect(screen.getByText('12.00')).toBeInTheDocument();
    expect(screen.getByText('24.0 km/h')).toBeInTheDocument();
    const gpx = screen.getByRole('link', { name: 'Scarica GPX' });
    expect(gpx).toHaveAttribute('href', '/api/routes/7/gpx');
    expect(gpx).toHaveAttribute('download');
    expect(screen.getAllByRole('link', { name: 'Scarica GPX' })).toHaveLength(1);
    expect(screen.getByText('File GPX non disponibile')).toBeInTheDocument();
  });

  it('apre il percorso sulla mappa', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Mostra sulla mappa' }));
    expect(screen.getByText('mappa ?percorso=7')).toBeInTheDocument();
  });

  it('elimina un percorso dopo la conferma', async () => {
    vi.spyOn(routeService, 'remove').mockResolvedValue({ success: true, id: 5 });
    renderPage();
    const deleteButtons = await screen.findAllByRole('button', { name: 'Elimina' });
    fireEvent.click(deleteButtons[1]);
    expect(await screen.findByText('Eliminare il percorso?')).toBeInTheDocument();
    const confirm = screen.getAllByRole('button', { name: 'Elimina' }).at(-1);
    fireEvent.click(confirm);
    await waitFor(() => expect(routeService.remove).toHaveBeenCalledWith(5));
    expect(await screen.findByText('1 percorso registrato')).toBeInTheDocument();
  });

  it('stato vuoto onesto quando non ci sono percorsi', async () => {
    routeService.list.mockResolvedValue({ routes: [], total: 0, limit: 20, offset: 0 });
    renderPage();
    expect(await screen.findByText('Nessun percorso registrato')).toBeInTheDocument();
  });
});
