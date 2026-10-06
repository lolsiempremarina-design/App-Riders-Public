/**
 * Servizio di autenticazione del rider (sessione Flask-Security via cookie).
 */
import { api, setCsrfToken } from './api';

// Senza foto: una sagoma neutra (non la foto di una persona, che sembrerebbe quella dell'utente)
export const DEFAULT_AVATAR = '/icons/avatar-placeholder.svg';

/**
 * Converte l'utente restituito dal backend (già in camelCase) nel profilo
 * usato dalle pagine React (name, surname, phone, fiscalCode, photo, ...).
 * @param {object|null} user
 * @returns {object|null}
 */
export const mapUserToProfile = (user) => {
  if (!user || typeof user !== 'object') return null;
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    // false: prima di usare l'app va inserito il codice inviato per email (pagina /conferma-email)
    emailConfirmed: user.emailConfirmed !== false,
    pendingEmail: user.pendingEmail || null,
    name: user.firstName || '',
    surname: user.lastName || '',
    fullName: user.fullName || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
    phone: user.phoneNumber || '',
    fiscalCode: user.taxIdCode || '',
    birthDate: user.dateOfBirth || '',
    gender: user.gender || '',
    birthPlace: user.birthCityCountry || '',
    language: user.language || 'it',
    sensorsEnabled: Boolean(user.sensorsEnabled),
    shareLocationWithGroups: Boolean(user.shareLocationWithGroups),
    photo: user.avatar || DEFAULT_AVATAR,
    hasCustomPhoto: Boolean(user.avatar),
    roles: Array.isArray(user.roles) ? user.roles : [],
    isAdmin: Boolean(user.isAdmin)
  };
};

/** Etichette dei campi per i messaggi di errore (in italiano; le traduzioni sono in t.fieldLabels). */
export const REGISTRATION_FIELD_LABELS = {
  username: 'Nome utente',
  email: 'Email',
  password: 'Password',
  password_confirm: 'Conferma password',
  first_name: 'Nome',
  last_name: 'Cognome',
  date_of_birth: 'Data di nascita',
  gender: 'Genere',
  birth_city_country: 'Comune di nascita',
  tax_id_code: 'Codice fiscale',
  phone_number: 'Telefono',
  avatar: 'Foto profilo',
  'sos_contact.name': 'Nome contatto SOS',
  'sos_contact.phone': 'Telefono SOS',
  'sos_contact.email': 'Email SOS',
  current_password: 'Password attuale',
  new_password: 'Nuova password',
  new_password_confirm: 'Conferma nuova password',
  name: 'Nome',
  phone: 'Telefono',
  relationship: 'Relazione',
  priority: 'Priorità',
  language: 'Lingua',
  sensors_enabled: 'Sensori',
  share_location_with_groups: 'Condivisione posizione'
};

/**
 * Restituisce un messaggio comprensibile per un errore di autenticazione.
 * @param {Error & {status?: number, code?: string}} error
 * @param {object} [t] - dizionario traduzioni
 */
export const authErrorMessage = (error, t = {}) => {
  if (!error) return '';
  if (error.isNetworkError) {
    return t.errServerUnreachable || 'Impossibile contattare il server. Controlla la connessione e riprova.';
  }
  switch (error.code) {
    case 'invalid_credentials':
      return t.errInvalidCredentials || 'Email/nome utente o password non corretti.';
    case 'invalid_password':
      return t.errInvalidPassword || 'La password inserita non è corretta.';
    case 'limit_reached':
      return t.errLimitReached || 'Hai raggiunto il numero massimo consentito.';
    case 'account_disabled':
      return t.errAccountDisabled || 'Questo account è stato disattivato.';
    case 'too_many_requests':
      return t.errTooManyAttempts || 'Troppi tentativi falliti. Riprova tra 15 minuti.';
    case 'already_authenticated':
      return t.errAlreadyAuthenticated || 'Hai già effettuato l\'accesso. Esci per creare un nuovo account.';
    case 'validation_error':
      return t.errValidation || 'Alcuni campi non sono validi. Controlla i dati inseriti.';
    case 'conflict':
      return t.errConflict || 'Alcuni di questi dati risultano già registrati.';
    default:
      if (error.status >= 500) {
        return t.errServer || 'Errore del server. Riprova tra qualche istante.';
      }
      return error.message || t.errGeneric || 'Si è verificato un errore imprevisto.';
  }
};

/**
 * Converte gli errori per campo del backend in una lista [{ field, label, message }].
 * I messaggi arrivano già nella lingua dell'app (Accept-Language); le etichette vengono da t.fieldLabels.
 * @param {object|null} fields
 * @param {object} [t] - traduzioni della lingua attiva
 */
export const fieldErrorsToList = (fields, t = {}) =>
  Object.entries(fields || {}).map(([field, message]) => ({
    field,
    label: t.fieldLabels?.[field] || REGISTRATION_FIELD_LABELS[field] || field,
    message
  }));

export const authService = {
  /**
   * Stato della sessione corrente (non lancia 401).
   * @returns {Promise<object|null>} profilo o null se non autenticato
   */
  getSession: async () => {
    const data = await api.get('/auth/session');
    return data && data.authenticated && data.user ? mapUserToProfile(data.user) : null;
  },

  /**
   * Accesso con email o nome utente.
   * @param {string} identity - email o username
   * @param {string} password
   * @param {boolean} [remember=true] - mantiene la sessione dopo la chiusura del browser
   * @returns {Promise<object>} profilo del rider
   */
  login: async (identity, password, remember = true) => {
    const data = await api.post('/auth/login', { identity, password, remember });
    return mapUserToProfile(data?.user);
  },

  /**
   * Registra un nuovo rider (payload nel formato del backend, snake_case).
   * @param {object} payload
   * @returns {Promise<object>} profilo del rider appena creato (già autenticato)
   */
  register: async (payload) => {
    const data = await api.post('/auth/register', payload);
    return mapUserToProfile(data?.user);
  },

  /**
   * Comuni italiani (elenco ufficiale ISTAT servito dal backend) per calcolare il codice fiscale.
   * @returns {Promise<{source: string, updated: string, list: Array<{name: string, province: string, cadastralCode: string}>}>}
   */
  getMunicipalities: async () => {
    const data = await api.get('/municipalities', { raw: true });
    return {
      source: data.source,
      updated: data.updated,
      list: (data.municipalities || []).map(([name, province, cadastralCode]) => ({ name, province, cadastralCode }))
    };
  },

  /** Profilo aggiornato del rider autenticato. */
  getCurrentUser: async () => mapUserToProfile(await api.get('/auth/me')),

  /** Chiude la sessione sul server. */
  logout: async () => {
    await api.post('/auth/logout');
  },

  /**
   * Elimina definitivamente l'account (richiede la password attuale).
   * @param {string} password
   */
  deleteAccount: async (password) => {
    const data = await api.post('/auth/delete-account', { password });
    setCsrfToken(null);
    return data;
  },

  /**
   * Conferma dell'email (codice di 6 cifre inviato dal server quando la posta è configurata).
   * @returns {Promise<{confirmed: boolean, email: string, resendInSec: number, mailConfigured: boolean}>}
   */
  getEmailConfirmation: async () => api.get('/auth/confirm-email'),

  /** @returns {Promise<object>} profilo aggiornato (email confermata o nuova email applicata) */
  confirmEmail: async (code) => mapUserToProfile((await api.post('/auth/confirm-email', { code }))?.user),

  /**
   * Nuovo codice; con `email` corregge l'indirizzo (account nuovo) o cambia quello da confermare.
   * @returns {Promise<{email: string, resendInSec: number}>}
   */
  resendEmailCode: async (email) => api.post('/auth/confirm-email/resend', email ? { email } : {}),

  /** Annulla il cambio di email in attesa del codice. @returns {Promise<object>} profilo */
  cancelEmailChange: async () => mapUserToProfile((await api.delete('/auth/confirm-email'))?.user)
};
