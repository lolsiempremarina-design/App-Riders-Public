import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '../../context/AppContext';
import { Mappa } from '../Mappa';

const renderWithProviders = (ui, entry = '/mappa') => render(
  <MemoryRouter initialEntries={[entry]}>
    <AppProvider>{ui}</AppProvider>
  </MemoryRouter>
);

describe('Mappa - livelli reali e tracciamento GPS', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(global.navigator, 'geolocation', {
      value: { getCurrentPosition: vi.fn(), watchPosition: vi.fn().mockReturnValue(101), clearWatch: vi.fn() },
      configurable: true,
      writable: true
    });
  });

  it('mostra ricerca, livelli del backend (senza ristoranti inventati) e pulsante GPS', () => {
    renderWithProviders(<Mappa />);
    expect(screen.getByPlaceholderText('Cerca un luogo o indirizzo...')).toBeInTheDocument();
    ['Parcheggi bici', 'Fontanelle', 'Bagni', 'Ciclofficine', 'Gruppo', 'Modalità Seguimi'].forEach((label) => {
      expect(screen.getByRole('button', { name: new RegExp(label) })).toBeInTheDocument();
    });
    expect(screen.queryByText(/Partner Food/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Trova la mia posizione GPS')).toBeInTheDocument();
  });

  it('attiva e disattiva i livelli con i chip', () => {
    renderWithProviders(<Mappa />);
    const parkings = screen.getByRole('button', { name: /Parcheggi bici/ });
    const fountains = screen.getByRole('button', { name: /Fontanelle/ });
    expect(parkings).toHaveClass('active');
    expect(fountains).not.toHaveClass('active');
    fireEvent.click(parkings);
    fireEvent.click(fountains);
    expect(parkings).not.toHaveClass('active');
    expect(fountains).toHaveClass('active');
    expect(fountains).toHaveAttribute('aria-pressed', 'true');
  });

  it('attiva e disattiva la modalità Seguimi', () => {
    renderWithProviders(<Mappa />);
    fireEvent.click(screen.getByRole('button', { name: /Modalità Seguimi/i }));
    expect(navigator.geolocation.watchPosition).toHaveBeenCalled();
    const activeBtn = screen.getByRole('button', { name: /Seguimi Attivo/i });
    expect(activeBtn).toHaveClass('active');
    fireEvent.click(activeBtn);
    expect(navigator.geolocation.clearWatch).toHaveBeenCalledWith(101);
  });

  it('non inserisce un marcatore "Tu sei qui" finto prima di avere la posizione', () => {
    renderWithProviders(<Mappa />);
    expect(screen.queryByText('Tu sei qui')).not.toBeInTheDocument();
  });
});
