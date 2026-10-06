import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';

/**
 * Componente PushBanner.
 * Visualizza un banner di notifica Push nativo in stile Instagram/iOS
 * con animazione a molla dall'alto, sfocatura glassmorphic ed azione al click.
 */
export const PushBanner = () => {
  const { pushBanner, hidePushNotification } = useApp();
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    if (pushBanner?.visible) {
      setIsLeaving(false);
    }
  }, [pushBanner?.visible]);

  if (!pushBanner || (!pushBanner.visible && !isLeaving)) return null;

  const handleDismiss = (e) => {
    e?.stopPropagation();
    setIsLeaving(true);
    if ('vibrate' in navigator) navigator.vibrate(15);
    setTimeout(() => {
      hidePushNotification();
      setIsLeaving(false);
    }, 280);
  };

  return (
    <div
      className={`push-banner-overlay ${isLeaving ? 'leaving' : 'entering'}`}
      onClick={handleDismiss}
      role="banner"
      aria-live="assertive"
    >
      <div className="push-banner-card">
        {/* ICONA E-BIKE / NOTIFICA INSPIRATA AL HOME BUTTON & LOGO ROR */}
        <div className="push-banner-icon">
          <picture>
            <source srcSet="/assets/home/icons/nav_bici.webp" type="image/webp" />
            <img
              src="/assets/home/icons/nav_bici.png"
              alt="RoR Icona Bici"
              style={{ width: '22px', height: '22px', objectFit: 'contain' }}
              onError={(e) => {
                e.target.onerror = null;
                e.target.style.display = 'none';
                if (e.target.nextSibling) e.target.nextSibling.style.display = 'block';
              }}
            />
          </picture>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#000000"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ display: 'none' }}
          >
            <circle cx="5.5" cy="17.5" r="3.5" />
            <circle cx="18.5" cy="17.5" r="3.5" />
            <circle cx="15" cy="4.5" r="1.5" fill="#000000" />
            <path d="M12 17.5V14l-3-3 4-3 2 3h2.5" />
          </svg>
        </div>

        {/* CONTENUTO TESTUALE NOTIFICA PUSH */}
        <div className="push-banner-content">
          <div className="push-banner-header">
            <span className="push-banner-appname">Rider of Riders</span>
            <span className="push-banner-dot">•</span>
            <span className="push-banner-time">ora</span>
          </div>
          <h4 className="push-banner-title">{pushBanner.title}</h4>
          <p className="push-banner-body">{pushBanner.body}</p>
        </div>

        {/* PULSANTE DI CHIUSURA RAPIDA */}
        <button
          className="push-banner-close"
          onClick={handleDismiss}
          aria-label="Chiudi notifica"
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
