import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { PageLoader } from './PageLoader';

/**
 * Protegge le rotte private dell'applicazione RoR.
 * La sessione è verificata dal backend all'avvio (GET /api/auth/session):
 *  - durante la verifica mostra un loader (o il profilo in cache, se presente);
 *  - se il server risponde che l'utente non è autenticato, reindirizza a /login
 *    salvando la rotta di provenienza;
 *  - un account che non ha ancora confermato l'email va a /conferma-email.
 *
 * @param {object} props
 * @param {React.ReactNode} props.children - Componente da visualizzare se autorizzato.
 */
export const ProtectedRoute = ({ children }) => {
  const { userProfile, authStatus } = useApp();
  const location = useLocation();

  if (!userProfile && authStatus === 'checking') {
    return <PageLoader />;
  }

  if (!userProfile) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // account nuovo con la posta configurata: prima il codice inviato per email
  if (userProfile.emailConfirmed === false && location.pathname !== '/conferma-email') {
    return <Navigate to="/conferma-email" replace />;
  }

  return children;
};
