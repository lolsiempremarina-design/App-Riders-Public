import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from '../../context/AppContext';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { ConfermaEmail } from '../ConfermaEmail';
import { authService } from '../../services/authService';
import { ApiError } from '../../services/api';

const NEW_ACCOUNT = {
  id: 3, username: 'giulia_r', email: 'giulia@example.com', name: 'Giulia', surname: 'Russo',
  language: 'it', emailConfirmed: false, pendingEmail: null, roles: [], isAdmin: false
};

const renderAt = (path, profile) => {
  localStorage.setItem('ror-user-profile', JSON.stringify(profile));
  vi.spyOn(authService, 'getSession').mockResolvedValue(profile);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppProvider>
        <Routes>
          <Route path="/" element={<ProtectedRoute><p>Home del rider</p></ProtectedRoute>} />
          <Route path="/profilo" element={<ProtectedRoute><p>Pagina profilo</p></ProtectedRoute>} />
          <Route path="/conferma-email" element={<ProtectedRoute><ConfermaEmail /></ProtectedRoute>} />
          <Route path="/login" element={<p>Pagina login</p>} />
        </Routes>
      </AppProvider>
    </MemoryRouter>
  );
};

describe('Conferma dell\'email con il codice', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.spyOn(authService, 'getEmailConfirmation')
      .mockResolvedValue({ confirmed: false, email: 'giulia@example.com', resendInSec: 0, mailConfigured: true });
  });

  it('un account nuovo non confermato viene portato alla conferma, poi alla Home', async () => {
    const confirm = vi.spyOn(authService, 'confirmEmail').mockResolvedValue({ ...NEW_ACCOUNT, emailConfirmed: true });
    renderAt('/', NEW_ACCOUNT);
    expect(await screen.findByText(/Abbiamo inviato un codice di 6 cifre a giulia@example.com/)).toBeInTheDocument();
    expect(screen.queryByText('Home del rider')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Codice di conferma'), { target: { value: '12 34 56' } });
    fireEvent.click(screen.getByRole('button', { name: 'Conferma' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith('123456'));
    expect(await screen.findByText('Home del rider')).toBeInTheDocument();
  });

  it('mostra l\'errore del server e corregge un indirizzo scritto male', async () => {
    vi.spyOn(authService, 'confirmEmail').mockRejectedValue(
      new ApiError('x', 422, { error: 'validation_error', fields: { code: 'Il codice non è corretto.' } }));
    const resend = vi.spyOn(authService, 'resendEmailCode').mockResolvedValue({ email: 'giulia.russo@example.com', resendInSec: 60 });
    renderAt('/conferma-email', NEW_ACCOUNT);
    await screen.findByText(/giulia@example.com/);

    fireEvent.change(screen.getByLabelText('Codice di conferma'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Conferma' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Il codice non è corretto.');

    fireEvent.change(screen.getByLabelText(/Indirizzo sbagliato/), { target: { value: 'giulia.russo@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Invia il codice a questo indirizzo' }));
    await waitFor(() => expect(resend).toHaveBeenCalledWith('giulia.russo@example.com'));
    expect(await screen.findByText(/6 cifre a giulia.russo@example.com/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Nuovo codice tra 60 s/ })).toBeDisabled();
  });

  it('un account confermato con un cambio di email in attesa può annullarlo', async () => {
    const confirmed = { ...NEW_ACCOUNT, emailConfirmed: true, pendingEmail: 'nuova@example.com' };
    vi.spyOn(authService, 'getEmailConfirmation')
      .mockResolvedValue({ confirmed: true, email: 'nuova@example.com', resendInSec: 30, mailConfigured: true });
    const cancel = vi.spyOn(authService, 'cancelEmailChange').mockResolvedValue({ ...confirmed, pendingEmail: null });
    renderAt('/conferma-email', confirmed);
    expect(await screen.findByText('Conferma la nuova email')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Annulla il cambio di email' }));
    await waitFor(() => expect(cancel).toHaveBeenCalled());
    expect(await screen.findByText('Pagina profilo')).toBeInTheDocument();
  });
});
