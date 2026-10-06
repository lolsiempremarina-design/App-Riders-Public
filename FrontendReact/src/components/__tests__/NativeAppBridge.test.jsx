import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// App Android finta: plugin di Capacitor con ascoltatori registrati a mano
const cap = vi.hoisted(() => ({ app: {}, push: {} }));
vi.mock('@capacitor/app', () => ({
  App: {
    getLaunchUrl: vi.fn(async () => null),
    minimizeApp: vi.fn(),
    addListener: vi.fn(async (event, cb) => { cap.app[event] = cb; return { remove: vi.fn() }; })
  }
}));
vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: { addListener: vi.fn(async (event, cb) => { cap.push[event] = cb; return { remove: vi.fn() }; }) }
}));
vi.mock('../../native/platform', () => ({ isNativeApp: () => true }));
vi.mock('../../native/push', () => ({
  createChannels: vi.fn(async () => {}),
  notificationPermissionGranted: vi.fn(async () => true),
  pushLink: () => '/notifiche',
  registerForPush: vi.fn(async () => ({ status: 'enabled' }))
}));

import { AppProvider, useApp } from '../../context/AppContext';
import { NativeAppBridge } from '../NativeAppBridge';
import { authService } from '../../services/authService';
import { isPushActive, REFRESH_EVENT, setPushActive } from '../../native/pushState';
import { notificationPermissionGranted, registerForPush } from '../../native/push';

const PROFILE = { id: 7, username: 'rider', name: 'Mario', language: 'it', sensorsEnabled: true, roles: [] };
let appCtx;
const Probe = () => { appCtx = useApp(); return null; };

describe('NativeAppBridge — push attive e aggiornamenti', () => {
  let refreshes;
  const onRefresh = (event) => refreshes.push(event.detail.category);

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('ror-user-profile', JSON.stringify(PROFILE));
    vi.spyOn(authService, 'getSession').mockResolvedValue(PROFILE);
    vi.spyOn(authService, 'logout').mockResolvedValue(null);
    refreshes = [];
    window.addEventListener(REFRESH_EVENT, onRefresh);
  });

  afterEach(() => {
    window.removeEventListener(REFRESH_EVENT, onRefresh);
    setPushActive(false);
    vi.clearAllMocks();
  });

  const renderBridge = () => render(
    <MemoryRouter>
      <AppProvider>
        <Probe />
        <NativeAppBridge />
      </AppProvider>
    </MemoryRouter>
  );

  it('dopo il login con le push registrate i controlli diventano radi; al logout tornano frequenti', async () => {
    renderBridge();
    await waitFor(() => expect(isPushActive()).toBe(true));
    expect(registerForPush).toHaveBeenCalled();
    await act(async () => { appCtx.logoutUser(); });
    expect(isPushActive()).toBe(false);
  });

  it('push negate o Firebase non configurato sul server: controlli frequenti', async () => {
    registerForPush.mockResolvedValueOnce({ status: 'server_disabled' });
    renderBridge();
    await waitFor(() => expect(registerForPush).toHaveBeenCalled());
    await act(async () => {});
    expect(isPushActive()).toBe(false);
  });

  it('push ricevuta con l\'app aperta → aggiornamento della sua categoria; ritorno in primo piano → tutto', async () => {
    renderBridge();
    await waitFor(() => expect(cap.push.pushNotificationReceived).toBeTypeOf('function'));
    act(() => cap.push.pushNotificationReceived({ title: 'Nuovo ordine', data: { category: 'consegne', link: '/consegne' } }));
    expect(refreshes).toEqual(['consegne']);

    await waitFor(() => expect(isPushActive()).toBe(true));
    notificationPermissionGranted.mockResolvedValueOnce(false); // permesso tolto dalle impostazioni di Android
    await act(async () => { cap.app.resume(); });
    expect(refreshes).toEqual(['consegne', null]);
    expect(isPushActive()).toBe(false);
  });
});
