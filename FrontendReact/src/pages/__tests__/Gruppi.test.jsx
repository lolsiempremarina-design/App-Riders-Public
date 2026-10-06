import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AppProvider } from '../../context/AppContext';
import { Gruppi } from '../Gruppi';
import { groupService } from '../../services/groupService';
import { ApiError } from '../../services/api';

const GROUPS = [
  { id: 3, name: 'Rider Navigli', description: 'Turno serale', code: 'abc-defg-hij', myRole: 'owner', memberCount: 4, sharingCount: 2 },
  { id: 8, name: 'Porta Romana', description: null, code: 'xyz-abcd-efg', myRole: 'member', memberCount: 1, sharingCount: 0 }
];

const GroupProbe = () => {
  const location = useLocation();
  return <div>pagina gruppo {location.search}</div>;
};

const renderPage = (entry = '/gruppi') => render(
  <MemoryRouter initialEntries={[entry]}>
    <AppProvider>
      <Routes>
        <Route path="/gruppi" element={<Gruppi />} />
        <Route path="/gruppo-chat" element={<GroupProbe />} />
      </Routes>
    </AppProvider>
  </MemoryRouter>
);

describe('Gruppi (dati reali /api/groups)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.spyOn(groupService, 'list').mockResolvedValue(GROUPS);
  });

  it('elenca i gruppi reali con membri e posizioni condivise, senza link WhatsApp inventati', async () => {
    renderPage();
    expect(await screen.findByText('Rider Navigli')).toBeInTheDocument();
    expect(screen.getByText('Porta Romana')).toBeInTheDocument();
    expect(screen.getByText('2 in mappa ora')).toBeInTheDocument();
    expect(screen.getByText(/1 membro/)).toBeInTheDocument();
    expect(screen.getByText('Membro')).toBeInTheDocument();
    expect(screen.queryByLabelText(/WhatsApp/i)).not.toBeInTheDocument();
  });

  it('filtra con la ricerca e apre il gruppo', async () => {
    renderPage();
    fireEvent.change(await screen.findByPlaceholderText('Cerca tra i tuoi gruppi...'), { target: { value: 'romana' } });
    expect(screen.queryByText('Rider Navigli')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Porta Romana'));
    expect(screen.getByText('pagina gruppo ?id=8')).toBeInTheDocument();
  });

  it('crea un gruppo e mostra gli errori di validazione del server', async () => {
    vi.spyOn(groupService, 'create')
      .mockRejectedValueOnce(new ApiError('Some fields are not valid.', 422, { error: 'validation_error', fields: { name: 'Name must be between 2 and 100 characters.' } }))
      .mockResolvedValueOnce({ id: 12, name: 'Nuovo gruppo' });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Crea gruppo/ }));
    fireEvent.change(screen.getByLabelText('Nome del gruppo'), { target: { value: 'Nuovo gruppo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crea' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Name must be between 2 and 100 characters.');
    fireEvent.click(screen.getByRole('button', { name: 'Crea' }));
    expect(await screen.findByText('pagina gruppo ?id=12')).toBeInTheDocument();
    expect(groupService.create).toHaveBeenLastCalledWith({ name: 'Nuovo gruppo', description: '' });
  });

  it('si unisce con un codice', async () => {
    vi.spyOn(groupService, 'joinByCode').mockResolvedValue({ joined: true, alreadyMember: false, group: { id: 21, name: 'Città Studi' } });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Unisciti con codice' }));
    fireEvent.change(screen.getByLabelText('Codice del gruppo'), { target: { value: 'ABC-DEFG-HIJ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unisciti' }));
    await waitFor(() => expect(groupService.joinByCode).toHaveBeenCalledWith('ABC-DEFG-HIJ'));
    expect(await screen.findByText('pagina gruppo ?id=21')).toBeInTheDocument();
  });

  it('link d\'invito: chiede conferma prima di unirsi', async () => {
    vi.spyOn(groupService, 'joinByToken').mockResolvedValue({ joined: true, alreadyMember: false, group: { id: 30, name: 'Invito' } });
    renderPage('/gruppi?invito=tok123');
    expect(await screen.findByText('Invito a un gruppo')).toBeInTheDocument();
    expect(groupService.joinByToken).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole('button', { name: 'Unisciti' }).at(-1));
    await waitFor(() => expect(groupService.joinByToken).toHaveBeenCalledWith('tok123'));
    expect(await screen.findByText('pagina gruppo ?id=30')).toBeInTheDocument();
  });

  it('stato vuoto quando non si fa parte di nessun gruppo', async () => {
    groupService.list.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText('Non fai ancora parte di nessun gruppo')).toBeInTheDocument();
  });
});
