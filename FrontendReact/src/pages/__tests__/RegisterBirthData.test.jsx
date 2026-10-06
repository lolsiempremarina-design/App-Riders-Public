import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '../../context/AppContext';
import { authService } from '../../services/authService';
import { Register } from '../Register';

// Risposta di GET /api/municipalities (elenco ISTAT servito dal backend)
const COMUNI = {
  source: 'ISTAT - Elenco dei comuni italiani',
  updated: '2024-01-26',
  municipalities: [['Milano', 'MI', 'F205'], ['Napoli', 'NA', 'F839'], ['Forlì', 'FC', 'D704'], ['Roma', 'RM', 'H501']]
};

const renderRegister = () => render(
  <MemoryRouter>
    <AppProvider>
      <Register />
    </AppProvider>
  </MemoryRouter>
);

const field = (id) => document.getElementById(id);
const fiscalCode = () => field('reg-ssn').value;
const fill = (id, value) => fireEvent.change(field(id), { target: { value } });

describe('Registrazione: dati di nascita e codice fiscale', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn((url) => Promise.resolve(String(url).includes('/api/municipalities')
      ? { ok: true, status: 200, headers: { get: () => 'application/json' }, json: () => Promise.resolve(COMUNI) }
      : { ok: false, status: 401, headers: { get: () => 'application/json' }, json: () => Promise.resolve({ error: 'unauthorized' }) }));
  });

  it('nessun dato di nascita precompilato: senza compilarli non c\'è codice fiscale', async () => {
    renderRegister();
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(field('reg-dob').value).toBe('');
    expect(field('reg-gender').value).toBe('');
    expect(field('reg-pob').value).toBe('');
    expect(field('reg-municipality').value).toBe('');
    fill('reg-nome', 'Mario');
    fill('reg-cognome', 'Rossi');
    expect(fiscalCode()).toBe('');
    // l'elenco arriva dal nostro server (ISTAT), non da siti esterni
    expect(await screen.findByText(/Elenco dei comuni: ISTAT .*2024-01-26/)).toBeInTheDocument();
    expect(globalThis.fetch.mock.calls.map(([url]) => String(url)).filter((url) => !url.startsWith('/api/'))).toEqual([]);
  });

  it('il comune scritto a mano (minuscole, senza accento) usa il suo codice catastale, mai quello di Roma', async () => {
    renderRegister();
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    fill('reg-nome', 'Mario');
    fill('reg-cognome', 'Rossi');
    fill('reg-dob', '1990-01-01');
    fill('reg-gender', 'M');
    fill('reg-pob', 'NA');
    fill('reg-municipality', 'napoli');
    await waitFor(() => expect(fiscalCode()).toMatch(/^RSSMRA90A01F839.$/));

    fill('reg-pob', 'FC');
    fill('reg-municipality', 'forli');
    await waitFor(() => expect(fiscalCode()).toMatch(/D704.$/));

    expect(screen.queryByLabelText(/non esiste più/i)).not.toBeInTheDocument();

    // comune inesistente: nessun codice inventato
    fill('reg-municipality', 'Paperopoli');
    await waitFor(() => expect(fiscalCode()).toBe(''));
    expect(screen.getByText(/Scegli il comune dall'elenco/i)).toBeInTheDocument();
    expect(field('reg-ssn')).toHaveAttribute('readonly');
  });

  it('chi è nato in un comune soppresso o fuso (non più nell\'elenco) inserisce il proprio codice fiscale', async () => {
    const register = vi.spyOn(authService, 'register').mockRejectedValue(Object.assign(new Error('stop'), { fields: {} }));
    renderRegister();
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    fill('reg-nome', 'Mario');
    fill('reg-cognome', 'Rossi');
    fill('reg-dob', '1950-03-10');
    fill('reg-gender', 'M');
    fill('reg-pob', 'BI');
    fill('reg-municipality', 'Mosso'); // confluito in Valdilana nel 2019
    expect(await screen.findByText(/Scegli il comune dall'elenco/i)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/comune di nascita non esiste più/i));
    expect(screen.queryByText(/Scegli il comune dall'elenco/i)).not.toBeInTheDocument();
    const code = field('reg-ssn');
    expect(code).not.toHaveAttribute('readonly');
    fireEvent.change(code, { target: { value: 'rssmra50c10f778w' } });
    fireEvent.submit(code.closest('form'));
    await waitFor(() => expect(register).toHaveBeenCalled());
    const payload = register.mock.calls[0][0];
    expect(payload.tax_id_code).toBe('RSSMRA50C10F778W');
    expect(payload.birth_city_country).toBe('Mosso (BI)');
  });

  it('chi è nato all\'estero inserisce il proprio codice fiscale e lo stato di nascita', async () => {
    const register = vi.spyOn(authService, 'register').mockRejectedValue(Object.assign(new Error('stop'), { fields: {} }));
    renderRegister();
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    fireEvent.click(screen.getByLabelText(/Nato\/a all'estero/i));
    expect(field('reg-pob')).toBeNull();
    fill('reg-nome', 'Juan');
    fill('reg-cognome', 'Perez');
    fill('reg-dob', '1995-06-20');
    fill('reg-gender', 'M');
    fill('reg-birth-country', 'Argentina');
    const code = field('reg-ssn');
    expect(code).not.toHaveAttribute('readonly');
    fireEvent.change(code, { target: { value: 'przjnu95h20z600x' } });
    fireEvent.submit(code.closest('form'));
    await waitFor(() => expect(register).toHaveBeenCalled());
    const payload = register.mock.calls[0][0];
    expect(payload.tax_id_code).toBe('PRZJNU95H20Z600X');
    expect(payload.birth_city_country).toBe('Argentina');
  });

  it('il comune scritto a mano viene salvato con il nome ufficiale ISTAT', async () => {
    const register = vi.spyOn(authService, 'register').mockRejectedValue(Object.assign(new Error('stop'), { fields: {} }));
    renderRegister();
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    fill('reg-nome', 'Luca');
    fill('reg-cognome', 'Verdi');
    fill('reg-dob', '1992-03-15');
    fill('reg-gender', 'M');
    fill('reg-pob', 'FC');
    fill('reg-municipality', 'forli');
    await waitFor(() => expect(fiscalCode()).toMatch(/D704.$/));
    fireEvent.submit(field('reg-ssn').closest('form'));
    await waitFor(() => expect(register).toHaveBeenCalled());
    expect(register.mock.calls[0][0].birth_city_country).toBe('Forlì (FC)');
  });

  it('un telefono troppo corto viene segnalato prima di inviare (stessa regola del Profilo e del server)', async () => {
    // prima qui passava qualsiasi testo e il server accettava anche una sola cifra
    const register = vi.spyOn(authService, 'register').mockRejectedValue(Object.assign(new Error('stop'), { fields: {} }));
    renderRegister();
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    fill('reg-phone', '12');
    fireEvent.submit(field('reg-phone').closest('form'));
    expect(await screen.findByText(/deve avere da 8 a 15 cifre/)).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();

    fill('reg-phone', '348 1234567');
    fireEvent.submit(field('reg-phone').closest('form'));
    await waitFor(() => expect(register).toHaveBeenCalled());
    expect(register.mock.calls[0][0].phone_number).toBe('+39 348 1234567');
  });

  it('solo maggiorenni: una data di nascita più recente di 18 anni fa non è valida', async () => {
    renderRegister();
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    const dob = field('reg-dob');
    const limit = dob.getAttribute('max');
    const eighteenYearsAgo = new Date();
    eighteenYearsAgo.setFullYear(eighteenYearsAgo.getFullYear() - 18);
    expect(limit.slice(0, 7)).toBe(`${eighteenYearsAgo.getFullYear()}-${String(eighteenYearsAgo.getMonth() + 1).padStart(2, '0')}`);

    const tooYoung = `${Number(limit.slice(0, 4)) + 1}${limit.slice(4)}`;
    fill('reg-dob', tooYoung);
    expect(dob.validationMessage).toBe('Per registrarti devi avere almeno 18 anni.');
    fill('reg-dob', limit);
    expect(dob.validationMessage).toBe('');
  });
});
