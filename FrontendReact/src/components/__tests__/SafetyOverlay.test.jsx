import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AppProvider } from '../../context/AppContext';
import { authService } from '../../services/authService';

// stato della sessione di guida deciso dal test
const tracking = vi.hoisted(() => ({ value: null }));
vi.mock('../../context/RideTrackingContext', () => ({ useRideTracking: () => tracking.value }));

import { SafetyOverlay } from '../SafetyOverlay';

const PROFILE = { id: 1, username: 'me', language: 'it', roles: [] };
const actions = () => ({
  fallAlert: null, cancelFall: vi.fn(), confirmFall: vi.fn(),
  resolveSos: vi.fn(), dismissSos: vi.fn(), triggerSos: vi.fn()
});
const renderOverlay = () => render(<AppProvider><SafetyOverlay /></AppProvider>);

describe('SafetyOverlay — SOS non ancora arrivato', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    localStorage.setItem('ror-user-profile', JSON.stringify(PROFILE));
    vi.spyOn(authService, 'getSession').mockResolvedValue(PROFILE);
  });

  it('dice che l\'app riprova da sola, quanti tentativi ha fatto e lascia annullare', () => {
    tracking.value = { ...actions(), sos: { status: 'error', source: 'fall', retrying: true, attempt: 2, error: 'offline' } };
    renderOverlay();
    expect(screen.getByRole('heading', { name: 'SOS non ancora inviato' })).toBeTruthy();
    expect(screen.getByText(/riprova da solo/)).toBeTruthy();
    expect(screen.getByText('Tentativi senza risposta: 2')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Chiama 112' }).getAttribute('href')).toBe('tel:112');

    fireEvent.click(screen.getByRole('button', { name: 'Riprova ora' }));
    expect(tracking.value.triggerSos).toHaveBeenCalledWith('fall');
    fireEvent.click(screen.getByRole('button', { name: 'Sto bene: non inviarlo' }));
    expect(tracking.value.dismissSos).toHaveBeenCalled();
  });

  it('durante un nuovo tentativo resta sulla stessa schermata invece di lampeggiare', () => {
    tracking.value = { ...actions(), sos: { status: 'sending', source: 'fall', attempt: 3 } };
    renderOverlay();
    expect(screen.getByRole('heading', { name: 'SOS non ancora inviato' })).toBeTruthy();
    expect(screen.getByText('Nuovo tentativo in corso...')).toBeTruthy();
  });

  it('il primo invio e un rifiuto definitivo del server mostrano le schermate di sempre', () => {
    tracking.value = { ...actions(), sos: { status: 'sending', source: 'manual', attempt: 1 } };
    const { unmount } = renderOverlay();
    expect(screen.getByRole('heading', { name: 'Invio SOS in corso...' })).toBeTruthy();
    unmount();

    tracking.value = { ...actions(), sos: { status: 'error', source: 'manual', retrying: false, error: 'Dati non validi' } };
    renderOverlay();
    expect(screen.getByRole('heading', { name: 'SOS non inviato' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Chiudi' })).toBeTruthy();
  });
});
