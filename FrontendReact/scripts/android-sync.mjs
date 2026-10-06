// Prepara il progetto Android (Capacitor) con l'indirizzo del server che l'app deve aprire.
//   node scripts/android-sync.mjs         → CAP_SERVER_URL (variabile d'ambiente o .env): build per i tester
//   node scripts/android-sync.mjs local   → https://localhost:8443: emulatore con `adb reverse tcp:8443 tcp:443`
//                                           (solo build di debug: si fidano del certificato di sviluppo)
// Scrive native-shell/offline.html (pagina "nessuna connessione" con il pulsante Riprova) e lancia `cap sync android`.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LOCAL_SERVER_URL = 'https://localhost:8443';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Valore di una variabile nel file .env del frontend (senza dipendenze: KEY=valore, # commenti). */
export const readDotEnv = (text, key) => {
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && match[1] === key) return match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return '';
};

export const resolveServerUrl = (mode, env = process.env, dotEnvText = '') => {
  const url = (mode === 'local' ? LOCAL_SERVER_URL : env.CAP_SERVER_URL || readDotEnv(dotEnvText, 'CAP_SERVER_URL'))
    .replace(/\/+$/, '');
  if (!/^https:\/\/[^/\s]+$/.test(url)) {
    throw new Error('CAP_SERVER_URL mancante o non valido in .env (es. CAP_SERVER_URL=https://nome.ngrok-free.dev)');
  }
  return url;
};

const main = () => {
  const mode = process.argv[2] === 'local' ? 'local' : 'server';
  const envFile = resolve(root, '.env');
  const serverUrl = resolveServerUrl(mode, process.env, existsSync(envFile) ? readFileSync(envFile, 'utf8') : '');

  const template = readFileSync(resolve(root, 'native-shell/offline.template.html'), 'utf8');
  writeFileSync(resolve(root, 'native-shell/offline.html'), template.replaceAll('%SERVER_URL%', serverUrl));

  console.log(`App Android → ${serverUrl}`);
  // comando fisso (nessun argomento dell'utente): su Windows npx è un .cmd e serve la shell
  const result = spawnSync('npx cap sync android', {
    cwd: root, stdio: 'inherit', shell: true, env: { ...process.env, CAP_SERVER_URL: serverUrl }
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
  if (mode === 'local') {
    console.log('\nEmulatore: adb reverse tcp:8443 tcp:443   (inoltra https://localhost:8443 al Nginx di Docker)');
  }
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
