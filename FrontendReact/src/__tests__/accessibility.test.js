import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const srcDir = path.resolve(__dirname, '..');
const jsxFiles = ['pages', 'components'].flatMap((dir) => fs.readdirSync(path.join(srcDir, dir))
  .filter((f) => f.endsWith('.jsx'))
  .map((f) => path.join(dir, f)));

describe('Accessibilità e lingue (fase 6.1)', () => {
  it('i testi visibili passano dalle traduzioni (niente frasi fisse in italiano nel JSX)', () => {
    // nomi propri e marchi che restano uguali in tutte le lingue
    const allowed = ['OpenStreetMap', 'Community Bike Archive', 'Rider of Riders'];
    const found = [];
    jsxFiles.filter((f) => !f.endsWith('DevToolbar.jsx')).forEach((file) => {
      const content = fs.readFileSync(path.join(srcDir, file), 'utf8');
      const matches = content.match(/>\s*[A-Za-zÀ-ú][^<>{}]{3,}[a-zà-ú.!?)]\s*</g) || [];
      matches.map((m) => m.slice(1, -1).trim())
        .filter((text) => !allowed.includes(text))
        .forEach((text) => found.push(`${file}: ${text}`));
    });
    expect(found).toEqual([]);
  });

  it('le card cliccabili non hanno un aria-label diverso dal testo visibile', () => {
    // WCAG 2.5.3: chi usa i comandi vocali pronuncia il testo che vede
    ['components/MenuItemCard.jsx', 'pages/Statistiche.jsx', 'pages/PunteggioTotale.jsx'].forEach((file) => {
      const content = fs.readFileSync(path.join(srcDir, file), 'utf8');
      expect(content, file).not.toMatch(/role="button"[^>]*aria-label=|aria-label=[^>]*role="button"/);
    });
    expect(fs.readFileSync(path.join(srcDir, 'pages/Profilo.jsx'), 'utf8')).not.toContain('aria-label="Disconnetti Account"');
  });

  it('i testi di stato usano colori con contrasto sufficiente in entrambi i temi', () => {
    const variables = fs.readFileSync(path.join(srcDir, 'styles/core/variables.css'), 'utf8');
    expect(variables).toContain('--text-success');
    expect(variables).toContain('--text-danger');
    // verde #10B981 / #059669 e rosso #EF4444 come colore del testo: sotto 4.5:1 sul bianco
    jsxFiles.forEach((file) => {
      const content = fs.readFileSync(path.join(srcDir, file), 'utf8');
      expect(content, file).not.toMatch(/\bcolor: '#(10B981|059669|EF4444)'/);
    });
  });
});
