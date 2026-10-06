import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

/**
 * Componente OfflineBanner.
 * Notifica visiva galleggiante in cima allo schermo mobile:
 * - Mostra un avviso ambra quando il browser segnala che la rete non è disponibile
 *   (i punti GPS della sessione restano in coda: vedi RideTrackingContext).
 * - Mostra una notifica verde quando la connessione torna.
 */
export const OfflineBanner = () => {
  const { isOnline, showRestoredNotice, setShowRestoredNotice, t } = useApp();
  const [dismissedOffline, setDismissedOffline] = useState(false);

  // Se siamo online e non c'è la notifica di ripristino, non renderizzare nulla
  if (isOnline && !showRestoredNotice) return null;

  // Se il rider ha temporaneamente chiuso l'avviso offline per questa sessione
  if (!isOnline && dismissedOffline) return null;

  const isRestored = isOnline && showRestoredNotice;

  const handleClose = (e) => {
    e?.stopPropagation();
    if (isRestored) {
      setShowRestoredNotice(false);
    } else {
      setDismissedOffline(true);
    }
  };

  return (
    <div
      className={`offline-banner-container ${isRestored ? 'online-restored' : 'offline-active'}`}
      role="status"
      aria-live="polite"
    >
      <div className="offline-banner-content">
        <div className="offline-banner-icon-box">
          {isRestored ? (
            /* Icona connessione ripristinata */
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12.55a11 11 0 0 1 14.08 0"></path>
              <path d="M1.42 9a16 16 0 0 1 21.16 0"></path>
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
              <line x1="12" y1="20" x2="12.01" y2="20"></line>
            </svg>
          ) : (
            /* Icona Wifi Spento / Segnale Assente */
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="1" y1="1" x2="23" y2="23"></line>
              <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
              <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
              <path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path>
              <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
              <line x1="12" y1="20" x2="12.01" y2="20"></line>
            </svg>
          )}
        </div>

        <div className="offline-banner-text">
          <div className="offline-banner-header">
            <span className="offline-banner-badge">
              {isRestored ? (t.onlineBadge || 'ONLINE') : (t.offlineBadge || 'OFFLINE')}
            </span>
            <span className="offline-banner-title">
              {isRestored
                ? (t.onlineRestoredTitle || 'Connessione ripristinata')
                : (t.offlineBannerTitle || 'Sei offline')}
            </span>
          </div>
          <p className="offline-banner-sub">
            {isRestored
              ? (t.onlineRestoredSub || 'L\x27invio dei dati riprende automaticamente.')
              : (t.offlineBannerSub || 'I punti GPS della sessione restano sul telefono e verranno inviati quando torna la rete.')}
          </p>
        </div>

        <button
          className="offline-banner-close-btn"
          onClick={handleClose}
          title="Chiudi avviso"
          aria-label="Chiudi avviso di connessione"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
};
