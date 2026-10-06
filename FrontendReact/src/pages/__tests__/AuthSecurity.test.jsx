import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '../../context/AppContext';
import { Accedi } from '../Accedi';
import { Register } from '../Register';
import { AUTH_STORAGE_KEYS } from '../../utils/authUtils';

const renderWithProviders = (ui) => {
  return render(
    <MemoryRouter>
      <AppProvider>
        {ui}
      </AppProvider>
    </MemoryRouter>
  );
};

// Mock di window.fetch per l'elenco dei comuni in Register (GET /api/municipalities)
global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: () => Promise.resolve({
      source: 'ISTAT - Elenco dei comuni italiani',
      updated: '2024-01-26',
      municipalities: [['Milano', 'MI', 'F205'], ['Roma', 'RM', 'H501']]
    })
  })
);

describe('AuthSecurity - Accedi & Register Enhanced Features', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('Accedi Page Component', () => {
    it('renderizza i campi principali e lo switch Ricordami (nessun accesso biometrico simulato)', () => {
      renderWithProviders(<Accedi />);

      expect(screen.getByLabelText(/Email o ID Matricola|Email Registrata/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Password Personale/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Ricordami su questo dispositivo/i)).toBeInTheDocument();
      expect(screen.queryByLabelText(/Accedi con Biometria/i)).not.toBeInTheDocument();
    });

    it('pre-popola l\'email salvata se Ricordami era precedentemente attivo', () => {
      localStorage.setItem(AUTH_STORAGE_KEYS.REMEMBER_ME, 'true');
      localStorage.setItem(AUTH_STORAGE_KEYS.SAVED_EMAIL, 'rider.pro@ror.it');

      renderWithProviders(<Accedi />);

      const emailInput = screen.getByLabelText(/Email o ID Matricola|Email Registrata/i);
      expect(emailInput).toHaveValue('rider.pro@ror.it');
    });

    it('mostra il meditore di forza della password in tempo reale quando si digita la password', async () => {
      renderWithProviders(<Accedi />);

      const passwordInput = screen.getByLabelText(/Password Personale/i);

      // Inizialmente nessun meter visualizzato
      expect(screen.queryByRole('status')).not.toBeInTheDocument();

      // Password debole
      fireEvent.change(passwordInput, { target: { value: '123' } });
      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByText(/Debole|Débil|Weak/i)).toBeInTheDocument();

      // Password forte
      fireEvent.change(passwordInput, { target: { value: 'Super#Secure2026!' } });
      expect(screen.getByText(/Forte|Fuerte|Strong/i)).toBeInTheDocument();
    });

    it('mostra l\'errore del server e NON crea una sessione locale se le credenziali sono errate', async () => {
      global.fetch = vi.fn(async (url) => {
        const target = String(url);
        if (target.includes('/auth/login')) {
          return { ok: false, status: 401, json: async () => ({ error: 'invalid_credentials', message: 'Invalid credentials.' }) };
        }
        return { ok: true, status: 200, json: async () => ({ authenticated: false, user: null, csrf_token: 'tok' }) };
      });

      renderWithProviders(<Accedi />);

      fireEvent.change(screen.getByLabelText(/Email o ID Matricola|Email Registrata/i), { target: { value: 'rider@ror.it' } });
      fireEvent.change(screen.getByLabelText(/Password Personale/i), { target: { value: 'sbagliata' } });
      fireEvent.click(screen.getByRole('button', { name: /Accedi al Profilo/i }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(/non corrett/i);
      expect(localStorage.getItem('ror-user-profile')).toBeNull();
    });
  });

  describe('Register Page Component', () => {
    it('mostra il meditore di forza password dinamico e lo switch Ricordami', () => {
      renderWithProviders(<Register />);

      const passwordInput = screen.getByLabelText(/^Password/i);
      expect(screen.getByLabelText(/Ricordami su questo dispositivo/i)).toBeInTheDocument();

      // Digita una password debole
      fireEvent.change(passwordInput, { target: { value: 'abc' } });
      expect(screen.getByText(/Debole|Débil|Weak/i)).toBeInTheDocument();

      // Digita una password complessa
      fireEvent.change(passwordInput, { target: { value: 'Rider#Strong99!' } });
      expect(screen.getByText(/Forte|Fuerte|Strong/i)).toBeInTheDocument();
    });
  });
});
