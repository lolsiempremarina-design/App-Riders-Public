// Genera le icone PNG della PWA (public/icons/) e dell'app Android (android/app/src/main/res/mipmap-*)
// con il logo RoR, renderizzato dal browser.
// Uso (da FrontendReact/): node scripts/generate-icons.mjs   (usa Edge: E2E_BROWSER_CHANNEL=msedge)
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'public/icons');
mkdirSync(out, { recursive: true });

const font = readFileSync(resolve(root, 'node_modules/@fontsource/audiowide/files/audiowide-latin-400-normal.woff2')).toString('base64');

// maskable: il contenuto resta nell'area sicura centrale (80%), lo sfondo arriva ai bordi
const ICONS = [
  { name: 'icon-192.png', size: 192, radius: 0.22, scale: 1 },
  { name: 'icon-512.png', size: 512, radius: 0.22, scale: 1 },
  { name: 'icon-maskable-512.png', size: 512, radius: 0, scale: 0.78 },
  { name: 'apple-touch-icon.png', size: 180, radius: 0, scale: 0.9 }
].map((icon) => ({ ...icon, path: resolve(out, icon.name) }));

// Android: icona classica (48dp, angoli arrotondati), rotonda e primo piano dell'icona adattiva (108dp, sfondo
// trasparente: il colore di sfondo è ic_launcher_background; il logo resta nella zona sicura centrale di 66dp)
const androidRes = resolve(root, 'android/app/src/main/res');
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
if (existsSync(androidRes)) {
  for (const [density, factor] of Object.entries(DENSITIES)) {
    const dir = resolve(androidRes, `mipmap-${density}`);
    ICONS.push(
      { path: resolve(dir, 'ic_launcher.png'), size: 48 * factor, radius: 0.22, scale: 1 },
      { path: resolve(dir, 'ic_launcher_round.png'), size: 48 * factor, radius: 0.5, scale: 0.92 },
      { path: resolve(dir, 'ic_launcher_foreground.png'), size: 108 * factor, radius: 0, scale: 0.64, transparent: true }
    );
  }
}

const svg = ({ size, radius, scale, transparent }) => {
  const r = size * radius;
  const s = size * scale;
  const o = (size - s) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${transparent ? '' : `<rect width="${size}" height="${size}" rx="${r}" fill="#0B0F17"/>`}
  <g transform="translate(${o} ${o}) scale(${s / 100})">
    <circle cx="27" cy="67" r="10" fill="none" stroke="#9BE191" stroke-width="4"/>
    <circle cx="73" cy="67" r="10" fill="none" stroke="#9BE191" stroke-width="4"/>
    <path d="M27 67 L41 45 L60 45 L73 67 M41 45 L50 67 L60 45 M60 45 L57 37 M52 37 h10 M41 45 L38 38 M34 38 h8" fill="none" stroke="#9BE191" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="50" y="30" text-anchor="middle" font-family="Audiowide" font-size="24" fill="#FFFFFF">RoR</text>
  </g>
</svg>`;
};

// `node scripts/generate-icons.mjs android` rigenera solo quelle dell'app Android
const selected = process.argv[2] === 'android' ? ICONS.filter((icon) => icon.path.startsWith(androidRes)) : ICONS;

const browser = await chromium.launch({ channel: process.env.E2E_BROWSER_CHANNEL || undefined });
const page = await browser.newPage();
for (const icon of selected) {
  await page.setViewportSize({ width: icon.size, height: icon.size });
  await page.setContent(`<!doctype html><style>
    @font-face { font-family: Audiowide; src: url(data:font/woff2;base64,${font}) format('woff2'); }
    html, body { margin: 0; background: transparent; }
  </style>${svg(icon)}`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: icon.path, omitBackground: icon.radius > 0 || Boolean(icon.transparent) });
  console.log('scritto', icon.path.slice(root.length + 1));
}
await browser.close();
