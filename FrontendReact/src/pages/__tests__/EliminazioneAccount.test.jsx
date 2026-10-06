import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from '../../context/AppContext';
import { accountService } from '../../services/accountService';
import { ACCOUNT_DELETION } from '../../content/accountDeletion';
import { EliminazioneAccount } from '../EliminazioneAccount';

const INFO = {
  controller: { name: 'Cooperativa Rider Milano', email: 'privacy@example.com', configured: true },
  retention: { routes_days: 0, notifications_days: 180, sos_alerts_days: 365, chat_messages_days: 365, live_position_sec: 90, backups_days: 14 },
  sos_email_enabled: false
};

const renderPage = () => render(
  <MemoryRouter initialEntries={['/eliminazione-account']}>
    <AppProvider>
      <Routes>
        <Route path="/eliminazione-account" element={<EliminazioneAccount />} />
        <Route path="/elimina-account" element={<p>Flusso di eliminazione</p>} />
      </Routes>
    </AppProvider>
  </MemoryRouter>
);

describe('EliminazioneAccount (pagina pubblica, anche senza app)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('senza accesso spiega i due modi e usa contatto e backup configurati sul server', async () => {
    vi.spyOn(accountService, 'privacyInfo').mockResolvedValue(INFO);
    renderPage();

    const mail = await screen.findByRole('link', { name: 'privacy@example.com' });
    const href = mail.getAttribute('href');
    expect(href.startsWith('mailto:privacy@example.com?subject=')).toBe(true);
    expect(decodeURIComponent(href)).toContain('Richiesta di eliminazione account RoR');
    expect(screen.getByText(/Cooperativa Rider Milano/)).toBeInTheDocument();
    expect(screen.getByText(/entro 14 giorni/)).toBeInTheDocument();
    expect(screen.getByText(/senza il tuo nome/)).toBeInTheDocument();
    expect(screen.getByText(/codice fiscale/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Accedi ed elimina l\'account' }));
    expect(await screen.findByText('Flusso di eliminazione')).toBeInTheDocument();
  });

  it('senza contatto configurato o senza server non inventa un indirizzo', async () => {
    vi.spyOn(accountService, 'privacyInfo').mockResolvedValue({
      ...INFO, controller: { name: null, email: null, configured: false }
    });
    const { unmount } = renderPage();
    expect(await screen.findByText(/non ha ancora indicato un contatto email/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /@/ })).not.toBeInTheDocument();
    unmount();

    vi.spyOn(accountService, 'privacyInfo').mockRejectedValue(new Error('offline'));
    renderPage();
    expect(await screen.findByText(/Impossibile leggere il contatto dal server/)).toBeInTheDocument();
    expect(screen.getByText(/quando le copie vengono sostituite/)).toBeInTheDocument();
    expect(screen.queryByText(/entro \d+ giorni/)).not.toBeInTheDocument();
  });

  it('i testi esistono in tutte le lingue dell\'app', () => {
    const keys = Object.keys(ACCOUNT_DELETION.it).sort();
    ['en', 'es'].forEach((lang) => {
      expect(Object.keys(ACCOUNT_DELETION[lang]).sort(), lang).toEqual(keys);
      expect(ACCOUNT_DELETION[lang].deleted, lang).toHaveLength(ACCOUNT_DELETION.it.deleted.length);
      expect(ACCOUNT_DELETION[lang].keptBackups(7), lang).toContain('7');
    });
  });
});
