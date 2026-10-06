/**
 * Client API centralizzato per le richieste HTTP verso il backend RoR (Flask).
 *
 * Il frontend è servito dallo stesso dominio del backend (Nginx), quindi
 * l'autenticazione usa il cookie di sessione di Flask-Security:
 *  - ogni richiesta invia i cookie (credentials: 'include');
 *  - le richieste che modificano dati (POST/PUT/PATCH/DELETE) inviano il token
 *    CSRF nell'header X-CSRFToken, ottenuto da GET /api/auth/csrf o dalle
 *    risposte di login/registrazione/sessione;
 *  - le risposte JSON vengono normalizzate da snake_case a camelCase.
 */

import { backgroundSafeFetch } from '../native/http';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { getI18n } from '../context/i18n';

const API_BASE_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];
// tempo massimo di una richiesta all'API nel browser (esportazione dei dati e foto profilo comprese);
// i punti GPS e l'SOS usano i 20 s di backgroundSafeFetch, come le richieste native
export const API_TIMEOUT_MS = 30000;

let csrfToken = null;
let csrfRequest = null;
let apiLanguage = null;

/**
 * Lingua dell'app, inviata in Accept-Language: il server risponde con i messaggi di errore in questa lingua
 * (prima arrivavano sempre in inglese). La imposta AppContext a ogni cambio di lingua.
 * @param {string|null} code - es. 'it', 'en', 'es'
 */
export const setApiLanguage = (code) => {
  apiLanguage = code || null;
};

/**
 * "Server non raggiungibile" nella lingua dell'app: è l'errore che si vede più spesso (senza rete) e prima
 * arrivava sempre in italiano, anche a chi usa l'app in inglese o spagnolo.
 */
export const serverUnreachableMessage = () => getI18n(apiLanguage || 'it').errServerUnreachable;

/** Errore HTTP/di rete con stato, codice e dettagli dei campi non validi. */
export class ApiError extends Error {
  constructor(message, status = 0, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
    this.code = data && typeof data === 'object' ? data.error : undefined;
    this.fields = data && typeof data === 'object' && data.fields ? data.fields : null;
    this.isNetworkError = status === 0;
  }
}

export const getApiBaseUrl = () => API_BASE_URL;
export const getCsrfToken = () => csrfToken;
export const setCsrfToken = (token) => {
  csrfToken = token || null;
};

/**
 * Recupera (una sola volta anche con chiamate concorrenti) un nuovo token CSRF.
 * @returns {Promise<string|null>}
 */
export const fetchCsrfToken = async () => {
  if (!csrfRequest) {
    // promessa condivisa da tutte le richieste che modificano dati (SOS compreso): senza un tempo massimo,
    // una risposta che non arrivava le lasciava tutte in attesa
    csrfRequest = fetchWithTimeout(`${API_BASE_URL}/auth/csrf`, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' }
    })
      .then((response) => (response && response.ok && typeof response.json === 'function' ? response.json() : null))
      .then((data) => {
        csrfToken = data && typeof data.csrf_token === 'string' ? data.csrf_token : null;
        return csrfToken;
      })
      .catch(() => null)
      .finally(() => {
        csrfRequest = null;
      });
  }
  return csrfRequest;
};

/**
 * Converte una stringa da snake_case a camelCase.
 * @param {string} str - Stringa in snake_case (es. "time_limit")
 * @returns {string} Stringa in camelCase (es. "timeLimit")
 */
export const snakeToCamel = (str) => {
  if (typeof str !== 'string' || !str.includes('_')) return str;
  return str.replace(/_([a-z0-9])/g, (_, letter) => letter.toUpperCase());
};

/**
 * Normalizza ricorsivamente oggetti e array trasformando tutte le proprietà
 * da snake_case a camelCase per garantire coerenza con il codice React.
 * @param {any} data - Dati da normalizzare
 * @returns {any} Dati normalizzati
 */
export const normalizeData = (data) => {
  if (data === null || data === undefined || typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(normalizeData);
  }

  if (data instanceof FormData || data instanceof Date || (typeof Blob !== 'undefined' && data instanceof Blob)) {
    return data;
  }

  const normalized = {};
  for (const [key, value] of Object.entries(data)) {
    normalized[snakeToCamel(key)] = normalizeData(value);
  }
  return normalized;
};

const readJson = async (response) => {
  if (!response || typeof response.json !== 'function') return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
};

/**
 * Esegue una richiesta HTTP verso il backend.
 *
 * @param {string} endpoint - Percorso relativo dell'API (es. '/auth/session')
 * @param {object} [options] - Opzioni fetch più:
 *   - raw: true per non normalizzare la risposta
 *   - background: true per le richieste che devono partire anche con l'app Android in background (SOS)
 * @returns {Promise<any>} Dati della risposta (camelCase), null per 204.
 * @throws {ApiError}
 */
export const apiClient = async (endpoint, options = {}) => {
  const { raw = false, background = false, _csrfRetry = false, headers: extraHeaders = {}, body, method = 'GET', ...rest } = options;
  const upperMethod = String(method).toUpperCase();
  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const headers = { Accept: 'application/json', ...(apiLanguage ? { 'Accept-Language': apiLanguage } : {}), ...extraHeaders };
  let payload = body;
  const isBinary = payload instanceof FormData || (typeof Blob !== 'undefined' && payload instanceof Blob);
  if (payload !== undefined && payload !== null && typeof payload === 'object' && !isBinary) {
    payload = JSON.stringify(payload);
    headers['Content-Type'] = 'application/json';
  }

  if (!SAFE_METHODS.includes(upperMethod)) {
    const token = csrfToken || (await fetchCsrfToken());
    if (token) headers['X-CSRFToken'] = token;
  }

  let response;
  try {
    const init = { ...rest, method: upperMethod, headers, body: payload, credentials: 'include' };
    response = await (background ? backgroundSafeFetch(url, init) : fetchWithTimeout(url, init, API_TIMEOUT_MS));
  } catch (networkError) {
    throw new ApiError(serverUnreachableMessage(), 0, null);
  }

  if (response.status === 204) {
    return null;
  }

  const data = await readJson(response);
  if (data && typeof data === 'object' && typeof data.csrf_token === 'string') {
    csrfToken = data.csrf_token;
  }

  if (!response.ok) {
    // Token CSRF scaduto o sessione rinnovata: se ne chiede uno nuovo e si riprova una volta.
    if (response.status === 400 && data?.error === 'csrf_error' && !_csrfRetry) {
      csrfToken = null;
      await fetchCsrfToken();
      return apiClient(endpoint, { ...options, _csrfRetry: true });
    }

    // Sessione scaduta su un endpoint protetto: l'app torna alla schermata di login.
    if (response.status === 401 && data?.error === 'unauthorized' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ror:unauthorized'));
    }

    const statusText = response.statusText ? `: ${response.statusText}` : '';
    const message = data?.message || data?.error || `Errore HTTP ${response.status}${statusText}`;
    throw new ApiError(message, response.status, data);
  }

  return raw ? data : normalizeData(data);
};

/** Metodi di utilità abbreviati per chiamate REST */
export const api = {
  get: (endpoint, options = {}) => apiClient(endpoint, { ...options, method: 'GET' }),
  post: (endpoint, body, options = {}) => apiClient(endpoint, { ...options, method: 'POST', body }),
  put: (endpoint, body, options = {}) => apiClient(endpoint, { ...options, method: 'PUT', body }),
  patch: (endpoint, body, options = {}) => apiClient(endpoint, { ...options, method: 'PATCH', body }),
  delete: (endpoint, options = {}) => apiClient(endpoint, { ...options, method: 'DELETE' })
};
