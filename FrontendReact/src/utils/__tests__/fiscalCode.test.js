import { describe, it, expect } from 'vitest';
import { buildFiscalCode, MUNICIPALITY_CODES } from '../fiscalCodeUtils';

describe('buildFiscalCode Utility & Calcolo Codice Fiscale', () => {
  it('genera un codice fiscale valido di 16 caratteri per un caso standard', () => {
    const data = {
      surname: 'Rossi',
      name: 'Mario',
      birthDate: '1980-01-01',
      gender: 'M',
      municipalityCode: 'H501' // Roma
    };
    const code = buildFiscalCode(data);
    expect(code).toHaveLength(16);
    expect(code).toMatch(/^[A-Z0-9]{16}$/);
    expect(code.startsWith('RSSMRA80A01H501')).toBe(true);
  });

  it('restituisce stringa vuota se mancano dati obbligatori o la data non è valida', () => {
    expect(buildFiscalCode({ surname: 'Rossi' })).toBe('');
    expect(buildFiscalCode({})).toBe('');
    expect(buildFiscalCode(null)).toBe('');
    expect(buildFiscalCode({ surname: 'Rossi', name: 'Mario', birthDate: 'invalid-date', gender: 'M', municipalityCode: 'H501' })).toBe('');
  });

  it('gestisce correttamente la data di nascita femminile aggiungendo 40 al giorno', () => {
    const male = buildFiscalCode({
      surname: 'Rossi',
      name: 'Mario',
      birthDate: '1980-01-01',
      gender: 'M',
      municipalityCode: 'H501'
    });
    const female = buildFiscalCode({
      surname: 'Rossi',
      name: 'Mario',
      birthDate: '1980-01-01',
      gender: 'F',
      municipalityCode: 'H501'
    });
    expect(female).not.toBe(male);
    expect(female).toHaveLength(16);
    expect(female.includes('80A41')).toBe(true);
  });

  it('normalizza correttamente i caratteri accentati nei nomi e cognomi italiani', () => {
    const data = {
      surname: 'Piètrò',
      name: 'Giulià',
      birthDate: '1990-05-05',
      gender: 'M',
      municipalityCode: MUNICIPALITY_CODES.Milano // F205
    };
    const code = buildFiscalCode(data);
    expect(code).toHaveLength(16);
    expect(code).toMatch(/^[A-Z0-9]+$/);
    expect(code).not.toContain('è');
    expect(code).not.toContain('à');
    expect(code).not.toContain('ò');
  });
  it('calcola il carattere di controllo ufficiale e la regola del nome (coerente con il backend)', () => {
    expect(buildFiscalCode({ surname: 'Rossi', name: 'Mario', birthDate: '1985-08-01', gender: 'M', municipalityCode: 'H501' }))
      .toBe('RSSMRA85M01H501Q');
    expect(buildFiscalCode({ surname: 'Bianchi', name: 'Giulia', birthDate: '1995-03-12', gender: 'F', municipalityCode: 'F205' }))
      .toBe('BNCGLI95C52F205W');
    // Nome con 4+ consonanti: si usano la 1ª, 3ª e 4ª (Francesco → FNC)
    expect(buildFiscalCode({ surname: 'Verdi', name: 'Francesco', birthDate: '1970-12-31', gender: 'M', municipalityCode: 'L219' }))
      .toBe('VRDFNC70T31L219D');
  });
});
