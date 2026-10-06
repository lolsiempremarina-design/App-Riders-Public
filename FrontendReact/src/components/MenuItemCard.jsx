import React from 'react';

/**
 * Componente MenuItemCard.
 * Scheda riutilizzabile per le voci di menu nelle pagine "Altro" e "Impostazioni".
 *
 * @param {Object} props
 * @param {string} props.title - Titolo della voce di menu.
 * @param {React.ReactNode} props.icon - Icona SVG da mostrare a sinistra.
 * @param {Function} props.onClick - Funzione eseguita al click.
 * @param {string} [props.id] - ID univoco della voce di menu.
 * @param {React.ReactNode} [props.badge] - Badge o contatore opzionale visualizzato a destra.
 */
export const MenuItemCard = ({ title, icon, onClick, id, badge }) => {
  return (
    <div
      className="altro-menu-item"
      id={id}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      <div className="altro-icon-circle">
        {icon}
      </div>
      <span className="altro-item-title">{title}</span>
      <div className="altro-item-right">
        {badge && badge}
        <span className="dots-indicator" aria-hidden="true">• • •</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </div>
    </div>
  );
};

