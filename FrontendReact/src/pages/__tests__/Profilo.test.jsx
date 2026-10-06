import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '../../context/AppContext';
import { Profilo, isValidInternationalPhone } from '../Profilo';
import { authService } from '../../services/authService';
import { profileService } from '../../services/profileService';

// sessione GPS simulata: ogni test decide se ce n'è una in corso
const tracking = vi.hoisted(() => ({ value: null }));
vi.mock('../../context/RideTrackingContext', () => ({ useRideTracking: () => tracking.value }));

const PROFILE = {
  id: 1,
  username: 'marco_rider',
  email: 'marco@example.com',
  name: 'Marco',
  surname: 'Rossi',
  phone: '+39 348 1234567',
  fiscalCode: 'MNDJNT98E12F205X',
  birthDate: '1998-05-12',
  birthPlace: 'Milano (MI)',
  language: 'it',
  sensorsEnabled: true,
  shareLocationWithGroups: false,
  photo: '/icons/avatar-placeholder.svg',
  roles: [],
  isAdmin: false
};

const renderWithProviders = (ui) => render(
  <MemoryRouter>
    <AppProvider>
      {ui}
    </AppProvider>
  </MemoryRouter>
);

describe('Profilo collegato al backend', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    tracking.value = { ride: { status: 'idle' } };
    localStorage.setItem('ror-user-profile', JSON.stringify(PROFILE));
    vi.spyOn(authService, 'getSession').mockResolvedValue(PROFILE);
    vi.spyOn(profileService, 'getProfile').mockResolvedValue({
      profile: PROFILE,
      stats: { ridesCount: 7, totalDistanceKm: 42.5, totalDurationMin: 135 }
    });
    vi.spyOn(profileService, 'listSosContacts').mockResolvedValue({
      contacts: [{ id: 10, name: 'Maria Verdi', relationship: 'Padre / Madre', phone: '+39 333 9876543', email: null }],
      maxContacts: 5
    });
  });

  it('valida correttamente i formati di numero telefonico internazionale con isValidInternationalPhone', () => {
    expect(isValidInternationalPhone('+39 348 1234567')).toBe(true);
    expect(isValidInternationalPhone('+393481234567')).toBe(true);
    expect(isValidInternationalPhone('+34 612 345 678')).toBe(true);
    expect(isValidInternationalPhone('02 12345678')).toBe(true);

    expect(isValidInternationalPhone('')).toBe(false);
    expect(isValidInternationalPhone('1234')).toBe(false);
    expect(isValidInternationalPhone('abc1234567')).toBe(false);
    expect(isValidInternationalPhone('+39 abc 123')).toBe(false);
  });

  it('mostra i dati reali del rider, le statistiche e il livello calcolato dai km', async () => {
    renderWithProviders(<Profilo />);

    expect(screen.getAllByText(/Marco Rossi/i).length).toBeGreaterThanOrEqual(1);
    expect(await screen.findByText('42.5')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText(/LIV BRONZO • RIDER/i)).toBeInTheDocument();
    expect(screen.getByText('marco_rider')).toBeInTheDocument();
    expect(screen.queryByText(/Kasko Premium h24/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Cambia foto profilo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Carica nuova foto profilo/i)).toBeInTheDocument();
  });

  it('carica i contatti SOS dal server', async () => {
    renderWithProviders(<Profilo />);
    expect(await screen.findByText('Maria Verdi')).toBeInTheDocument();
    expect(profileService.listSosContacts).toHaveBeenCalled();
  });

  it('mostra errore di validazione in tempo reale quando si inserisce un numero SOS errato', async () => {
    renderWithProviders(<Profilo />);
    await screen.findByText('Maria Verdi');

    fireEvent.click(screen.getByText(/\+ Aggiungi/i));

    const nameInput = screen.getByPlaceholderText(/es. Anna Bianchi/i);
    const phoneInput = screen.getByPlaceholderText(/es\. \+39 340 1234567/i);

    fireEvent.change(nameInput, { target: { value: 'Sofia Rossi' } });
    fireEvent.change(phoneInput, { target: { value: '123' } });

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Inserisci un prefisso internazionale valido/i)).toBeInTheDocument();

    fireEvent.change(phoneInput, { target: { value: '+39 340 9876543' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText(/Numero valido ✓/i)).toBeInTheDocument();
  });

  it('salva il nuovo contatto SOS sul server e lo mostra nella lista', async () => {
    const addSpy = vi.spyOn(profileService, 'addSosContact').mockResolvedValue({
      id: 11, name: 'Paolo Neri', relationship: 'Familiare', phone: '+39 347 1122334', email: 'paolo@example.com'
    });
    renderWithProviders(<Profilo />);
    await screen.findByText('Maria Verdi');

    fireEvent.click(screen.getByText(/\+ Aggiungi/i));
    fireEvent.change(screen.getByPlaceholderText(/es. Anna Bianchi/i), { target: { value: 'Paolo Neri' } });
    fireEvent.change(screen.getByPlaceholderText(/es\. \+39 340 1234567/i), { target: { value: '+39 347 1122334' } });
    fireEvent.change(screen.getByPlaceholderText(/es\. marco@email\.com/i), { target: { value: 'paolo@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /Salva Contatto/i }));

    expect(await screen.findByText('Paolo Neri')).toBeInTheDocument();
    expect(addSpy).toHaveBeenCalledWith({
      name: 'Paolo Neri', relationship: 'Familiare', phone: '+39 347 1122334', email: 'paolo@example.com'
    });
  });

  it('modifica i dati di contatto tramite PATCH /api/profile', async () => {
    const updateSpy = vi.spyOn(profileService, 'updateProfile').mockResolvedValue({
      profile: { ...PROFILE, phone: '+39 320 0000000' },
      stats: { ridesCount: 7, totalDistanceKm: 42.5, totalDurationMin: 135 }
    });
    renderWithProviders(<Profilo />);
    await screen.findByText('42.5');

    fireEvent.click(screen.getByRole('button', { name: /^Modifica$/i }));
    fireEvent.change(screen.getByLabelText(/^Telefono$/i), { target: { value: '+39 320 0000000' } });
    fireEvent.click(screen.getByRole('button', { name: /Salva modifiche/i }));

    await waitFor(() => expect(updateSpy).toHaveBeenCalledWith({
      username: 'marco_rider', email: 'marco@example.com', phone_number: '+39 320 0000000'
    }));
    expect(await screen.findByText('+39 320 0000000')).toBeInTheDocument();
  });

  it('con una sessione GPS in corso chiede conferma prima di uscire (il percorso andrebbe perso)', async () => {
    tracking.value = { ride: { status: 'paused' } };
    const logout = vi.spyOn(authService, 'logout').mockResolvedValue({});
    renderWithProviders(<Profilo />);
    await screen.findByText('42.5');

    fireEvent.click(screen.getByRole('button', { name: /Esci dal mio account/i }));
    expect(await screen.findByText('Sessione GPS in corso')).toBeInTheDocument();
    expect(screen.getByText(/non verrà salvato/)).toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Esci senza salvare' }));
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
  });

  it('senza sessione GPS esce subito', async () => {
    const logout = vi.spyOn(authService, 'logout').mockResolvedValue({});
    renderWithProviders(<Profilo />);
    await screen.findByText('42.5');
    fireEvent.click(screen.getByRole('button', { name: /Esci dal mio account/i }));
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Sessione GPS in corso')).not.toBeInTheDocument();
  });
});
