import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from '../../context/AppContext';
import { NotificationsProvider, useNotifications } from '../../context/NotificationsContext';
import { Notifiche } from '../Notifiche';
import { PanoramicaUscite } from '../PanoramicaUscite';
import { PunteggioTotale, buildScoreChart } from '../PunteggioTotale';
import { BikeCataloguePage, BikeHubPage } from '../BikeHub';
import { Altro } from '../Altro';
import { GroupChat } from '../../components/GroupChat';
import { notificationService } from '../../services/notificationService';
import { riderService } from '../../services/riderService';
import { bikeService } from '../../services/bikeService';
import { chatService } from '../../services/chatService';
import { authService } from '../../services/authService';

const PROFILE = { id: 1, username: 'mario', name: 'Mario', language: 'it', roles: [], isAdmin: false };

const wrap = (ui, { entry = '/', path = '*' } = {}) => render(
  <MemoryRouter initialEntries={[entry]}>
    <AppProvider>
      <NotificationsProvider>
        <Routes>
          <Route path={path} element={ui} />
          <Route path="/login" element={<div>pagina login</div>} />
          <Route path="/consegne" element={<div>pagina consegne</div>} />
        </Routes>
      </NotificationsProvider>
    </AppProvider>
  </MemoryRouter>
);

const loggedIn = (profile = PROFILE) => {
  localStorage.setItem('ror-user-profile', JSON.stringify(profile));
  vi.spyOn(authService, 'getSession').mockResolvedValue(profile);
};

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('Notifiche (server)', () => {
  const NOTES = [
    { id: 2, category: 'sicurezza', title: '🚨 SOS da Anna', body: 'apri la mappa', link: '/mappa', isRead: false, createdAt: '2026-09-25T10:00:00' },
    { id: 1, category: 'consegne', title: 'Nuovo ordine: Trattoria', body: 'Via Roma', link: '/consegne', isRead: true, createdAt: '2026-09-25T09:00:00' }
  ];

  it('elenca, filtra, segna come letta ed elimina', async () => {
    loggedIn();
    vi.spyOn(notificationService, 'list').mockResolvedValue({ notifications: NOTES, unreadCount: 1 });
    vi.spyOn(notificationService, 'markRead').mockResolvedValue({ unreadCount: 0 });
    vi.spyOn(notificationService, 'remove').mockResolvedValue({ unreadCount: 0 });
    wrap(<Notifiche />);
    expect(await screen.findByText('🚨 SOS da Anna')).toBeInTheDocument();
    expect(screen.getByText('1 da leggere')).toBeInTheDocument();
    expect(screen.queryByText(/Simulatore Push|MPU-6050|Batteria/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Consegne' }));
    expect(screen.queryByText('🚨 SOS da Anna')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tutti' }));

    fireEvent.click(screen.getByRole('button', { name: 'Segna come letta' }));
    await waitFor(() => expect(notificationService.markRead).toHaveBeenCalledWith(2, true));
    fireEvent.click(screen.getAllByRole('button', { name: 'Elimina notifica' })[1]);
    await waitFor(() => expect(notificationService.remove).toHaveBeenCalledWith(1));
    await waitFor(() => expect(screen.queryByText('Nuovo ordine: Trattoria')).not.toBeInTheDocument());
  });

  it('"Elimina" e "Segna come lette" valgono per la categoria sullo schermo, e l\'eliminazione chiede conferma', async () => {
    // prima "Elimina tutte" con il filtro "Consegne" cancellava anche gli SOS dei gruppi, senza chiedere
    loggedIn();
    vi.spyOn(notificationService, 'list').mockResolvedValue({ notifications: NOTES, unreadCount: 1 });
    vi.spyOn(notificationService, 'markAllRead').mockResolvedValue({ unreadCount: 1 });
    vi.spyOn(notificationService, 'clear').mockResolvedValue({ deleted: 1, unreadCount: 1 });
    wrap(<Notifiche />);
    await screen.findByText('🚨 SOS da Anna');

    fireEvent.click(screen.getByRole('button', { name: 'Consegne' }));
    expect(screen.queryByRole('button', { name: 'Elimina tutte' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Elimina queste' }));
    expect(notificationService.clear).not.toHaveBeenCalled();                 // prima la conferma
    expect(await screen.findByText('Eliminare le notifiche di questa categoria?')).toBeInTheDocument();
    expect(screen.getByText('Verranno eliminate definitivamente: 1.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Elimina' }));
    await waitFor(() => expect(notificationService.clear).toHaveBeenCalledWith('consegne'));
    await waitFor(() => expect(screen.queryByText('Nuovo ordine: Trattoria')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Tutti' }));
    expect(screen.getByText('🚨 SOS da Anna')).toBeInTheDocument();          // l'SOS è rimasto
    fireEvent.click(screen.getByRole('button', { name: 'Segna tutte come lette' }));
    await waitFor(() => expect(notificationService.markAllRead).toHaveBeenCalledWith(null));
  });

  it('il testo della notifica si vede così com\'è, anche con < e > (non è HTML)', async () => {
    loggedIn();
    const note = { ...NOTES[1], body: 'Ritiro: Via Roma 1 <scala B> • Consegna: Corso Italia 2' };
    vi.spyOn(notificationService, 'list').mockResolvedValue({ notifications: [note], unreadCount: 0 });
    wrap(<Notifiche />);
    fireEvent.click(await screen.findByText('Nuovo ordine: Trattoria'));
    // nella lista e, intero, nella finestra che si apre (prima "<scala B>" spariva, letto come un tag HTML)
    await waitFor(() => expect(screen.getAllByText(note.body)).toHaveLength(2));
  });

  it('aprendo una notifica con link si può andare alla pagina', async () => {
    loggedIn();
    vi.spyOn(notificationService, 'list').mockResolvedValue({ notifications: [NOTES[1]], unreadCount: 0 });
    wrap(<Notifiche />);
    fireEvent.click(await screen.findByText('Nuovo ordine: Trattoria'));
    fireEvent.click(await screen.findByRole('button', { name: 'Apri' }));
    expect(await screen.findByText('pagina consegne')).toBeInTheDocument();
  });

  it('le preferenze restano sul dispositivo', async () => {
    loggedIn();
    vi.spyOn(notificationService, 'list').mockResolvedValue({ notifications: [], unreadCount: 0 });
    wrap(<Notifiche />);
    fireEvent.click(await screen.findByRole('button', { name: 'Preferenze' }));
    fireEvent.click(screen.getByLabelText(/Suono per la chat di gruppo/));
    expect(JSON.parse(localStorage.getItem('ror-notif-toggles')).chatSound).toBe(false);
    expect(screen.queryByText(/Risparmio Energetico/)).not.toBeInTheDocument();
  });
});

describe('NotificationsProvider', () => {
  it('mostra il banner solo per le notifiche arrivate dopo l\'apertura', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    loggedIn();
    const list = vi.spyOn(notificationService, 'list')
      .mockResolvedValueOnce({ notifications: [{ id: 5, title: 'Vecchia', category: 'sistema' }], unreadCount: 1 })
      .mockResolvedValue({ notifications: [{ id: 6, title: 'Nuovo ordine: Sushi', body: 'Via Po', category: 'consegne' }], unreadCount: 2 });
    let ctx;
    const Probe = () => { ctx = useNotifications(); return null; };
    render(<MemoryRouter><AppProvider><NotificationsProvider><Probe /></NotificationsProvider></AppProvider></MemoryRouter>);
    await waitFor(() => expect(ctx.unreadCount).toBe(1));
    expect(screen.queryByText('Vecchia')).not.toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(list).toHaveBeenLastCalledWith({ limit: 20, afterId: 5 });
    expect(ctx.unreadCount).toBe(2);
    vi.useRealTimers();
  });
});

describe('Altro', () => {
  it('conteggio reale dei non letti e pannello admin solo per gli admin', async () => {
    loggedIn({ ...PROFILE, isAdmin: true, roles: ['admin'] });
    vi.spyOn(notificationService, 'list').mockResolvedValue({ notifications: [], unreadCount: 4 });
    wrap(<Altro />);
    expect(await screen.findByText('4')).toBeInTheDocument();
    expect(screen.getByText('Pannello amministratore')).toBeInTheDocument();
  });

  it('un rider normale non vede il pannello admin', async () => {
    loggedIn();
    vi.spyOn(notificationService, 'list').mockResolvedValue({ notifications: [], unreadCount: 0 });
    wrap(<Altro />);
    await waitFor(() => expect(notificationService.list).toHaveBeenCalled());
    expect(screen.queryByText('Pannello amministratore')).not.toBeInTheDocument();
  });
});

describe('PanoramicaUscite (guadagni reali)', () => {
  it('mostra i totali del periodo, i giorni e cambia periodo', async () => {
    const getEarnings = vi.spyOn(riderService, 'getEarnings').mockResolvedValue({
      today: '2026-09-25',
      summary: { earnings: 24.5, pay: 20, bonus: 4.5, deliveries: 3, rideDistanceKm: 12.4, rideDurationSec: 3900 },
      days: [{ date: '2026-09-25', deliveries: 3, earnings: 24.5, distanceKm: 12.4, durationSec: 3900, rides: 2 }]
    });
    wrap(<PanoramicaUscite />);
    expect(await screen.findAllByText('€ 24,50')).toHaveLength(2);
    expect(screen.getByText('12.4 km')).toBeInTheDocument();
    expect(screen.getByText('1 h 05 min')).toBeInTheDocument();
    expect(screen.queryByText(/IBAN|480|54 corse/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mese' }));
    await waitFor(() => expect(getEarnings).toHaveBeenLastCalledWith('month'));
  });
});

describe('PunteggioTotale (formula reale)', () => {
  it('mostra il punteggio di oggi, la variazione e la composizione', async () => {
    vi.spyOn(riderService, 'getScore').mockResolvedValue({
      today: '2026-09-25', total: 135, rules: { perKm: 10, perDelivery: 20, perOnTime: 5 },
      days: [
        { date: '2026-09-24', score: 20, distanceKm: 0, deliveries: 1, punctuality: null, safeRiding: null },
        { date: '2026-09-25', score: 115, distanceKm: 7, deliveries: 2, punctuality: 0.5, safeRiding: 1 }
      ]
    });
    wrap(<PunteggioTotale />);
    expect(await screen.findByText('115')).toBeInTheDocument();
    expect(screen.getByText('+95 pts')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.queryByText(/LIVELLO ORO|Blockchain|#12 Milano|MPU-6050/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Come si calcola il punteggio' }));
    expect(await screen.findByText(/punti per ogni consegna completata/)).toBeInTheDocument();
  });

  it('buildScoreChart scala sui punteggi', () => {
    const chart = buildScoreChart([0, 50, 100]);
    expect(chart.points.map((p) => p.cy)).toEqual([90, 53, 15]);
    expect(buildScoreChart([]).points).toEqual([]);
  });
});

describe('Bici (API /api/bikes)', () => {
  const BIKE = {
    code: '013-001', label: 'Tazzoli Community Bike #013-001', model: 'Decathlon Rockrider V0', location: 'Via Tazzoli 13',
    description: 'Memory on two wheels.', inUse: false, isMine: false, history: ['2026: nata'], contactPhone: null, co2FactorKgPerKm: 0.12,
    stats: { rides: 3, distanceKm: 15.2, riders: 2, co2SavedKg: 1.8, lastRideAt: null }
  };

  it('catalogo con statistiche reali', async () => {
    vi.spyOn(bikeService, 'list').mockResolvedValue([BIKE]);
    wrap(<BikeCataloguePage />);
    expect(await screen.findByText('1 QR Bike')).toBeInTheDocument();
    expect(screen.getByText('15.2 km • 3 uscite')).toBeInTheDocument();
  });

  it('scheda pubblica: senza accesso porta al login; con accesso collega la bici', async () => {
    vi.spyOn(bikeService, 'get').mockResolvedValue(BIKE);
    const first = wrap(<BikeHubPage />, { entry: '/bici/013-001', path: '/bici/:bikeId' });
    expect(await screen.findByText('15.2 km')).toBeInTheDocument();
    expect(screen.getByText('1.8 kg')).toBeInTheDocument();
    expect(screen.queryByText(/\+3902000000/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Accedi per usare questa bici' }));
    expect(await screen.findByText('pagina login')).toBeInTheDocument();
    first.unmount();

    loggedIn();
    vi.spyOn(bikeService, 'link').mockResolvedValue({ ...BIKE, isMine: true, inUse: true });
    wrap(<BikeHubPage />, { entry: '/bici/013-001', path: '/bici/:bikeId' });
    fireEvent.click(await screen.findByRole('button', { name: 'Usa questa bici' }));
    await waitFor(() => expect(bikeService.link).toHaveBeenCalledWith('013-001'));
    expect(await screen.findByText(/Collegata al tuo account/)).toBeInTheDocument();
  });

  it('bici inesistente', async () => {
    const error = Object.assign(new Error('Bike not found.'), { status: 404 });
    vi.spyOn(bikeService, 'get').mockRejectedValue(error);
    wrap(<BikeHubPage />, { entry: '/bici/zzz', path: '/bici/:bikeId' });
    expect(await screen.findByText('Bici non trovata.')).toBeInTheDocument();
  });
});

describe('GroupChat con WebSocket', () => {
  let sockets;
  class FakeSocket {
    static OPEN = 1;
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.sent = [];
      sockets.push(this);
      setTimeout(() => { this.readyState = 1; this.onopen && this.onopen(); }, 0);
    }
    send(data) { this.sent.push(JSON.parse(data)); }
    close() { this.readyState = 3; }
    receive(payload) { this.onmessage && this.onmessage({ data: JSON.stringify(payload) }); }
  }

  beforeEach(() => {
    sockets = [];
    vi.stubGlobal('WebSocket', FakeSocket);
    vi.spyOn(chatService, 'history').mockResolvedValue({ messages: [], hasMore: false });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('invia via HTTP anche con il WebSocket connesso; dal WebSocket arrivano i messaggi e il "sta scrivendo"', async () => {
    const send = vi.spyOn(chatService, 'send').mockResolvedValue(
      { id: 10, userId: 1, username: 'mario', kind: 'text', text: 'Ciao!', createdAt: '2026-09-25T10:00:00' });
    wrap(<GroupChat groupId={3} myUserId={1} />);
    expect(await screen.findByText('Nessun messaggio: scrivi il primo!')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('In tempo reale')).toBeInTheDocument());
    const ws = sockets[0];
    expect(ws.url).toMatch(/\/ws\/chat\/3$/);

    fireEvent.change(screen.getByLabelText('Testo del messaggio'), { target: { value: 'Ciao!' } });
    expect(ws.sent).toContainEqual({ type: 'typing' });
    fireEvent.click(screen.getByRole('button', { name: 'Invia' }));
    expect(await screen.findByText('Ciao!')).toBeInTheDocument();
    expect(send).toHaveBeenCalledWith(3, 'Ciao!');
    expect(ws.sent.filter((event) => event.type === 'message')).toEqual([]);

    act(() => {
      // lo stesso messaggio inoltrato dal server a tutti i connessi: una sola bolla
      ws.receive({ type: 'message', message: { id: 10, user_id: 1, username: 'mario', kind: 'text', text: 'Ciao!', created_at: '2026-09-25T10:00:00' } });
      ws.receive({ type: 'typing', user_id: 2, username: 'anna' });
    });
    expect(screen.getAllByText('Ciao!')).toHaveLength(1);
    expect(screen.getByText('anna sta scrivendo...')).toBeInTheDocument();
    act(() => {
      ws.receive({ type: 'message', message: { id: 11, user_id: 2, username: 'anna', kind: 'location', lat: 45.1, lon: 9.2, created_at: '2026-09-25T10:01:00' } });
    });
    expect(screen.getByRole('link', { name: /Posizione condivisa/ })).toHaveAttribute('href', expect.stringContaining('mlat=45.1'));
    expect(screen.queryByText('anna sta scrivendo...')).not.toBeInTheDocument();
  });
});
