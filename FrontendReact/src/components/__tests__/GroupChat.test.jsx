import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AppProvider, useApp } from '../../context/AppContext';
import { authService } from '../../services/authService';
import { chatService } from '../../services/chatService';

// WebSocket simulato: il test decide quando è connesso e quali eventi arrivano
const ws = vi.hoisted(() => ({ connected: false, onMessage: null, sent: [] }));
vi.mock('../../hooks/useWebSocket', () => ({
  useWebSocket: (_url, options) => {
    ws.onMessage = options?.onMessage;
    return {
      isConnected: ws.connected,
      connectionStatus: ws.connected ? 'connected' : 'reconnecting',
      sendMessage: (data) => { ws.sent.push(data); return ws.connected; }
    };
  }
}));

import { GroupChat } from '../GroupChat';

const PROFILE = { id: 1, username: 'me', language: 'it', roles: [] };
const msg = (id, text, userId = 2) => ({ id, groupId: 3, userId, username: userId === 1 ? 'me' : 'anna', kind: 'text', text, createdAt: '2026-09-25T10:00:00' });

const renderChat = () => render(<AppProvider><GroupChat groupId={3} myUserId={1} /></AppProvider>);

describe('GroupChat (WebSocket /ws/chat/<id>)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    ws.connected = false;
    ws.onMessage = null;
    ws.sent = [];
    localStorage.setItem('ror-user-profile', JSON.stringify(PROFILE));
    vi.spyOn(authService, 'getSession').mockResolvedValue(PROFILE);
  });

  it('aggiunge i messaggi ricevuti in tempo reale senza duplicati', async () => {
    ws.connected = true;
    vi.spyOn(chatService, 'history').mockResolvedValue({ messages: [msg(1, 'Ciao')], hasMore: false });
    renderChat();
    expect(await screen.findByText('Ciao')).toBeInTheDocument();

    const event = { type: 'message', message: { id: 2, group_id: 3, user_id: 2, username: 'anna', kind: 'text', text: 'Arrivo', created_at: '2026-09-25T10:01:00' } };
    act(() => { ws.onMessage(event); ws.onMessage(event); });
    expect(await screen.findByText('Arrivo')).toBeInTheDocument();
    expect(screen.getAllByText('Arrivo')).toHaveLength(1);
  });

  it('a ogni "ready" del server ricarica lo storico: nessun messaggio perso mentre il WebSocket si apriva', async () => {
    // il browser vede il WebSocket aperto prima che il server riceva i messaggi del gruppo: un messaggio scritto in
    // quell'attimo non era né nello storico né nel WebSocket (un e2e falliva ogni tanto per questo)
    ws.connected = true;
    const history = vi.spyOn(chatService, 'history')
      .mockResolvedValueOnce({ messages: [msg(1, 'Ciao')], hasMore: false })
      .mockResolvedValueOnce({ messages: [msg(1, 'Ciao'), msg(2, "Scritto mentre la chat si apriva")], hasMore: false })
      .mockResolvedValueOnce({ messages: [msg(1, 'Ciao'), msg(2, "Scritto mentre la chat si apriva"), msg(3, 'Scritto durante la disconnessione')], hasMore: false });
    renderChat();
    expect(await screen.findByText('Ciao')).toBeInTheDocument();

    act(() => { ws.onMessage({ type: 'ready' }); });
    expect(await screen.findByText('Scritto mentre la chat si apriva')).toBeInTheDocument();

    // riconnessione: di nuovo "ready", di nuovo lo storico
    act(() => { ws.onMessage({ type: 'ready' }); });
    expect(await screen.findByText('Scritto durante la disconnessione')).toBeInTheDocument();
    expect(history).toHaveBeenCalledTimes(3);
    expect(screen.getAllByText('Ciao')).toHaveLength(1);
    expect(screen.getAllByText('Scritto mentre la chat si apriva')).toHaveLength(1);
  });

  it('un messaggio arrivato dal WebSocket prima dello storico resta (prima lo storico lo sostituiva)', async () => {
    ws.connected = true;
    let resolveHistory;
    vi.spyOn(chatService, 'history').mockReturnValue(new Promise((resolve) => { resolveHistory = resolve; }));
    renderChat();
    await waitFor(() => expect(ws.onMessage).toBeTypeOf('function'));

    act(() => { ws.onMessage({ type: 'message', message: { id: 2, group_id: 3, user_id: 2, username: 'anna', kind: 'text', text: 'Arrivo', created_at: '2026-09-25T10:01:00' } }); });
    await act(async () => { resolveHistory({ messages: [msg(1, 'Ciao')], hasMore: false }); });

    expect(await screen.findByText('Ciao')).toBeInTheDocument();
    expect(screen.getByText('Arrivo')).toBeInTheDocument();
    const texts = [...document.querySelectorAll('.group-chat-messages > div')].map((el) => el.textContent);
    expect(texts[0]).toContain('Ciao'); // in ordine
  });

  it('avvisa nella lingua dell\'app se il server ti ha tolto dal gruppo', async () => {
    ws.connected = true;
    vi.spyOn(chatService, 'history').mockResolvedValue({ messages: [], hasMore: false });
    const ToastProbe = () => {
      const { toast } = useApp();
      return toast?.isOpen ? <p>{toast.message}</p> : null;
    };
    render(<AppProvider><GroupChat groupId={3} myUserId={1} /><ToastProbe /></AppProvider>);
    await waitFor(() => expect(ws.onMessage).toBeTypeOf('function'));

    act(() => { ws.onMessage({ type: 'error', code: 'not_a_member', message: 'You are no longer a member of this group.' }); });
    expect(await screen.findByText('Non fai più parte di questo gruppo.')).toBeInTheDocument();
    act(() => { ws.onMessage({ type: 'error', code: 'too_many_connections', message: 'At most 5 chats can be open at the same time.' }); });
    expect(await screen.findByText(/Hai troppe chat aperte/)).toBeInTheDocument();
  });

  it('invia via HTTP anche con il WebSocket connesso: conferma del server e messaggio mostrato una volta', async () => {
    // un WebSocket "connesso" può essere morto da 30 s (cambio di rete): un messaggio scritto lì spariva senza avviso
    ws.connected = true;
    vi.spyOn(chatService, 'history').mockResolvedValue({ messages: [], hasMore: false });
    const send = vi.spyOn(chatService, 'send').mockResolvedValue(msg(7, 'Sono in piazza', 1));
    renderChat();
    const input = await screen.findByLabelText('Testo del messaggio');

    fireEvent.change(input, { target: { value: 'Sono in piazza' } });
    fireEvent.click(screen.getByRole('button', { name: 'Invia' }));

    expect(await screen.findByText('Sono in piazza')).toBeInTheDocument();
    expect(send).toHaveBeenCalledWith(3, 'Sono in piazza');
    expect(ws.sent.filter((data) => data?.type === 'message')).toEqual([]);
    expect(input).toHaveValue('');
    // lo stesso messaggio arriva anche dal WebSocket: nessun doppione
    act(() => { ws.onMessage({ type: 'message', message: { id: 7, group_id: 3, user_id: 1, username: 'me', kind: 'text', text: 'Sono in piazza', created_at: '2026-09-25T10:00:00' } }); });
    expect(screen.getAllByText('Sono in piazza')).toHaveLength(1);
  });

  it("se l'invio non riesce il testo resta nella casella e compare l'errore", async () => {
    ws.connected = true;
    vi.spyOn(chatService, 'history').mockResolvedValue({ messages: [], hasMore: false });
    vi.spyOn(chatService, 'send').mockRejectedValue(new Error('Impossibile contattare il server.'));
    const ToastProbe = () => {
      const { toast } = useApp();
      return toast?.isOpen ? <p>{toast.message}</p> : null;
    };
    render(<AppProvider><GroupChat groupId={3} myUserId={1} /><ToastProbe /></AppProvider>);
    const input = await screen.findByLabelText('Testo del messaggio');

    fireEvent.change(input, { target: { value: 'Arrivo tra 5 minuti' } });
    fireEvent.click(screen.getByRole('button', { name: 'Invia' }));

    expect(await screen.findByText('Impossibile contattare il server.')).toBeInTheDocument();
    expect(input).toHaveValue('Arrivo tra 5 minuti');
  });
});
