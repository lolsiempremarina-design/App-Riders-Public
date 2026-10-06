import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '../../context/AppContext';
import { DeleteAccountFlow } from '../DeleteAccountFlow';
import { authService } from '../../services/authService';

const renderWithProviders = (ui) => {
  return render(
    <MemoryRouter>
      <AppProvider>
        {ui}
      </AppProvider>
    </MemoryRouter>
  );
};

describe('DeleteAccountFlow Component', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('renderizza il primo passaggio di conferma con avviso di pericolo', () => {
    renderWithProviders(<DeleteAccountFlow />);

    expect(screen.getByText(/Attenzione!/i)).toBeInTheDocument();
    expect(screen.getByText(/Il tuo profilo verrà eliminato per sempre/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Annulla/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sì, procedi/i })).toBeInTheDocument();
  });

  it('passa al passaggio di inserimento password cliccando su Sì procedi', () => {
    renderWithProviders(<DeleteAccountFlow />);

    const proceedBtn = screen.getByRole('button', { name: /Sì, procedi/i });
    fireEvent.click(proceedBtn);

    expect(screen.getByText(/Verifica Identità/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Password del tuo profilo/i)).toBeInTheDocument();
  });

  it('esegue la cancellazione dell\'account e mostra la schermata di successo', async () => {
    vi.spyOn(authService, 'deleteAccount').mockResolvedValueOnce({ success: true });

    renderWithProviders(<DeleteAccountFlow />);

    // Passaggio 1 -> Passaggio 2
    fireEvent.click(screen.getByRole('button', { name: /Sì, procedi/i }));

    const passwordInput = screen.getByPlaceholderText(/Password del tuo profilo/i);
    fireEvent.change(passwordInput, { target: { value: 'PasswordSicura123!' } });

    const submitBtn = screen.getByRole('button', { name: /Elimina Account/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(authService.deleteAccount).toHaveBeenCalledWith('PasswordSicura123!');
      expect(screen.getByText(/Account Eliminato/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Torna alla Registrazione/i })).toBeInTheDocument();
    });
  });
});
