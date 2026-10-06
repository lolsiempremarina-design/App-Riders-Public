import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from '../../context/AppContext';
import { GruppoChat } from '../GruppoChat';
import { groupService } from '../../services/groupService';
import { authService } from '../../services/authService';
import { ApiError } from '../../services/api';
import { chatService } from '../../services/chatService';

const PROFILE = { id: 1, username: 'owner_user', name: 'Owner', surname: 'User', language: 'it', sensorsEnabled: true, shareLocationWithGroups: true, roles: [] };

const group = (overrides = {}) => ({
  id: 3,
  name: 'Rider Navigli',
  description: 'Turno serale',
  code: 'abc-defg-hij',
  myRole: 'owner',
  memberCount: 3,
  sharingCount: 1,
  canManage: true,
  inviteToken: 'tok-123',
  members: [
    { userId: 1, username: 'owner_user', role: 'owner', isMe: true, isSharingLocation: false, avatar: null },
    { userId: 2, username: 'second_user', role: 'admin', isMe: false, isSharingLocation: true, avatar: null },
    { userId: 3, username: 'third_user', role: 'member', isMe: false, isSharingLocation: false, avatar: null }
  ],
  ...overrides
});

const renderPage = (entry = '/gruppo-chat?id=3') => render(
  <MemoryRouter initialEntries={[entry]}>
    <AppProvider>
      <Routes>
        <Route path="/gruppo-chat" element={<GruppoChat />} />
        <Route path="/gruppi" element={<div>elenco gruppi</div>} />
      </Routes>
    </AppProvider>
  </MemoryRouter>
);

describe('Pagina del gruppo (dati reali /api/groups/<id>)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    localStorage.setItem('ror-user-profile', JSON.stringify(PROFILE));
    vi.spyOn(authService, 'getSession').mockResolvedValue(PROFILE);
    vi.spyOn(groupService, 'get').mockResolvedValue(group());
    vi.spyOn(chatService, 'history').mockResolvedValue({
      messages: [{ id: 1, userId: 2, username: 'second_user', kind: 'text', text: 'Ciao squadra', createdAt: '2026-09-25T10:00:00' }],
      hasMore: false
    });
  });

  it('mostra nome, membri reali, ruoli e codice del gruppo', async () => {
    renderPage();
    expect(await screen.findByText('Rider Navigli')).toBeInTheDocument();
    expect(groupService.get).toHaveBeenCalledWith('3');
    expect(screen.getByText('abc-defg-hij')).toBeInTheDocument();
    expect(screen.getByText('owner_user (tu)')).toBeInTheDocument();
    expect(screen.getByText('second_user')).toBeInTheDocument();
    expect(screen.getByText(/posizione condivisa/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Vedi sulla mappa' })).toHaveAttribute('href', '/mappa?gruppo=3');
  });

  it('chat reale: storico dal server e invio (via HTTP se il WebSocket non è connesso)', async () => {
    vi.spyOn(chatService, 'send').mockResolvedValue({ id: 2, userId: 1, username: 'owner_user', kind: 'text', text: 'Arrivo!', createdAt: '2026-09-25T10:01:00' });
    renderPage();
    expect(await screen.findByText('Ciao squadra')).toBeInTheDocument();
    expect(chatService.history).toHaveBeenCalledWith(3);
    fireEvent.change(screen.getByLabelText('Testo del messaggio'), { target: { value: '  Arrivo!  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Invia' }));
    await waitFor(() => expect(chatService.send).toHaveBeenCalledWith(3, 'Arrivo!'));
    expect(await screen.findByText('Arrivo!')).toBeInTheDocument();
    expect(screen.queryByText(/sta scrivendo/)).not.toBeInTheDocument();
  });

  it('il proprietario cambia ruoli e gestisce il link d\'invito', async () => {
    vi.spyOn(groupService, 'setMemberRole').mockResolvedValue({});
    vi.spyOn(groupService, 'revokeInvite').mockResolvedValue(group({ inviteToken: null }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Rendi admin' }));
    await waitFor(() => expect(groupService.setMemberRole).toHaveBeenCalledWith(3, 3, 'admin'));

    fireEvent.click(screen.getByRole('button', { name: 'Disattiva link' }));
    await waitFor(() => expect(groupService.revokeInvite).toHaveBeenCalledWith(3));
    expect(await screen.findByRole('button', { name: "Crea link d'invito" })).toBeInTheDocument();
  });

  it('un membro semplice non vede i comandi di gestione', async () => {
    groupService.get.mockResolvedValue(group({
      myRole: 'member', canManage: false, inviteToken: null,
      members: group().members.map((m) => ({ ...m, isMe: m.userId === 3 }))
    }));
    renderPage();
    await screen.findByText('Rider Navigli');
    expect(screen.queryByRole('button', { name: 'Nuovo codice' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rendi/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rimuovi/ })).not.toBeInTheDocument();
  });

  it('condivide la posizione reale del dispositivo', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: (ok) => ok({ coords: { latitude: 45.46, longitude: 9.19 } }) }
    });
    vi.spyOn(groupService, 'sharePosition').mockResolvedValue({ success: true });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Condividi la mia posizione ora' }));
    await waitFor(() => expect(groupService.sharePosition).toHaveBeenCalledWith(45.46, 9.19));
    delete navigator.geolocation;
  });

  it('esce dal gruppo dopo la conferma', async () => {
    vi.spyOn(groupService, 'removeMember').mockResolvedValue({ success: true, groupDeleted: false });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Esci dal gruppo' }));
    expect(await screen.findByText(/La proprietà del gruppo passerà/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Esci dal gruppo' }).at(-1));
    await waitFor(() => expect(groupService.removeMember).toHaveBeenCalledWith(3, 1));
    expect(await screen.findByText('elenco gruppi')).toBeInTheDocument();
  });

  it('gruppo inesistente o di altri: messaggio chiaro', async () => {
    groupService.get.mockRejectedValue(new ApiError('Group not found.', 404, { error: 'not_found' }));
    renderPage('/gruppo-chat?id=99');
    expect(await screen.findByText('Gruppo non trovato o non ne fai parte.')).toBeInTheDocument();
  });
});
