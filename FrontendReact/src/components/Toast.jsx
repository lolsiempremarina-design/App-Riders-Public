import React from 'react';
import { useApp } from '../context/AppContext';

/**
 * Componente Toast.
 * Visualizza un avviso temporaneo in sovrimpressione con icona dinamica (successo, info, avviso)
 * per confermare azioni dell'utente come blocco bike, cambio tema o stato della batteria.
 */
export const Toast = () => {
  const { toast, hideToast } = useApp();

  if (!toast.isOpen) return null;

  /**
   * Renderizza l'icona appropriata in base al tipo di notifica Toast (success, info, warning).
   */
  const renderIcon = () => {
    switch (toast.type) {
      case 'success':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#17d6c9" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        );
      case 'info':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9BE191" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        );
      case 'warning':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <div className={`toast-container active type-${toast.type}`} onClick={hideToast} role="status">
      <div className="toast-pill">
        <span className="toast-icon">{renderIcon()}</span>
        <span className="toast-message">{toast.message}</span>
      </div>
    </div>
  );
};

