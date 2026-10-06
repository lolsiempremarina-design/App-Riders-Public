import React, { Component } from 'react';
import { getI18n } from '../context/i18n';
import { isReloadingForUpdate } from '../utils/chunkReload';

/** Lingua scelta dall'utente (la pagina di errore non dipende dal contesto, che potrebbe essere rotto). */
const errorTexts = () => {
  let language = 'it';
  try {
    language = localStorage.getItem('ror-language') || 'it';
  } catch {
    // localStorage non disponibile: italiano
  }
  return getI18n(language);
};

/**
 * Componente ErrorBoundary di protezione globale per React.
 * Intercetta errori JavaScript imprevisti nell'albero dei componenti figli,
 * registra l'errore e visualizza una UI di fallback elegante, impedendo lo
 * smontaggio dell'intera applicazione e schermate bianche.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[RoR ErrorBoundary] Errore critico catturato:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    } else {
      window.location.href = '/';
    }
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      const t = errorTexts();

      // pagina della versione precedente non più sul server: la ricarica è già partita (utils/chunkReload.js),
      // niente schermata di errore per l'istante che manca
      if (isReloadingForUpdate()) {
        return (
          <div role="status" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 20px', background: 'var(--bg-app-shell, #0B0F17)', color: 'var(--text-muted, #94A3B8)', fontFamily: 'var(--font-main, "Plus Jakarta Sans", sans-serif)', textAlign: 'center' }}>
            {t.errUpdating || "Aggiornamento dell'app in corso..."}
          </div>
        );
      }

      return (
        <div
          role="alert"
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px 20px',
            background: 'var(--bg-app-shell, #0B0F17)',
            color: 'var(--text-main, #FFFFFF)',
            fontFamily: 'var(--font-main, "Plus Jakarta Sans", sans-serif)',
            textAlign: 'center'
          }}
        >
          {/* ICONA SCUDO DI PROTEZIONE / ATTENZIONE */}
          <div
            style={{
              width: '68px',
              height: '68px',
              borderRadius: '24px',
              background: 'rgba(239, 68, 68, 0.12)',
              border: '2px solid rgba(239, 68, 68, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '18px',
              color: 'var(--text-danger)'
            }}
          >
            <svg
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>

          <span
            style={{
              fontSize: '0.72rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '1px',
              color: 'var(--text-danger)',
              marginBottom: '6px'
            }}
          >
            {t.errBadge || 'Errore'}
          </span>

          <h2
            style={{
              fontSize: '1.35rem',
              fontWeight: 800,
              margin: '0 0 10px 0',
              color: 'var(--text-main, #FFFFFF)'
            }}
          >
            {t.errTitle || 'Si è verificato un imprevisto'}
          </h2>

          <p
            style={{
              fontSize: '0.86rem',
              color: 'var(--text-muted, #94A3B8)',
              maxWidth: '380px',
              lineHeight: 1.45,
              margin: '0 0 24px 0'
            }}
          >
            {t.errBody || 'Questa schermata si è interrotta: ricarica la schermata o torna alla Home.'}
          </p>

          {/* dettagli tecnici solo in sviluppo: agli utenti non si mostrano messaggi interni */}
          {import.meta.env.DEV && this.state.error && (
            <pre style={{ fontSize: '11px', color: 'var(--text-danger)', maxWidth: '100%', overflow: 'auto', textAlign: 'left', margin: '0 0 16px 0', whiteSpace: 'pre-wrap' }}>
              {this.state.error.toString()}
              {this.state.errorInfo?.componentStack}
            </pre>
          )}

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              width: '100%',
              maxWidth: '280px'
            }}
          >
            <button
              onClick={this.handleReload}
              style={{
                height: '46px',
                borderRadius: '16px',
                border: 'none',
                background: 'var(--ror-cyan, #9BE191)',
                color: '#000000',
                fontWeight: 800,
                fontSize: '0.88rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(155, 225, 145, 0.35)',
                transition: 'transform 0.15s ease'
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
              <span>{t.errReload || 'Ricarica schermata'}</span>
            </button>

            <button
              onClick={this.handleReset}
              style={{
                height: '46px',
                borderRadius: '16px',
                border: '1px solid var(--border-light, rgba(255,255,255,0.12))',
                background: 'var(--bg-card, #131A26)',
                color: 'var(--text-main, #FFFFFF)',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              <span>{t.errHome || 'Torna alla Home'}</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}