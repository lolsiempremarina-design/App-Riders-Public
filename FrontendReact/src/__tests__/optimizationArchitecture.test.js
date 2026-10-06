import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Frontend Optimization & Quality Architecture Tests', () => {
  const srcDir = path.resolve(__dirname, '..');
  const pagesDir = path.resolve(srcDir, 'pages');

  it('garantisce che nessuna pagina utilizzi URL insicuri javascript:void(0)', () => {
    const pageFiles = fs.readdirSync(pagesDir).filter((f) => f.endsWith('.jsx'));
    for (const file of pageFiles) {
      const content = fs.readFileSync(path.join(pagesDir, file), 'utf8');
      expect(content).not.toContain('javascript:void(0)');
      expect(content).not.toContain('javascript:;');
    }
  });

  it('verifica l\'abilitazione dei future flag di transizione v7 in App.jsx', () => {
    const appContent = fs.readFileSync(path.join(srcDir, 'App.jsx'), 'utf8');
    expect(appContent).toContain('v7_startTransition: true');
    expect(appContent).toContain('v7_relativeSplatPath: true');
  });

  it('verifica la presenza di isMounted per prevenire memory leak in Register.jsx', () => {
    const regContent = fs.readFileSync(path.join(pagesDir, 'Register.jsx'), 'utf8');
    expect(regContent).toContain('let isMounted = true');
    expect(regContent).toContain('isMounted = false');
  });

  it('le pagine collegate al backend non contengono dati simulati', () => {
    const pages = ['Statistiche', 'VelocitaMedia', 'TempoTotale', 'Gruppi', 'GruppoChat', 'Mappa', 'Percorsi',
      'Home', 'Consegne', 'PanoramicaUscite', 'Notifiche', 'PunteggioTotale', 'BikeHub', 'Altro'];
    pages.forEach((page) => {
      const content = fs.readFileSync(path.join(pagesDir, `${page}.jsx`), 'utf8');
      expect(content, page).not.toContain('Math.random');
      expect(content, page).not.toMatch(/SIMULATION|triggerFleetSimulation|chat\.whatsapp\.com|PARTNER_RESTAURANTS|overpass-api/i);
      // resti dei dati inventati (ristoranti, rider fittizio, premi, sensori, telefoni finti)
      expect(content, page).not.toMatch(/Spontini|Blockchain|MPU-6050|IBAN|\+3902000/);
    });
    // la chat di gruppo non salva più messaggi finti nel browser
    expect(fs.readFileSync(path.join(pagesDir, 'GruppoChat.jsx'), 'utf8')).not.toContain('localStorage');
  });

  it('nessun file dell\'app (pagine, componenti, testi, traduzioni) contiene contenuti inventati', () => {
    const files = [];
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!['__tests__', 'test'].includes(entry.name)) walk(full);
      } else if (/\.(jsx?|css)$/.test(entry.name)) {
        files.push(full);
      }
    });
    walk(srcDir);
    expect(files.length).toBeGreaterThan(50);
    files.forEach((file) => {
      const content = fs.readFileSync(file, 'utf8');
      const name = path.relative(srcDir, file);
      // persona, assicurazione, hardware IoT, pagamenti e servizi che l'app non ha
      expect(content, name).not.toMatch(/Kasko|Blockchain|Infocert|MPU-?6050|IBAN|\+39 ?02 ?000|Sinie?stri|RoR Partner|Bluetooth|\b4G\b|smart bike IoT|Conti Collegati|847 km|Francesca/i);
    });
  });

  it('garantisce la configurazione di manualChunks e asset WebP in vite.config.js', () => {
    const viteConfig = fs.readFileSync(path.resolve(srcDir, '../vite.config.js'), 'utf8');
    expect(viteConfig).toContain('manualChunks');
    expect(viteConfig).toContain('vendor-react');
    // le immagini WebP di public/ entrano nella precache tramite globPatterns (webp incluso)
    expect(viteConfig).toMatch(/globPatterns: \[[^\]]*webp/);
    expect(fs.existsSync(path.resolve(srcDir, '../public/assets/home/ebike.webp'))).toBe(true);
    expect(fs.existsSync(path.resolve(srcDir, '../public/assets/home/hero_cyclist.webp'))).toBe(true);
    // includeAssets duplicherebbe file già presi da globPatterns e bloccherebbe la precache di Workbox
    expect(viteConfig).not.toMatch(/^\s*includeAssets\s*:/m);
  });
});
