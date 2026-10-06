import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PhoneFrame } from '../components/PhoneFrame';
import { HeaderBanner } from '../components/HeaderBanner';
import { MenuItemCard } from '../components/MenuItemCard';
import { useApp } from '../context/AppContext';

export const Impostazioni = () => {
  const navigate = useNavigate();
  const { t } = useApp();


  return (
    <PhoneFrame toolbarTitle={t.settTitle || 'Impostazioni App'} showNavbar={true}>
      <HeaderBanner backTo="/altro" />

      {/* APP SCROLLABLE CONTENT BODY */}
      <div className="app-content" style={{ padding: '16px 16px 95px 16px' }}>

        {/* VISTA PAGINA IMPOSTAZIONI */}
        <div className="app-page-view active" id="page-impostazioni">

          {/* INTESTAZIONE TITOLO PAGINA */}
          <div className="user-welcome-row" style={{ marginBottom: '20px' }}>
            <div className="user-greeting-text">
              <h2 className="greeting-main-title" style={{ fontSize: '1.4rem', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                {t.settTitle || 'IMPOSTAZIONI APP'}
              </h2>
              <span className="greeting-subtitle">{t.settSubtitle || 'Gestione sicurezza, privacy e preferenze account'}</span>
            </div>
          </div>

          {/* ELENCO OPZIONI MENU */}
          <div className="altro-menu-list">

            {/* OPZIONE 1: INFORMATIVA SULLA PRIVACY */}
            <MenuItemCard
              id="menu-privacy-btn"
              title={t.optPrivacy || "Informativa sulla Privacy"}
              onClick={() => navigate('/privacy')}
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F171A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                </svg>
              }
            />

            {/* OPZIONE 2: PANORAMICA DELLE USCITE */}
            <MenuItemCard
              id="menu-uscite-btn"
              title={t.optPanoramica || "Panoramica delle uscite"}
              onClick={() => navigate('/panoramica_uscite')}
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F171A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="20" x2="18" y2="10"></line>
                  <line x1="12" y1="20" x2="12" y2="4"></line>
                  <line x1="6" y1="20" x2="6" y2="14"></line>
                </svg>
              }
            />

            {/* OPZIONE 3: POSIZIONE */}
            <MenuItemCard
              id="menu-posizione-btn"
              title={t.optPosizioneMenu || "Posizione"}
              onClick={() => navigate('/posizione')}
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F171A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                  <circle cx="12" cy="10" r="3"></circle>
                </svg>
              }
            />


          </div>

        </div> {/* END PAGE IMPOSTAZIONI */}
      </div> {/* END APP CONTENT */}
    </PhoneFrame>
  );
};
