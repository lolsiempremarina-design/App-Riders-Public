import React from 'react';
import { DevToolbar } from './DevToolbar';
import { BottomNavbar } from './BottomNavbar';
import { Modal } from './Modal';
import { Toast } from './Toast';
import { PushBanner } from './PushBanner';
import { OfflineBanner } from './OfflineBanner';
import { SafetyOverlay } from './SafetyOverlay';

/** Barra di sviluppo: solo con `npm run dev` (o VITE_SHOW_DEVTOOLBAR=true), mai nella build per gli utenti. */
export const SHOW_DEV_TOOLBAR = Boolean(import.meta.env.DEV) || import.meta.env.VITE_SHOW_DEVTOOLBAR === 'true';

/**
 * Componente Wrapper PhoneFrame.
 * Simula la scocca di uno smartphone reale (con notch, fotocamera ed altoparlante)
 * contenente lo schermo principale dell'app, la barra di navigazione inferiore,
 * i messaggi Toast, il banner di notifica Push nativo e la finestra di dialogo Modal.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - Il contenuto della pagina attiva da renderizzare nello schermo.
 * @param {boolean} [props.showNavbar=true] - Flag per mostrare o nascondere la barra di navigazione inferiore.
 * @param {string} [props.toolbarTitle='RoR React App'] - Titolo visualizzato nella barra di sviluppo superiore.
 */
export const PhoneFrame = ({ children, showNavbar = true, toolbarTitle = 'RoR React App' }) => {
  return (
    <>
      {/* BARRA DELLO SVILUPPATORE SUPERIORE */}
      {SHOW_DEV_TOOLBAR && <DevToolbar title={toolbarTitle} />}

      <main className="app-viewport">
        
        {/* DEFINIZIONE SVG NASCOSTA PER LA CURVA ASIMMETRICA DELL'HEADER */}
        <svg width="0" height="0" style={{ position: 'absolute', pointerEvents: 'none' }} aria-hidden="true">
          <defs>
            <clipPath id="ror-header-curve" clipPathUnits="objectBoundingBox">
              <path d="M 0,0 L 1,0 L 1,0.85 C 0.78,0.68 0.38,1.02 0,0.85 Z" />
            </clipPath>
          </defs>
        </svg>

        {/* CONTENITORE PRINCIPALE SCOCCA SMARTPHONE */}
        <div className="phone-frame">
          {/* NOTCH CON FOTOCAMERA E ALTOPARLANTE */}
          <div className="phone-notch">
            <div className="camera"></div>
            <div className="speaker"></div>
          </div>

          {/* SCHERMO INTERNO DELLO SMARTPHONE */}
          <div className="phone-screen">
            <OfflineBanner />
            <PushBanner />
            {children}
            {showNavbar && <BottomNavbar />}
            <Toast />
            {/* CADUTA RILEVATA / SOS: sopra qualsiasi pagina */}
            <SafetyOverlay />
          </div>
        </div>
      </main>

      {/* FINESTRA DI DIALOGO MODAL GLOBALE */}
      <Modal />
    </>
  );
};

