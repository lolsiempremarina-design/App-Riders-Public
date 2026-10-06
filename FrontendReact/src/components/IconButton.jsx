import React from 'react';

/**
 * Componente Atomico IconButton.
 * Pulsante circolare riutilizzabile per icone (Torna indietro, Profilo, Notifiche, Tema, Chiudi).
 *
 * @param {Object} props
 * @param {'back' | 'profile' | 'notif' | 'theme' | 'close'} props.variant - Variante visiva dell'icona da renderizzare.
 * @param {Function} props.onClick - Funzione gestore del click.
 * @param {string} props.ariaLabel - Etichetta di accessibilità per screen reader.
 * @param {string} [props.className=''] - Classi CSS aggiuntive opzionali.
 * @param {string} [props.id] - ID univoco dell'elemento.
 * @param {Object} [props.style] - Stili inline opzionali.
 */
export const IconButton = ({ variant, onClick, ariaLabel, className = '', id, style }) => {
  /**
   * Renderizza l'icona SVG vettoriale corrispondente alla variante richiesta.
   */
  const renderIcon = () => {
    switch (variant) {
      case 'back':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        );
      case 'profile':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        );
      case 'notif':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        );
      case 'theme':
        return (
          <svg className="icon-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        );
      case 'close':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        );
      default:
        return null;
    }
  };

  /**
   * Determina la classe CSS corretta definita nel sistema di design.
   */
  const getVariantClass = () => {
    switch (variant) {
      case 'back': return 'icon-btn back-btn';
      case 'profile': return 'icon-btn profile-btn';
      case 'notif': return 'icon-btn notif-btn right-small-btn';
      case 'theme': return 'theme-btn';
      case 'close': return 'modal-close';
      default: return 'icon-btn';
    }
  };

  return (
    <button
      className={`${getVariantClass()} ${className}`.trim()}
      id={id}
      aria-label={ariaLabel}
      onClick={onClick}
      style={style}
      type="button"
    >
      {renderIcon()}
    </button>
  );
};

