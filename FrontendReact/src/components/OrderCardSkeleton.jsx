import React from 'react';

/**
 * Componente OrderCardSkeleton.
 * Visualizza schede placeholder animate (effetto shimmer a 60fps) durante
 * il caricamento o la sincronizzazione in tempo reale degli ordini hot con il backend.
 *
 * @param {object} props
 * @param {number} [props.count=3] - Numero di schede skeleton da visualizzare (default: 3)
 * @param {string} [props.className=''] - Classi CSS addizionali
 */
export const OrderCardSkeleton = ({ count = 3, className = '' }) => {
  const items = Array.from({ length: Math.max(1, count) }, (_, idx) => idx);

  return (
    <div
      className={`order-skeleton-container ${className}`}
      role="status"
      aria-label="Caricamento ordini in corso..."
      aria-busy="true"
      style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
      data-testid="order-card-skeleton-group"
    >
      {items.map((key) => (
        <div
          key={key}
          className="order-card-skeleton"
          data-testid="order-card-skeleton"
          style={{
            background: 'var(--bg-card)',
            borderRadius: '20px',
            padding: '14px',
            border: '1px solid var(--border-card)',
            boxShadow: 'var(--shadow-card)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}
        >
          {/* RIGA 1: NOME RISTORANTE & BADGE TIMER CONTO ALLA ROVESCIA */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div
              className="skeleton-shimmer"
              style={{
                height: '18px',
                width: `${50 + (key % 3) * 10}%`,
                borderRadius: '8px'
              }}
            />
            <div
              className="skeleton-shimmer"
              style={{
                height: '20px',
                width: '84px',
                borderRadius: '12px'
              }}
            />
          </div>

          {/* RIGA 2: INDIRIZZO & DISTANZA KM */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              className="skeleton-shimmer"
              style={{
                width: '14px',
                height: '14px',
                borderRadius: '50%'
              }}
            />
            <div
              className="skeleton-shimmer"
              style={{
                height: '14px',
                width: `${60 + (key % 2) * 15}%`,
                borderRadius: '6px'
              }}
            />
          </div>

          {/* RIGA 3: BOX DETTAGLIO PIATTI / MENU CONSEGNA */}
          <div
            style={{
              background: 'var(--bg-card-subtle)',
              padding: '8px 10px',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <div
              className="skeleton-shimmer"
              style={{
                width: '14px',
                height: '14px',
                borderRadius: '3px'
              }}
            />
            <div
              className="skeleton-shimmer"
              style={{
                height: '13px',
                width: `${45 + (key % 3) * 12}%`,
                borderRadius: '6px'
              }}
            />
          </div>

          {/* RIGA 4: PREZZO / BONUS & PULSANTE DI ACCETTAZIONE */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                className="skeleton-shimmer"
                style={{
                  height: '24px',
                  width: '65px',
                  borderRadius: '8px'
                }}
              />
              <div
                className="skeleton-shimmer"
                style={{
                  height: '16px',
                  width: '50px',
                  borderRadius: '6px'
                }}
              />
            </div>
            <div
              className="skeleton-shimmer"
              style={{
                height: '32px',
                width: '88px',
                borderRadius: '16px'
              }}
            />
          </div>
        </div>
      ))}

      <style>{`
        .skeleton-shimmer {
          background: linear-gradient(
            90deg,
            rgba(224, 237, 224, 0.6) 25%,
            rgba(244, 248, 243, 0.95) 50%,
            rgba(224, 237, 224, 0.6) 75%
          );
          background-size: 200% 100%;
          animation: rorOrderShimmer 1.5s infinite linear;
        }

        body.theme-dark .skeleton-shimmer {
          background: linear-gradient(
            90deg,
            rgba(26, 34, 52, 0.6) 25%,
            rgba(36, 46, 66, 0.95) 50%,
            rgba(26, 34, 52, 0.6) 75%
          );
          background-size: 200% 100%;
          animation: rorOrderShimmer 1.5s infinite linear;
        }

        @keyframes rorOrderShimmer {
          0% {
            background-position: -200% 0;
          }
          100% {
            background-position: 200% 0;
          }
        }
      `}</style>
    </div>
  );
};
