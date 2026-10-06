/**
 * Utilità per i test e2e: utenti reali creati e cancellati tramite l'API del backend.
 * Le richieste passano da `page.request`, che condivide i cookie con il browser: dopo la
 * registrazione la pagina è già autenticata (nessun token o profilo finto in localStorage).
 */
import { execFileSync, execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { buildFiscalCode } from '../src/utils/fiscalCodeUtils.js';

const BACKEND_DIR = path.resolve(process.cwd(), '../backend');
let sequence = 0;

// nginx accetta 20 richieste al minuto su /api/auth/ (zona "auth", token CSRF compreso: uno per ogni chiamata
// qui sotto). Con più test di fila (--repeat-each) rispondeva 429: la registrazione falliva e l'eliminazione
// dell'account, rifiutata in silenzio, lasciava un rider che bloccava i test successivi (stesso nome e data di
// nascita, quindi stesso codice fiscale: "already registered"). Il 429 arriva da nginx prima dell'app: si aspetta
// che il limite si ricarichi (una richiesta ogni 3 s) e si ripete.
const RATE_LIMIT_WAITS_MS = [3000, 6000, 9000, 12000];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const withRateLimitRetry = async (send) => {
  for (let attempt = 0; ; attempt += 1) {
    const response = await send();
    if (response.status() !== 429 || attempt >= RATE_LIMIT_WAITS_MS.length) return response;
    await sleep(RATE_LIMIT_WAITS_MS[attempt]);
  }
};

const csrfToken = async (request) =>
  (await (await withRateLimitRetry(() => request.get('/api/auth/csrf'))).json()).csrf_token;

/** Chiamata JSON all'API con il token CSRF. */
export const api = async (request, method, url, data) => {
  const token = await csrfToken(request);
  const response = await withRateLimitRetry(() => request.fetch(url, {
    method,
    data,
    headers: { 'X-CSRFToken': token, Referer: `${process.env.E2E_BASE_URL || 'https://localhost'}/` }
  }));
  const body = await response.json().catch(() => null);
  if (!response.ok()) throw new Error(`${method} ${url} → ${response.status()} ${JSON.stringify(body)}`);
  return body;
};

/**
 * Registra un rider di prova (la sessione resta attiva nel contesto del browser).
 * @returns {Promise<{id: number, email: string, username: string, password: string, name: string}>}
 */
export const registerRider = async (page, { name = 'Luca', surname = 'Verdi', gender = 'M', birthDate = '1992-03-15' } = {}) => {
  sequence += 1;
  const suffix = `${Date.now().toString(36)}${sequence}`;
  const password = `E2e-${randomBytes(9).toString('base64url')}`;
  const email = `e2e_${suffix}@example.com`;
  const body = await api(page.request, 'POST', '/api/auth/register', {
    username: `e2e_${suffix}`,
    email,
    password,
    password_confirm: password,
    first_name: name,
    last_name: surname,
    date_of_birth: birthDate,
    gender,
    birth_city_country: 'Roma (RM)',
    tax_id_code: buildFiscalCode({ surname, name, birthDate, gender, municipalityCode: 'H501' }),
    phone_number: `+39 3${String(Date.now() + sequence).slice(-9)}`,
    language: 'it'
  });
  if (body.user.email_confirmed === false) {
    // posta configurata nel .env: il codice arriverebbe per email, lo conferma il comando dell'amministratore
    execFileSync('docker', ['compose', 'exec', '-T', 'web', 'flask', 'ror', 'confirm-email', email], { cwd: BACKEND_DIR, stdio: 'pipe' });
  }
  return { id: body.user.id, email, username: `e2e_${suffix}`, password, name };
};

/** Elimina l'account di prova della pagina (dati, gruppi, messaggi...). Se non riesce lo dice, invece di tacere. */
export const deleteRider = async (page, rider) => {
  if (!rider) return;
  await api(page.request, 'POST', '/api/auth/delete-account', { password: rider.password })
    .catch((error) => console.warn(`Account di prova non eliminato (${rider.email}): ${error.message}`));
};

/** Assegna il ruolo admin con il comando CLI del backend (richiede lo stack Docker in esecuzione). */
export const grantAdmin = (email) => {
  execSync(`docker compose exec -T web flask ror grant-admin ${email}`, { cwd: BACKEND_DIR, stdio: 'pipe' });
};

/**
 * Elimina un ordine creato dal test e le notifiche "Nuovo ordine" inviate agli altri utenti,
 * così i test non lasciano dati nel database di sviluppo.
 */
export const deleteTestOrder = (restaurant) => {
  if (!/^Trattoria E2E [a-z0-9]+$/.test(restaurant)) throw new Error(`Nome di prova non valido: ${restaurant}`);
  // titoli nelle tre lingue: ogni destinatario riceve la notifica nella sua (backend/app/messaging/texts.py)
  const titles = ['Nuovo ordine', 'New order', 'Nuevo pedido', 'Ordine annullato', 'Order cancelled', 'Pedido anulado']
    .map((title) => `'${title}: ${restaurant}'`).join(', ');
  const sql = `DELETE FROM notifications WHERE title IN (${titles});
DELETE FROM orders WHERE restaurant_name = '${restaurant}';`;
  execFileSync('docker', ['compose', 'exec', '-T', 'db', 'sh', '-c', 'psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],
    { cwd: BACKEND_DIR, input: sql, stdio: ['pipe', 'pipe', 'pipe'] });
};
