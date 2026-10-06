import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '../../context/AppContext';
import { RideTrackingProvider } from '../../context/RideTrackingContext';
import { Home, formatClock } from '../Home';
import { trackingService } from '../../services/trackingService';
import { sosService } from '../../services/sosService';
import { authService } from '../../services/authService';

const PROFILE = { id: 7, username: 'rider', name: 'Mario', surname: 'Rossi', language: 'it', sensorsEnabled: true, shareLocationWithGroups: false, roles: [] };

const renderHome = () => render(
  <MemoryRouter>
    <AppProvider>
      <RideTrackingProvider>
        <Home />
      </RideTrackingProvider>
    </AppProvider>
  </MemoryRouter>
);

let geo;

describe('Home — sessione di guida reale, SOS e avvisi dei gruppi', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    localStorage.setItem('ror-user-profile', JSON.stringify(PROFILE));
    vi.spyOn(authService, 'getSession').mockResolvedValue(PROFILE);
    vi.spyOn(sosService, 'active').mockResolvedValue({ mine: null, groups: [] });
    vi.spyOn(trackingService, 'sendPoints').mockResolvedValue({ status: 'ok' });
    vi.spyOn(trackingService, 'endSession').mockResolvedValue({ status: 'ok' });
    geo = {
      watchPosition: vi.fn((success) => { geo.success = success; return 3; }),
      clearWatch: vi.fn(),
      getCurrentPosition: vi.fn((_ok, err) => err && err({ code: 1 }))
    };
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: geo });
  });

  afterEach(() => {
    delete navigator.geolocation;
  });

  it('saluta con il nome reale e non mostra la batteria inventata', async () => {
    renderHome();
    expect(await screen.findByText('Ciao, Mario!')).toBeInTheDocument();
    expect(screen.queryByText(/86%/)).not.toBeInTheDocument();
  });

  it('avvia la sessione, mostra i dati reali e la termina salvando il percorso', async () => {
    renderHome();
    fireEvent.click(await screen.findByText('Sessione'));
    expect(await screen.findByText('Sessione in corso')).toBeInTheDocument();
    expect(screen.getByText('In attesa del segnale GPS...', { exact: false })).toBeInTheDocument();

    await act(async () => {
      geo.success({ coords: { latitude: 45, longitude: 9, accuracy: 6, speed: 5 }, timestamp: 1000 });
      geo.success({ coords: { latitude: 45.001, longitude: 9, accuracy: 6, speed: 5 }, timestamp: 21000 });
    });
    expect(screen.getByText('0.11')).toBeInTheDocument(); // km
    expect(screen.getByText('18')).toBeInTheDocument();   // km/h
    expect(screen.getByText(/in attesa: 2/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pausa' }));
    expect(screen.getByText('Sessione in pausa')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Riprendi' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Termina' }));
    fireEvent.click((await screen.findAllByRole('button', { name: 'Termina' })).at(-1)); // conferma nel modal
    await waitFor(() => expect(trackingService.endSession).toHaveBeenCalled());
    expect(await screen.findByText('Percorso inviato')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'I miei percorsi' })).toHaveAttribute('href', '/percorsi');
  });

  it('se "Sensori" è disattivato lo spiega con il link alle impostazioni', async () => {
    localStorage.setItem('ror-user-profile', JSON.stringify({ ...PROFILE, sensorsEnabled: false }));
    authService.getSession.mockResolvedValue({ ...PROFILE, sensorsEnabled: false });
    renderHome();
    fireEvent.click(await screen.findByText('Sessione'));
    expect(await screen.findByText(/attiva "Sensori"/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Attivala nelle impostazioni' })).toHaveAttribute('href', '/posizione');
  });

  it('SOS manuale: conferma, invio e schermata con chiamata/SMS ai contatti', async () => {
    vi.spyOn(sosService, 'trigger').mockResolvedValue({
      alert: { id: 4, source: 'manual', lat: 45.1, lon: 9.1, mapUrl: 'https://www.openstreetmap.org/?mlat=45.1' },
      created: true,
      notifications: { emailConfigured: false, emailsSent: 0, emailsFailed: 0, contactsWithEmail: 0, groupMembers: 2 },
      contacts: [{ id: 1, name: 'Anna', phone: '+39 333 111 2222', email: null }]
    });
    vi.spyOn(sosService, 'resolve').mockResolvedValue({ alert: { id: 4, status: 'resolved' } });
    renderHome();
    fireEvent.click(await screen.findByRole('button', { name: 'Invia SOS' }));
    expect(await screen.findByText('Inviare un SOS?')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Invia SOS' }).at(-1));

    expect(await screen.findByText('SOS registrato')).toBeInTheDocument();
    expect(sosService.trigger).toHaveBeenCalledWith(expect.objectContaining({ source: 'manual' }));
    expect(screen.getByText(/non sono configurati/)).toBeInTheDocument();
    expect(screen.getByText(/membri dei tuoi gruppi: 2/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Chiama 112' })).toHaveAttribute('href', 'tel:112');
    expect(screen.getAllByRole('link', { name: 'Chiama' })[0]).toHaveAttribute('href', 'tel:+393331112222');
    expect(screen.getByRole('link', { name: 'SMS' }).getAttribute('href')).toMatch(/^sms:\+393331112222\?body=SOS/);

    fireEvent.click(screen.getByRole('button', { name: "Sto bene: annulla l'SOS" }));
    await waitFor(() => expect(sosService.resolve).toHaveBeenCalledWith(4));
    await waitFor(() => expect(screen.queryByText('SOS registrato')).not.toBeInTheDocument());
  });

  it('mostra gli SOS dei membri dei gruppi', async () => {
    sosService.active.mockResolvedValue({ mine: null, groups: [{ id: 9, username: 'anna', lat: 45, lon: 9, createdAt: '2026-09-25T10:42:00' }] });
    renderHome();
    expect(await screen.findByText(/anna ha inviato un SOS \(10:42\)/)).toBeInTheDocument();
  });
});

describe('formatClock', () => {
  it('formatta il tempo di sessione', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(65000)).toBe('01:05');
    expect(formatClock(3725000)).toBe('1:02:05');
  });
});
