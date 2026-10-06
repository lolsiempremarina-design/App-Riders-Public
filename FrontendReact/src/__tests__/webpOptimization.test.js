import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('WebP Images Optimization & Bandwidth Performance', () => {
  const assetsDir = path.resolve(__dirname, '../../public/assets/home');
  const iconsDir = path.resolve(assetsDir, 'icons');

  // immagini usate dall'app (Home e barra di navigazione)
  const assetsToCheck = [
    { name: 'ebike', orig: 'ebike.jpg', webp: 'ebike.webp', dir: assetsDir },
    { name: 'hero_cyclist', orig: 'hero_cyclist.jpg', webp: 'hero_cyclist.webp', dir: assetsDir },
    { name: 'nav_bici', orig: 'nav_bici.png', webp: 'nav_bici.webp', dir: iconsDir }
  ];

  it('verifica che ogni risorsa grafica disponga della controparte compressa in formato WebP', () => {
    for (const item of assetsToCheck) {
      const webpPath = path.join(item.dir, item.webp);
      expect(fs.existsSync(webpPath), `Manca la versione WebP per ${item.name} in ${webpPath}`).toBe(true);
    }
  });

  it('garantisce un risparmio significativo di byte con WebP rispetto ai formati originali JPG/PNG', () => {
    let totalOrig = 0;
    let totalWebp = 0;

    for (const item of assetsToCheck) {
      const origPath = path.join(item.dir, item.orig);
      const webpPath = path.join(item.dir, item.webp);

      const origSize = fs.statSync(origPath).size;
      const webpSize = fs.statSync(webpPath).size;

      totalOrig += origSize;
      totalWebp += webpSize;

      expect(webpSize).toBeLessThan(origSize);
    }

    // Risparmio totale atteso di almeno il 30% sul pacchetto immagini
    const savingPercent = ((totalOrig - totalWebp) / totalOrig) * 100;
    expect(savingPercent).toBeGreaterThanOrEqual(30);
  });

  it('verifica l\'integrazione del tag semantico <picture> con fallback in Home.jsx', () => {
    const homePath = path.resolve(__dirname, '../pages/Home.jsx');
    const content = fs.readFileSync(homePath, 'utf8');

    expect(content).toContain('<picture>');
    expect(content).toContain('type="image/webp"');
    expect(content).toContain('/assets/home/ebike.webp');
    expect(content).toContain('/assets/home/hero_cyclist.webp');
  });

  it('verifica l\'integrazione del tag semantico <picture> con fallback in BottomNavbar.jsx', () => {
    const navPath = path.resolve(__dirname, '../components/BottomNavbar.jsx');
    const content = fs.readFileSync(navPath, 'utf8');

    expect(content).toContain('<picture>');
    expect(content).toContain('/assets/home/icons/nav_bici.webp');
  });
});
