import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
// Font serviti dallo stesso dominio (niente Google Fonts: nessuna richiesta a terzi)
import '@fontsource/audiowide/latin-400.css';
import '@fontsource/plus-jakarta-sans/latin-400.css';
import '@fontsource/plus-jakarta-sans/latin-500.css';
import '@fontsource/plus-jakarta-sans/latin-600.css';
import '@fontsource/plus-jakarta-sans/latin-700.css';
import '@fontsource/plus-jakarta-sans/latin-800.css';
import '@fontsource/syne/latin-700.css';
import '@fontsource/syne/latin-800.css';
import { installChunkReload } from './utils/chunkReload';

// dopo un aggiornamento del server, una pagina della versione precedente che non c'è più ricarica l'app
installChunkReload();

/**
 * Punto d'ingresso principale dell'applicazione React Rider of Riders (RoR).
 * Inizializza il DOM virtuale di React e registra il Service Worker per il funzionamento offline.
 */
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

/**
 * Pulizia automatica delle cache del Service Worker in ambiente di sviluppo (DEV)
 * per garantire Hot Module Replacement (HMR) istantaneo senza interferenze.
 * In produzione, VitePWA registra automaticamente il Service Worker generato.
 */
if ('serviceWorker' in navigator && import.meta.env.DEV) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const reg of registrations) {
      reg.unregister();
    }
  });
  if ('caches' in window) {
    caches.keys().then((names) => {
      names.forEach((name) => caches.delete(name));
    });
  }
}



