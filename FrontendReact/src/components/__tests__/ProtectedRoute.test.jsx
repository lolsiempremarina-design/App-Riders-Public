import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from '../ProtectedRoute';
import * as AppContextModule from '../../context/AppContext';

describe('ProtectedRoute component', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  const renderWithRouter = (initialRoute = '/protetta') => {
    return render(
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route path="/login" element={<div>Pagina di Login</div>} />
          <Route
            path="/protetta"
            element={
              <ProtectedRoute>
                <div>Contenuto Privato Rider</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );
  };

  it('reindirizza a /login quando l\'utente non è autenticato (nessun profilo né token)', () => {
    vi.spyOn(AppContextModule, 'useApp').mockReturnValue({
      userProfile: null
    });

    renderWithRouter();

    expect(screen.getByText('Pagina di Login')).toBeInTheDocument();
    expect(screen.queryByText('Contenuto Privato Rider')).not.toBeInTheDocument();
  });

  it('consente l\'accesso al contenuto protetto se userProfile è presente', () => {
    vi.spyOn(AppContextModule, 'useApp').mockReturnValue({
      userProfile: { name: 'Marco', surname: 'Rossi' }
    });

    renderWithRouter();

    expect(screen.getByText('Contenuto Privato Rider')).toBeInTheDocument();
    expect(screen.queryByText('Pagina di Login')).not.toBeInTheDocument();
  });

  it('NON concede l\'accesso con un vecchio token in localStorage: decide solo la sessione del server', () => {
    vi.spyOn(AppContextModule, 'useApp').mockReturnValue({
      userProfile: null,
      authStatus: 'anonymous'
    });
    localStorage.setItem('ror-auth-token', 'mock-jwt-token-xyz');

    renderWithRouter();

    expect(screen.getByText('Pagina di Login')).toBeInTheDocument();
    expect(screen.queryByText('Contenuto Privato Rider')).not.toBeInTheDocument();
  });

  it('mostra un caricamento mentre verifica la sessione con il server', () => {
    vi.spyOn(AppContextModule, 'useApp').mockReturnValue({
      userProfile: null,
      authStatus: 'checking'
    });

    const { container } = renderWithRouter();

    expect(container.querySelector('.page-skeleton-loader')).toBeInTheDocument();
    expect(screen.queryByText('Pagina di Login')).not.toBeInTheDocument();
    expect(screen.queryByText('Contenuto Privato Rider')).not.toBeInTheDocument();
  });
});
