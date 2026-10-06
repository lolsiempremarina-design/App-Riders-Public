import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '../../context/AppContext';
import { Consegne } from '../Consegne';
import { orderService } from '../../services/orderService';
import { ApiError } from '../../services/api';
import { requestRefresh, setPushActive } from '../../native/pushState';

const offer = (overrides = {}) => ({
  id: 7, restaurant: 'Trattoria Verdi', pickupAddress: 'Via Roma 1', deliveryAddress: 'Via Po 9',
  items: '2x Pizza', distanceKm: 2.4, pay: 6.5, bonus: 1.5, total: 8, status: 'available',
  secondsLeft: 125, dueAt: '2026-09-25T13:45:00', ...overrides
});

const renderPage = () => render(
  <MemoryRouter>
    <AppProvider>
      <Consegne />
    </AppProvider>
  </MemoryRouter>
);

describe('Consegne con ordini reali (/api/orders)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    vi.spyOn(orderService, 'getAvailableOrders').mockResolvedValue([offer()]);
    vi.spyOn(orderService, 'getActiveOrder').mockResolvedValue(null);
    vi.spyOn(orderService, 'getCompletedOrders').mockResolvedValue({
      orders: [{ id: 3, restaurant: 'Sushi Kyo', deliveryAddress: 'Via Tortona 2', total: 9.5, deliveredAt: '2026-09-25T12:10:00', onTime: true }],
      summary: { deliveries: 1, earnings: 9.5, onTimeRate: 1 }
    });
  });

  it('mostra lo scheletro durante il caricamento, poi i dati reali di oggi senza valori inventati', async () => {
    renderPage();
    expect(screen.getByTestId('order-card-skeleton-group')).toBeInTheDocument();
    expect(await screen.findByText('Trattoria Verdi')).toBeInTheDocument();
    expect(screen.getByText('€9.50')).toBeInTheDocument();          // guadagni di oggi
    expect(screen.getByText('100%')).toBeInTheDocument();           // puntualità reale
    expect(screen.getByText('Accetta entro 3 min')).toBeInTheDocument();
    expect(screen.getByText('Consegna entro le 13:45')).toBeInTheDocument();
    expect(screen.queryByText(/4\.95|Rating|Milano Centro/)).not.toBeInTheDocument();
    expect(orderService.getCompletedOrders).toHaveBeenCalledWith('today');
  });

  it('accetta, conferma ritiro e consegna aggiornando i dati dal server', async () => {
    const accepted = { ...offer(), status: 'accepted' };
    vi.spyOn(orderService, 'acceptOrder').mockResolvedValue(accepted);
    vi.spyOn(orderService, 'updateOrderStatus')
      .mockResolvedValueOnce({ ...accepted, status: 'picked_up' })
      .mockResolvedValueOnce({ ...accepted, status: 'delivered', onTime: true });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Accetta ordine' }));
    await waitFor(() => expect(orderService.acceptOrder).toHaveBeenCalledWith(7));
    expect(await screen.findByText('Fase 1 di 2 • Ritiro')).toBeInTheDocument();
    expect(screen.getByText('Via Roma 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Conferma ritiro' }));
    expect(await screen.findByText('Fase 2 di 2 • Consegna')).toBeInTheDocument();
    expect(orderService.updateOrderStatus).toHaveBeenCalledWith(7, 'picked_up');

    fireEvent.click(screen.getByRole('button', { name: 'Conferma consegna' }));
    await waitFor(() => expect(orderService.updateOrderStatus).toHaveBeenLastCalledWith(7, 'delivered'));
    expect(await screen.findByText('Consegna completata ✅')).toBeInTheDocument();
  });

  it('il riepilogo della consegna mostra il nome del locale com\'è, anche con < e > (non è HTML)', async () => {
    const accepted = offer({ restaurant: 'Pizzeria <Da Mario>', status: 'picked_up' });
    vi.spyOn(orderService, 'getAvailableOrders').mockResolvedValue([]);
    vi.spyOn(orderService, 'getActiveOrder').mockResolvedValue(accepted);
    vi.spyOn(orderService, 'updateOrderStatus').mockResolvedValue({ ...accepted, status: 'delivered', onTime: false });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /In Corso/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Conferma consegna' }));
    expect(await screen.findByText('Consegna completata ✅')).toBeInTheDocument();
    expect(screen.getByText('Pizzeria <Da Mario>', { selector: '.modal-body strong' })).toBeInTheDocument();
    expect(screen.getByText(/Consegnata oltre l'orario promesso/)).toBeInTheDocument();
  });

  it('se un altro rider ha preso l\'ordine lo dice e ricarica', async () => {
    vi.spyOn(orderService, 'acceptOrder').mockRejectedValue(new ApiError('taken', 409, { error: 'order_unavailable' }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Accetta ordine' }));
    expect(await screen.findByText(/non più disponibile/)).toBeInTheDocument();
    await waitFor(() => expect(orderService.getAvailableOrders).toHaveBeenCalledTimes(2));
  });

  it('permette di rinunciare prima del ritiro', async () => {
    orderService.getActiveOrder.mockResolvedValue({ ...offer(), status: 'accepted' });
    vi.spyOn(orderService, 'updateOrderStatus').mockResolvedValue({ ...offer(), status: 'available' });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /In Corso/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Rinuncia' }));
    fireEvent.click((await screen.findAllByRole('button', { name: 'Rinuncia' })).at(-1)); // conferma
    await waitFor(() => expect(orderService.updateOrderStatus).toHaveBeenCalledWith(7, 'released'));
  });

  it('stato vuoto onesto e scheda completate', async () => {
    orderService.getAvailableOrders.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText('Nessun ordine disponibile')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Completate/ }));
    expect(screen.getByText('Sushi Kyo')).toBeInTheDocument();
    expect(screen.getByText(/12:10 • puntuale/)).toBeInTheDocument();
  });

  it('mostra un errore con Riprova se il server non risponde', async () => {
    orderService.getAvailableOrders.mockRejectedValueOnce(new Error('offline'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('offline');
    fireEvent.click(screen.getByRole('button', { name: 'Riprova' }));
    expect(await screen.findByText('Trattoria Verdi')).toBeInTheDocument();
  });

  it('ordini ricaricati ogni 20 s; nell\'app con le push ogni 60 s e subito con una push di consegne', async () => {
    vi.useFakeTimers();
    try {
      renderPage();
      const run = async (ms) => { await act(async () => { vi.advanceTimersByTime(ms); }); };
      await run(0);
      expect(orderService.getAvailableOrders).toHaveBeenCalledTimes(1);
      await run(20000);
      expect(orderService.getAvailableOrders).toHaveBeenCalledTimes(2);

      await act(async () => { setPushActive(true); });
      const loads = orderService.getAvailableOrders.mock.calls.length;
      await run(40000);
      expect(orderService.getAvailableOrders).toHaveBeenCalledTimes(loads);
      await run(20000);
      expect(orderService.getAvailableOrders).toHaveBeenCalledTimes(loads + 1);
      await act(async () => { requestRefresh('gruppi'); });
      expect(orderService.getAvailableOrders).toHaveBeenCalledTimes(loads + 1);
      await act(async () => { requestRefresh('consegne'); }); // push "Nuovo ordine" con l'app aperta
      expect(orderService.getAvailableOrders).toHaveBeenCalledTimes(loads + 2);
    } finally {
      setPushActive(false);
      vi.useRealTimers();
    }
  });
});
