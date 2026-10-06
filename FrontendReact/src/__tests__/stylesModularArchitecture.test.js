import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Modular CSS Architecture Integrity Test', () => {
  const stylesDir = path.join(process.cwd(), 'src', 'styles');

  const expectedModules = [
    'core/variables.css',
    'core/reset.css',
    'core/layout.css',
    'components/header.css',
    'components/navbar.css',
    'components/feedback.css',
    'pages/home.css',
    'pages/telemetria.css',
    'pages/consegne.css',
    'pages/mappa.css',
    'pages/community.css',
    'pages/impostazioni.css',
    'pages/auth.css'
  ];

  it('master index.css exists and imports all 13 modules', () => {
    const indexPath = path.join(stylesDir, 'index.css');
    expect(fs.existsSync(indexPath)).toBe(true);

    const indexContent = fs.readFileSync(indexPath, 'utf8');
    expectedModules.forEach((mod) => {
      expect(indexContent).toContain(`./${mod}`);
    });
  });

  it('all modular stylesheets exist and contain valid CSS content', () => {
    expectedModules.forEach((mod) => {
      const fullPath = path.join(stylesDir, mod);
      expect(fs.existsSync(fullPath)).toBe(true);
      const content = fs.readFileSync(fullPath, 'utf8');
      expect(content.trim().length).toBeGreaterThan(50);
    });
  });

  it('core variables define design tokens and dark mode', () => {
    const varsContent = fs.readFileSync(path.join(stylesDir, 'core', 'variables.css'), 'utf8');
    expect(varsContent).toContain('--ror-cyan:');
    expect(varsContent).toContain('--weather-green:');
    expect(varsContent).toContain('body.theme-dark');
  });

  it('ogni variabile CSS usata (var(--...)) è definita: altrimenti bordi, ombre o colori spariscono senza errori', () => {
    // --border-card e --shadow-card erano usate 29 volte senza definizione; --bg-app nella schermata di errore
    // la lasciava sempre scura (con il tema chiaro il titolo non si leggeva)
    const files = [];
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') walk(full);
      } else if (/\.(css|jsx?)$/.test(entry.name)) {
        files.push(fs.readFileSync(full, 'utf8'));
      }
    });
    walk(path.join(process.cwd(), 'src'));
    const source = files.join('\n');
    const defined = new Set([...source.matchAll(/(--[\w-]+)['"]?\s*:/g)].map((m) => m[1]));
    const used = new Set([...source.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]));
    expect(used.size).toBeGreaterThan(20);
    expect([...used].filter((name) => !defined.has(name))).toEqual([]);
  });

  it('le card hanno bordo e ombra in entrambi i temi', () => {
    const varsContent = fs.readFileSync(path.join(stylesDir, 'core', 'variables.css'), 'utf8');
    const dark = varsContent.slice(varsContent.indexOf('body.theme-dark'));
    ['--border-card:', '--shadow-card:'].forEach((token) => {
      expect(varsContent.indexOf(token)).toBeLessThan(varsContent.indexOf('body.theme-dark'));
      expect(dark).toContain(token);
    });
  });

  it('navbar module contains centered sliding pill rules', () => {
    const navContent = fs.readFileSync(path.join(stylesDir, 'components', 'navbar.css'), 'utf8');
    expect(navContent).toContain('.custom-bottom-navbar');
    expect(navContent).toContain('.navbar-inner-wrapper');
    expect(navContent).toContain('.nav-tab-item');
  });

  it('pages modules contain respective page classes', () => {
    const homeContent = fs.readFileSync(path.join(stylesDir, 'pages', 'home.css'), 'utf8');
    expect(homeContent).toContain('.weather-widget-card');
    expect(homeContent).toContain('.ebike-main-card');

    const consegneContent = fs.readFileSync(path.join(stylesDir, 'pages', 'consegne.css'), 'utf8');
    expect(consegneContent).toContain('.consegne-hero-card');

    const authContent = fs.readFileSync(path.join(stylesDir, 'pages', 'auth.css'), 'utf8');
    expect(authContent).toContain('.auth-hero-header');
  });
});
