// Controllo dopo la build: la precache del service worker non deve contenere lo stesso file due volte.
// Workbox in quel caso lancia "add-to-cache-list-conflicting-entries" e il service worker resta
// senza cache: l'app installata non si apre senza rete. Eseguito da `npm run build`.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const sw = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../dist/sw.js'), 'utf8');
const urls = [...sw.matchAll(/\{url:"([^"]+)"/g)].map((m) => m[1].replace(/^\//, ''));
const seen = new Set();
const duplicates = urls.filter((url) => (seen.has(url) ? true : (seen.add(url), false)));

if (!urls.includes('index.html')) {
  console.error('sw.js: index.html non è nella precache (la PWA non si aprirebbe offline).');
  process.exit(1);
}
if (duplicates.length) {
  console.error(`sw.js: file duplicati nella precache: ${[...new Set(duplicates)].join(', ')}`);
  process.exit(1);
}
console.log(`sw.js: precache ok (${urls.length} file, nessun duplicato).`);
