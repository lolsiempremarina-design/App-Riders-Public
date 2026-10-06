import React from 'react';
import { useNavigate } from 'react-router-dom';
import { IconButton } from './IconButton';

/**
 * Componente HeaderBanner.
 * Visualizza il banner verde pistacho superiore con la tipografia Audiowide del brand "RoR",
 * il pulsante per tornare indietro o accedere al profilo, e l'icona per le notifiche.
 *
 * @param {Object} props
 * @param {string} [props.backTo] - Percorso specifico a cui tornare (se non fornito, esegue navigate(-1)).
 * @param {boolean} [props.showProfileIcon=false] - Mostra l'icona del profilo anziché il pulsante di ritorno.
 */
export const HeaderBanner = ({ backTo, showProfileIcon = false }) => {
  const navigate = useNavigate();

  return (
    <header className="ror-top-banner" role="banner">
      <div className="banner-controls">
        {/* PULSANTE PROFILO O TORNA INDIETRO SUL LATO SINISTRO */}
        {showProfileIcon ? (
          <IconButton
            variant="profile"
            id="header-profile-btn"
            ariaLabel="Profilo Utente"
            onClick={() => navigate('/profilo')}
          />
        ) : (
          <IconButton
            variant="back"
            id="header-back-btn"
            ariaLabel="Torna indietro"
            onClick={() => (backTo ? navigate(backTo) : navigate(-1))}
          />
        )}

        {/* LOGO CENTRALE IN TIPOGRAFIA AUDIOWIDE */}
        <div className="ror-logo-wrapper">
          <h1 className="ror-logo-audiowide">RoR</h1>
        </div>

        {/* PULSANTE NOTIFICHE SUL LATO DESTRO */}
        <IconButton
          variant="notif"
          id="bell-btn"
          ariaLabel="Notifiche"
          onClick={() => navigate('/notifiche')}
        />
      </div>
    </header>
  );
};

