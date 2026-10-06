/**
 * Modulo di utilità per la sicurezza dell'autenticazione, la valutazione della
 * complessità password e la memorizzazione locale delle credenziali di accesso rapido.
 */

export const AUTH_STORAGE_KEYS = {
  REMEMBER_ME: 'ror-remember-me',
  SAVED_EMAIL: 'ror-saved-email'
};

/**
 * Calcola il livello di sicurezza di una password basandosi su lunghezza, numeri,
 * alternanza maiuscole/minuscole e caratteri speciali.
 *
 * @param {string} pwd - La stringa della password inserita dall'utente.
 * @returns {{ score: number, level: 'empty' | 'weak' | 'medium' | 'strong', percent: number, color: string, labelKey: string }}
 */
export const calculatePasswordStrength = (pwd) => {
  if (!pwd || typeof pwd !== 'string' || pwd.trim().length === 0) {
    return {
      score: 0,
      level: 'empty',
      percent: 0,
      color: 'transparent',
      labelKey: ''
    };
  }

  let score = 0;
  // 1 punto per lunghezza minima di base
  if (pwd.length >= 6) score += 1;
  // 1 punto addizionale per lunghezza consigliata (8 o più caratteri)
  if (pwd.length >= 8) score += 1;
  // 1 punto per la presenza di cifre numeriche
  if (/[0-9]/.test(pwd)) score += 1;
  // 1 punto per la combinazione di lettere maiuscole e minuscole
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score += 1;
  // 1 punto per la presenza di caratteri speciali/simboli
  if (/[^A-Za-z0-9]/.test(pwd)) score += 1;

  if (score <= 2) {
    return {
      score: 1,
      level: 'weak',
      percent: 33,
      color: '#EF4444',
      labelKey: 'pwdStrengthWeak'
    };
  } else if (score === 3) {
    return {
      score: 2,
      level: 'medium',
      percent: 66,
      color: '#F59E0B',
      labelKey: 'pwdStrengthMedium'
    };
  } else {
    return {
      score: 3,
      level: 'strong',
      percent: 100,
      color: '#10B981',
      labelKey: 'pwdStrengthStrong'
    };
  }
};

/**
 * Legge lo stato salvato per l'opzione "Ricordami su questo dispositivo".
 * @returns {boolean}
 */
export const getRememberMePreference = () => {
  try {
    return localStorage.getItem(AUTH_STORAGE_KEYS.REMEMBER_ME) === 'true';
  } catch (e) {
    console.warn('Impossibile accedere a localStorage per remember-me:', e);
    return false;
  }
};

/**
 * Salva o cancella la preferenza di memorizzazione credenziali.
 * @param {boolean} enabled - Se abilitare o disabilitare il salvataggio.
 * @param {string} email - L'email del rider da memorizzare.
 */
export const setRememberMePreference = (enabled, email = '') => {
  try {
    if (enabled) {
      localStorage.setItem(AUTH_STORAGE_KEYS.REMEMBER_ME, 'true');
      if (email) {
        localStorage.setItem(AUTH_STORAGE_KEYS.SAVED_EMAIL, email.trim());
      }
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEYS.REMEMBER_ME);
      localStorage.removeItem(AUTH_STORAGE_KEYS.SAVED_EMAIL);
    }
  } catch (e) {
    console.warn('Impossibile aggiornare localStorage per remember-me:', e);
  }
};

/**
 * Recupera l'email precedentemente memorizzata, se presente.
 * @returns {string}
 */
export const getSavedEmail = () => {
  try {
    return localStorage.getItem(AUTH_STORAGE_KEYS.SAVED_EMAIL) || '';
  } catch (e) {
    console.warn('Impossibile leggere saved-email da localStorage:', e);
    return '';
  }
};

/**
 * Percorso a cui tornare dopo login/registrazione, salvato da ProtectedRoute in location.state.from.
 * Conserva query e hash (es. /gruppi?invito=<token>) e accetta solo percorsi interni.
 * @param {object} [state] - location.state
 * @param {string} [fallback='/']
 */
export const redirectPathFromState = (state, fallback = '/') => {
  const from = state && state.from;
  if (!from || typeof from.pathname !== 'string' || !from.pathname.startsWith('/') || from.pathname.startsWith('//')) {
    return fallback;
  }
  if (['/login', '/accedi', '/register'].includes(from.pathname)) return fallback;
  return `${from.pathname}${from.search || ''}${from.hash || ''}`;
};

/**
 * Il pannello admin Flask (/web/admin/) senza sessione rimanda a /accedi?next=<pagina del pannello>:
 * dopo l'accesso si torna lì. Accetta solo pagine del pannello (niente redirect verso altri siti).
 * @param {string} [search] - location.search
 * @returns {string|null}
 */
export const adminReturnPath = (search) => {
  const next = new URLSearchParams(search || '').get('next');
  return next && /^\/web\/admin(\/|\?|$)/.test(next) ? next : null;
};

/**
 * Numero di telefono valido: da 8 a 15 cifre (il massimo di un numero internazionale) con +, spazi, trattini e
 * parentesi. Stessa regola del server (validate_phone in backend/app/api/auth.py). Prima la usava solo il Profilo:
 * la registrazione accettava qualsiasi testo e l'API anche una sola cifra come telefono di un contatto SOS.
 * @param {string} phoneNumber
 * @returns {boolean}
 */
export const isValidPhoneNumber = (phoneNumber) => {
  if (!phoneNumber || typeof phoneNumber !== 'string') return false;
  const clean = phoneNumber.trim();
  if (!/^(\+?[0-9\s\-()]{8,20})$/.test(clean)) return false;
  const digitsOnly = clean.replace(/\D/g, '');
  return digitsOnly.length >= 8 && digitsOnly.length <= 15;
};

/** Età minima per registrarsi: i rider lavorano in strada (la controlla anche il server). */
export const MIN_RIDER_AGE = 18;

/**
 * Ultima data di nascita ammessa oggi (YYYY-MM-DD): chi è nato quel giorno compie 18 anni oggi.
 * Chi è nato il 29 febbraio, negli anni non bisestili compie gli anni il 1° marzo.
 * @param {Date} [today]
 * @returns {string}
 */
export const latestAdultBirthDate = (today = new Date()) => {
  const year = today.getFullYear() - MIN_RIDER_AGE;
  const month = today.getMonth() + 1;
  const leapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const day = month === 2 && today.getDate() === 29 && !leapYear ? 28 : today.getDate();
  return [String(year).padStart(4, '0'), String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-');
};
