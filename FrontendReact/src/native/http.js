/**
 * Richieste HTTP fatte dal codice nativo dell'app (CapacitorHttp) invece che dalla WebView.
 *
 * Con l'app in background (schermo spento durante una sessione) Android rallenta le richieste della WebView
 * dopo pochi minuti: punti GPS, chiusura della sessione e SOS partono quindi da qui. CapacitorHttp usa gli
 * stessi cookie della WebView (sessione Flask); il Referer serve al controllo CSRF di Flask su HTTPS.
 */
import { CapacitorHttp } from '@capacitor/core';
import { isNativeApp } from './platform';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';

/** Risposta con la stessa forma minima di fetch (ok, status, headers.get, json). */
const toResponse = ({ status, headers = {}, data }) => {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    headers: { get: (name) => lower[String(name).toLowerCase()] ?? null },
    json: async () => (typeof data === 'string' ? JSON.parse(data) : data)
  };
};

/**
 * @param {string} url - percorso dello stesso sito (es. /stream) o URL assoluto
 * @param {{method?: string, headers?: object, body?: string}} init - come fetch (body già in JSON)
 */
export const nativeFetch = async (url, { method = 'GET', headers = {}, body } = {}) => {
  const origin = window.location.origin;
  const response = await CapacitorHttp.request({
    url: new URL(url, origin).href,
    method,
    headers: { Referer: `${origin}/`, ...headers },
    data: body,
    responseType: 'json',
    connectTimeout: 20000,
    readTimeout: 20000
  });
  return toResponse(response);
};

/**
 * fetch per le richieste che devono partire anche con l'app in background (solo nell'app Android).
 * Nel browser con lo stesso tempo massimo delle richieste native (20 s): punti GPS e SOS non restano appesi.
 */
export const backgroundSafeFetch = (url, init = {}) => (isNativeApp() ? nativeFetch(url, init) : fetchWithTimeout(url, init));
