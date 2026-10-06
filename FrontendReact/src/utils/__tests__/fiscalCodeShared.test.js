import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { buildFiscalCode } from '../fiscalCodeUtils';

// Stessi casi dei test del backend (backend/tests/test_tax_id_shared.py): quello che il modulo di registrazione
// calcola, il server deve accettarlo. Prima Ł, Đ, Ø e Æ venivano scartate qui e rifiutate là: niente registrazione.
const FIXTURE = path.resolve(__dirname, '../../../../backend/tests/data/fiscal_codes.json');
const { cases } = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

describe('Codice fiscale condiviso con il backend', () => {
  it("contiene l'esempio classico dell'Agenzia delle Entrate e un caso per ogni lettera della tabella", () => {
    expect(cases[0]).toMatchObject({ name: 'Mario', surname: 'Rossi', code: 'RSSMRA80A01H501U' });
    const letters = cases.map((c) => c.name + c.surname).join('');
    for (const letter of 'ŁĐđØøÆŒÞðßıĦŦŀĿ') expect(letters).toContain(letter);
  });

  it.each(cases.map((c) => [c.note, c]))('%s', (_note, c) => {
    expect(buildFiscalCode({
      name: c.name, surname: c.surname, birthDate: c.birth_date, gender: c.gender, municipalityCode: c.municipality
    })).toBe(c.code);
  });
});
