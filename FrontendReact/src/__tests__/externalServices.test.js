import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PRIVACY_NOTICE } from '../content/privacyNotice';

const srcDir = path.resolve(__dirname, '..');

const sourceFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) return ['__tests__', 'test'].includes(entry.name) ? [] : sourceFiles(full);
  return /\.(jsx?|css)$/.test(entry.name) ? [full] : [];
});

describe('Servizi esterni (fase 6.1)', () => {
  it('l\'app contatta solo i servizi elencati nella pagina Privacy', () => {
    const hosts = new Set();
    sourceFiles(srcDir).forEach((file) => {
      (fs.readFileSync(file, 'utf8').match(/https:\/\/[a-z0-9.-]+\.[a-z]{2,}/gi) || [])
        .forEach((url) => hosts.add(new URL(url).hostname));
    });
    const declared = PRIVACY_NOTICE.it.thirdParty.map(([name, detail]) => `${name} ${detail}`).join(' ');
    // www.openstreetmap.org è solo il link di attribuzione della mappa (lo apre l'utente)
    const undeclared = [...hosts].filter((host) => host !== 'www.openstreetmap.org' && !declared.includes(host));
    expect(undeclared).toEqual([]);
  });

  it('elenco dei comuni e QR delle bici non arrivano più da siti terzi', () => {
    sourceFiles(srcDir).forEach((file) => {
      const content = fs.readFileSync(file, 'utf8');
      expect(content, file).not.toMatch(/raw\.githubusercontent\.com|api\.qrserver\.com/);
    });
    ['it', 'en', 'es'].forEach((lang) => {
      const names = PRIVACY_NOTICE[lang].thirdParty.map(([name]) => name);
      expect(names, lang).not.toContain('GitHub');
      expect(names, lang).not.toContain('api.qrserver.com');
    });
  });
});
