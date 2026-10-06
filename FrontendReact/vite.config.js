/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Percorsi gestiti dal backend (Flask/FastAPI via Nginx): non devono mai essere
 * serviti dalla SPA né dal fallback del Service Worker.
 */
const BACKEND_PATHS = [/^\/api\//, /^\/ws\//, /^\/web(\/|$)/, /^\/stream/, /^\/session\//];

export default defineConfig(({ mode }) => {
  // In sviluppo (npm run dev) le chiamate a /api vengono inoltrate al backend Docker (Nginx HTTPS).
  const env = loadEnv(mode, process.cwd(), '');
  const backendTarget = env.VITE_DEV_BACKEND_URL || 'https://localhost';
  const backendProxy = {
    target: backendTarget,
    changeOrigin: true,
    secure: false,
    // Flask-WTF verifica che il Referer HTTPS coincida con l'host del backend
    headers: { Referer: `${backendTarget}/` }
  };

  return {
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // Niente includeAssets: le immagini di public/ (assets/home/*.jpg|webp, icons/*.png) sono già
      // prese da globPatterns. Un file elencato due volte fa fallire la precache di Workbox
      // (add-to-cache-list-conflicting-entries) e il service worker resta senza cache né modalità offline.
      // Per lo stesso motivo le icone del manifest non si aggiungono una seconda volta.
      includeManifestIcons: false,
      // Il browser chiede il manifest senza cookie: dietro il tunnel ngrok (prove dal telefono) riceverebbe
      // la pagina di avviso di ngrok invece del JSON. Con le credenziali il cookie "Visit Site" viene inviato.
      useCredentials: true,
      manifest: {
        short_name: 'RoR',
        name: 'RoR – Rider of Riders',
        description: 'Percorsi GPS, SOS, consegne e gruppi per chi lavora in bici',
        lang: 'it',
        theme_color: '#9BE191',
        background_color: '#0B0F17',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', type: 'image/png', sizes: '192x192' },
          { src: '/icons/icon-512.png', type: 'image/png', sizes: '512x512' },
          { src: '/icons/icon-maskable-512.png', type: 'image/png', sizes: '512x512', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,woff2}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: BACKEND_PATHS,
        runtimeCaching: [
          {
            // Caching tessere mappa Leaflet (OpenStreetMap)
            urlPattern: /^https:\/\/tile\.openstreetmap\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'ror-leaflet-tiles-v1',
              expiration: {
                maxEntries: 1000,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 giorni
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api': backendProxy,
      '/stream': backendProxy,
      '/session/': backendProxy,
      '/ws': { ...backendProxy, ws: true }
    }
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'vendor-react';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
          }
        }
      }
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    css: false,
    // Un jsdom per file (56) occupava il 70% del tempo e su un PC carico due o tre test a caso
    // superavano i 5 secondi predefiniti: fallivano test diversi a ogni esecuzione, pur passando
    // da soli. vmThreads riusa l'ambiente per worker mantenendo l'isolamento fra file.
    pool: 'vmThreads',
    testTimeout: 15000,
    hookTimeout: 15000
  }
  };
});
