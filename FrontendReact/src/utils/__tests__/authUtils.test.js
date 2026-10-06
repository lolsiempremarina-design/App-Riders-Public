import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculatePasswordStrength,
  getRememberMePreference,
  setRememberMePreference,
  getSavedEmail,
  latestAdultBirthDate,
  isValidPhoneNumber,
  AUTH_STORAGE_KEYS
} from '../authUtils';

describe('isValidPhoneNumber (stessa regola del server: 8-15 cifre)', () => {
  // gli stessi casi di backend/tests/test_api_profile.py::test_phone_numbers_follow_the_rule_of_the_app
  it.each([
    ['1', false], ['+39 1234', false], ['333 1234567', true], ['+39 333 1234567', true],
    ['+54 9 11 1234 5678', true], ['+123 4567 8901 23456', false], ['abc 12345678', false], ['', false]
  ])('%s → %s', (phone, ok) => {
    expect(isValidPhoneNumber(phone)).toBe(ok);
  });
});

describe('authUtils - Password Strength & Remember Me Logic', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('calculatePasswordStrength', () => {
    it('restituisce livello vuoto se la password non è specificata', () => {
      const resultEmpty = calculatePasswordStrength('');
      expect(resultEmpty.level).toBe('empty');
      expect(resultEmpty.percent).toBe(0);
      expect(resultEmpty.score).toBe(0);

      const resultNull = calculatePasswordStrength(null);
      expect(resultNull.level).toBe('empty');
    });

    it('identifica una password debole (< 8 caratteri o solo lettere semplici)', () => {
      const result = calculatePasswordStrength('123456');
      expect(result.level).toBe('weak');
      expect(result.score).toBe(1);
      expect(result.percent).toBe(33);
      expect(result.color).toBe('#EF4444');
      expect(result.labelKey).toBe('pwdStrengthWeak');
    });

    it('identifica una password di livello medio (lunghezza e cifre o maiuscole)', () => {
      const result = calculatePasswordStrength('password1');
      expect(result.level).toBe('medium');
      expect(result.score).toBe(2);
      expect(result.percent).toBe(66);
      expect(result.color).toBe('#F59E0B');
      expect(result.labelKey).toBe('pwdStrengthMedium');
    });

    it('identifica una password forte (lunghezza 8+, lettere miste, numeri e caratteri speciali)', () => {
      const result = calculatePasswordStrength('Secure#2026!Rider');
      expect(result.level).toBe('strong');
      expect(result.score).toBe(3);
      expect(result.percent).toBe(100);
      expect(result.color).toBe('#10B981');
      expect(result.labelKey).toBe('pwdStrengthStrong');
    });
  });

  describe('Remember Me & Credential Storage Helpers', () => {
    it('salva correttamente la preferenza e l\'email in localStorage', () => {
      expect(getRememberMePreference()).toBe(false);
      expect(getSavedEmail()).toBe('');

      setRememberMePreference(true, 'marco.rossi@ror.it');

      expect(getRememberMePreference()).toBe(true);
      expect(getSavedEmail()).toBe('marco.rossi@ror.it');
      expect(localStorage.getItem(AUTH_STORAGE_KEYS.REMEMBER_ME)).toBe('true');
    });

    it('rimuove i dati salvati quando la preferenza viene disattivata', () => {
      setRememberMePreference(true, 'marco.rossi@ror.it');
      expect(getRememberMePreference()).toBe(true);

      setRememberMePreference(false);
      expect(getRememberMePreference()).toBe(false);
      expect(getSavedEmail()).toBe('');
      expect(localStorage.getItem(AUTH_STORAGE_KEYS.REMEMBER_ME)).toBeNull();
      expect(localStorage.getItem(AUTH_STORAGE_KEYS.SAVED_EMAIL)).toBeNull();
    });
  });

  describe('Età minima (18 anni)', () => {
    it('l\'ultima data di nascita ammessa è oggi di 18 anni fa', () => {
      expect(latestAdultBirthDate(new Date(2026, 9, 2))).toBe('2008-10-02');
      expect(latestAdultBirthDate(new Date(2026, 0, 1))).toBe('2008-01-01');
    });

    it('il 29 febbraio di un anno bisestile ammette i nati fino al 28 febbraio', () => {
      expect(latestAdultBirthDate(new Date(2028, 1, 29))).toBe('2010-02-28');
      expect(latestAdultBirthDate(new Date(2032, 1, 29))).toBe('2014-02-28');
      expect(latestAdultBirthDate(new Date(2026, 1, 28))).toBe('2008-02-28');
    });
  });
});
