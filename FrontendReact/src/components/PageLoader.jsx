import React from 'react';

export const PageLoader = () => {
  return (
    <div
      className="page-skeleton-loader"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        width: '100%',
        padding: '24px 18px 90px 18px',
        boxSizing: 'border-box'
      }}
    >
      {/* TITOLO INTESTAZIONE SKELETON */}
      <div
        className="skeleton-pulse"
        style={{
          width: '55%',
          height: '28px',
          borderRadius: '12px'
        }}
      />

      {/* SCHEDA METEO SKELETON */}
      <div
        className="skeleton-pulse"
        style={{
          width: '100%',
          height: '84px',
          borderRadius: '26px'
        }}
      />

      {/* SCHEDA PRINCIPALE E-BIKE SKELETON */}
      <div
        className="skeleton-pulse"
        style={{
          width: '100%',
          height: '240px',
          borderRadius: '28px'
        }}
      />

      {/* SCHEDA SESSIONE HERO SKELETON */}
      <div
        className="skeleton-pulse"
        style={{
          width: '100%',
          height: '100px',
          borderRadius: '24px'
        }}
      />

      <style>{`
        .skeleton-pulse {
          background: linear-gradient(
            90deg,
            rgba(224, 237, 224, 0.6) 25%,
            rgba(244, 248, 243, 0.95) 50%,
            rgba(224, 237, 224, 0.6) 75%
          );
          background-size: 200% 100%;
          animation: rorShimmer 1.5s infinite linear;
        }

        body.theme-dark .skeleton-pulse {
          background: linear-gradient(
            90deg,
            rgba(26, 34, 52, 0.6) 25%,
            rgba(36, 46, 66, 0.95) 50%,
            rgba(26, 34, 52, 0.6) 75%
          );
          background-size: 200% 100%;
          animation: rorShimmer 1.5s infinite linear;
        }

        @keyframes rorShimmer {
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

