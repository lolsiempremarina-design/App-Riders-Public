import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '../../context/AppContext';
import { authService } from '../../services/authService';
import { accountService } from '../../services/accountService';
import { Privacy } from '../Privacy';
import { Info } from '../Info';

const PROFILE = { id: 1, username: 'anna', language: 'it', roles: [] };

const INFO = {
  controller: { name: 'Cooperativa Rider Milano', email: 'privacy@example.com', configured: true },
  retention: { routes_days: 0, notifications_days: 180, sos_alerts_days: 365, chat_messages_days: 365, live_position_sec: 90 },
  sos_email_enabled: false
};

const renderPage = (page) => render(
  <MemoryRouter>
    <AppProvider>{page}</AppProvider>
  </MemoryRouter>
);

describe('Privacy (dati reali dal server)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('mostra titolare e tempi di conservazione configurati e scarica i dati reali', async () => {
    localStorage.setItem('ror-user-profile', JSON.stringify(PROFILE));
    vi.spyOn(authService, 'getSession').mockResolvedValue(PROFILE);
    vi.spyOn(accountService, 'privacyInfo').mockResolvedValue(INFO);
    const download = vi.spyOn(accountService, 'downloadExport').mockResolvedValue({});
    renderPage(<Privacy />);

    expect(await screen.findByText(/Cooperativa Rider Milano/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'privacy@example.com' })).toHaveAttribute('href', 'mailto:privacy@example.com');
    expect(screen.getByText('180 giorni')).toBeInTheDocument();
    expect(screen.getByText('90 secondi')).toBeInTheDocument();
    expect(screen.getByText(/finché non li elimini tu/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Scarica i miei dati (JSON)' }));
    await waitFor(() => expect(download).toHaveBeenCalledWith('anna'));
  });

  it('senza titolare configurato lo dice e senza accesso non offre l\'esportazione', async () => {
    vi.spyOn(accountService, 'privacyInfo').mockResolvedValue({
      ...INFO, controller: { name: null, email: null, configured: false }
    });
    renderPage(<Privacy />);
    expect(await screen.findByText(/non ha ancora indicato titolare/)).toBeInTheDocument();
    expect(screen.getByText('Accedi per scaricare i tuoi dati.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Scarica i miei dati/ })).not.toBeInTheDocument();
    // niente dati di esempio spacciati per reali
    expect(document.body.textContent).not.toMatch(/Kasko|Blockchain/);
  });
});

describe('Info (guida delle funzioni reali)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('cerca nella guida e filtra per categoria', () => {
    renderPage(<Info />);
    expect(screen.getByRole('button', { name: /Registrare un percorso/ })).toHaveAttribute('aria-expanded', 'true');

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'giroscopio' } });
    expect(screen.getByRole('button', { name: /Cadute e SOS/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Consegne e guadagni/ })).not.toBeInTheDocument();
    expect(screen.getByText(/conto alla rovescia di 10 secondi/)).toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Consegne' }));
    expect(screen.getByRole('button', { name: /Consegne e guadagni/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cadute e SOS/ })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Kasko|Bluetooth|RoR Partner/);
  });
});
