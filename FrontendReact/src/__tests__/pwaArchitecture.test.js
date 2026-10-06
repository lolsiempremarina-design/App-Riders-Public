import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');

describe('PWA & Service Worker Architecture', () => {
  it('contiene la configurazione VitePWA con la cache delle tessere della mappa (stesso host usato da Leaflet)', () => {
    const content = read('../../vite.config.js');
    const mappa = read('../pages/Mappa.jsx');

    expect(content).toContain('VitePWA');
    expect(content).toContain('ror-leaflet-tiles-v1');
    expect(content).toContain('CacheFirst');
    // la regola di cache deve corrispondere all'URL delle tessere richiesto dalla mappa
    const tileBase = /'(https:\/\/[^']*openstreetmap\.org\/)\{z\}/.exec(mappa)[1];
    const pattern = /urlPattern: \/(.*)\/i,/.exec(content)[1];
    expect(new RegExp(pattern, 'i').test(`${tileBase}15/17500/11600.png`)).toBe(true);
    // niente CDN o Google Fonts: Leaflet e font fanno parte della build
    expect(content).not.toMatch(/cdnjs|fonts\.googleapis/);
    expect(mappa).not.toContain('cdnjs');
  });

  it('il manifesto PWA (generato da vite-plugin-pwa) è standalone e ha icone PNG vere', () => {
    const content = read('../../vite.config.js');
    const html = read('../../index.html');
    expect(content).toContain("display: 'standalone'");
    expect(content).toContain("start_url: '/'");
    expect(content).toContain("theme_color: '#9BE191'");
    expect(content).toContain("purpose: 'maskable'");
    ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'].forEach((icon) => {
      expect(content + html).toContain(icon);
      const png = fs.readFileSync(path.resolve(__dirname, '../../public/icons', icon));
      expect(png.subarray(1, 4).toString()).toBe('PNG');
    });
    // un solo manifesto: niente public/manifest.json duplicato
    expect(fs.existsSync(path.resolve(__dirname, '../../public/manifest.json'))).toBe(false);
  });

  it('index.html include i tag meta per PWA e supporto iOS standalone, senza risorse di terzi', () => {
    const html = read('../../index.html');

    expect(html).toContain('apple-mobile-web-app-capable');
    expect(html).toContain('apple-mobile-web-app-status-bar-style');
    expect(html).toContain('theme-color');
    expect(html).toContain('viewport');
    // accessibilità: lo zoom non va bloccato
    expect(html).not.toMatch(/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\.0)?\b/);
    expect(html).not.toMatch(/fonts\.googleapis|fonts\.gstatic|cdnjs/);
  });

  it('non include più file sw.js obsoleti hardcoded nella cartella public', () => {
    const publicSwPath = path.resolve(__dirname, '../../public/sw.js');
    expect(fs.existsSync(publicSwPath)).toBe(false);
  });
});
