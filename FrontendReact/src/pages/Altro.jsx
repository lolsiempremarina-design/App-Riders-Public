import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PhoneFrame } from '../components/PhoneFrame';
import { HeaderBanner } from '../components/HeaderBanner';
import { MenuItemCard } from '../components/MenuItemCard';
import { useApp } from '../context/AppContext';
import { useNotifications } from '../context/NotificationsContext';

export const Altro = () => {
  const navigate = useNavigate();
  const { t, language, userProfile } = useApp();
  // Notifiche non lette dal server (/api/notifications)
  const { unreadCount } = useNotifications();

  const currentLangBadge = (language || 'it').toUpperCase();

  return (
    <PhoneFrame toolbarTitle="RoR Altro Control Hub" showNavbar={true}>
      <HeaderBanner backTo="/" />

      {/* APP SCROLLABLE CONTENT BODY */}
      <div className="app-content" style={{ padding: '12px 16px 85px 16px' }}>

        {/* VISTA PAGINA ALTRO */}
        <div className="app-page-view active" id="page-altro">

          {/* INTESTAZIONE TITOLO PAGINA */}
          <div className="user-welcome-row" style={{ marginTop: '4px', marginBottom: '14px' }}>
            <div className="user-greeting-text">
              <h2 className="greeting-main-title" style={{ fontSize: '1.4rem', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                {t.altroTitle || 'ALTRO...'}
              </h2>
              <span className="greeting-subtitle">{t.altroSubtitle || "Centro di controllo e impostazioni dell'app"}</span>
            </div>
          </div>

          {/* ELENCO OPZIONI MENU ALTRO */}
          <div className="altro-menu-list">
            
            {/* OPZIONE 1: PROFILO */}
            <MenuItemCard
              id="menu-profilo-btn"
              title={t.optProfilo || "Profilo"}
              onClick={() => navigate('/profilo')}
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F171A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
              }
            />

            {/* OPZIONE 2: NOTIFICHE (BADGE DINAMICO REALE) */}
            <MenuItemCard
              id="menu-notifiche-btn"
              title={t.optNotifiche || "Notifiche"}
              badge={unreadCount > 0 ? <span className="badge-notif-count">{unreadCount}</span> : null}
              onClick={() => navigate('/notifiche')}
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F171A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                </svg>
              }
            />

            {/* OPZIONE 3: IMPOSTAZIONI APP */}
            <MenuItemCard
              id="menu-settings-btn"
              title={t.optImpostazioni || "Impostazioni App"}
              onClick={() => navigate('/impostazioni')}
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F171A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
                </svg>
              }
            />

            {/* OPZIONE 4: LINGUA */}
            <MenuItemCard
              id="menu-lingua-btn"
              title={t.optLingua || "Lingua"}
              badge={<span className="badge-lang-tag">{currentLangBadge}</span>}
              onClick={() => navigate('/lingua')}
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F171A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="2" y1="12" x2="22" y2="12"></line>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                </svg>
              }
            />

            {/* OPZIONE 5: GRUPPI */}
            <MenuItemCard
              id="menu-gruppi-btn"
              title={t.optGruppi || "Gruppi"}
              onClick={() => navigate('/gruppi')}
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F171A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>
              }
            />

            {/* OPZIONE 6: INFO */}
            <MenuItemCard
              id="menu-info-btn"
              title={t.optInfo || "Info"}
              onClick={() => navigate('/info')}
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F171A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="16" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
              }
            />

            {/* PANNELLO AMMINISTRATORE (solo per gli admin): pagine Flask sotto /web/admin/ */}
            {userProfile?.isAdmin && (
              <MenuItemCard
                id="menu-admin-btn"
                title={t.optAdmin || 'Pannello amministratore'}
                onClick={() => { window.location.href = '/web/admin/'; }}
                icon={
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F171A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                  </svg>
                }
              />
            )}

          </div>

        </div> {/* END PAGE ALTRO */}
      </div> {/* END APP CONTENT */}
    </PhoneFrame>
  );
};

