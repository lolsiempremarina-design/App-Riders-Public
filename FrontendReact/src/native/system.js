/**
 * Funzioni di sistema dell'app Android (plugin nativo RorSystem, android/.../RorSystemPlugin.java).
 */
import { registerPlugin } from '@capacitor/core';

const RorSystem = registerPlugin('RorSystem');

/** Nome di file accettato dall'app: lettere, numeri, punto, trattino e trattino basso. */
export const safeFilename = (name) => String(name || 'file').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 120);

/**
 * Salva o invia un file di testo (GPX, CSV, JSON) con il menu "Condividi" di Android:
 * nella WebView dell'app i download non funzionano.
 */
export const shareTextFile = (filename, text, mimeType, title) =>
  RorSystem.shareFile({ filename: safeFilename(filename), text, mimeType, title: title || filename });

/** Avviso di caduta con l'app in background: tocco → si apre l'app con il conto alla rovescia. */
export const showFallAlert = (title, body) => RorSystem.showFallAlert({ title, body }).catch(() => {});

export const cancelFallAlert = () => RorSystem.cancelFallAlert().catch(() => {});
