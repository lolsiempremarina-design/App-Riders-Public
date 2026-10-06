import React, { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { RideTrackingProvider } from './context/RideTrackingContext';
import { NotificationsProvider } from './context/NotificationsContext';
import { PageLoader } from './components/PageLoader';

// Caricamento immediato (Eager) delle schermate chiave per risposta istantanea al click
import { Home } from './pages/Home';
import { Gruppi } from './pages/Gruppi';
import { GruppoChat } from './pages/GruppoChat';

/**
 * Caricamento differito (Lazy Loading / Code Splitting) delle sotto-pagine su richiesta.
 * Ottimizza le prestazioni riducendo le dimensioni del bundle iniziale.
 */
const Statistiche = lazy(() => import('./pages/Statistiche').then(m => ({ default: m.Statistiche })));
const Mappa = lazy(() => import('./pages/Mappa').then(m => ({ default: m.Mappa })));
const Profilo = lazy(() => import('./pages/Profilo').then(m => ({ default: m.Profilo })));
const Altro = lazy(() => import('./pages/Altro').then(m => ({ default: m.Altro })));
const Lingua = lazy(() => import('./pages/Lingua').then(m => ({ default: m.Lingua })));
const Notifiche = lazy(() => import('./pages/Notifiche').then(m => ({ default: m.Notifiche })));
const Impostazioni = lazy(() => import('./pages/Impostazioni').then(m => ({ default: m.Impostazioni })));
const PanoramicaUscite = lazy(() => import('./pages/PanoramicaUscite').then(m => ({ default: m.PanoramicaUscite })));
const Privacy = lazy(() => import('./pages/Privacy').then(m => ({ default: m.Privacy })));
const EliminazioneAccount = lazy(() => import('./pages/EliminazioneAccount').then(m => ({ default: m.EliminazioneAccount })));
const Posizione = lazy(() => import('./pages/Posizione').then(m => ({ default: m.Posizione })));
const InfoPage = lazy(() => import('./pages/Info').then(m => ({ default: m.Info })));
const BikeCataloguePage = lazy(() => import('./pages/BikeHub').then(m => ({ default: m.BikeCataloguePage })));
const BikeHubPage = lazy(() => import('./pages/BikeHub').then(m => ({ default: m.BikeHubPage })));
const BikeStoryPage = lazy(() => import('./pages/BikeStoryPage').then(m => ({ default: m.BikeStoryPage })));
const Login = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })));
const Register = lazy(() => import('./pages/Register').then(m => ({ default: m.Register })));
const Accedi = lazy(() => import('./pages/Accedi').then(m => ({ default: m.Accedi })));
const Consegne = lazy(() => import('./pages/Consegne').then(m => ({ default: m.Consegne })));
const PunteggioTotale = lazy(() => import('./pages/PunteggioTotale').then(m => ({ default: m.PunteggioTotale })));
const VelocitaMedia = lazy(() => import('./pages/VelocitaMedia').then(m => ({ default: m.VelocitaMedia })));
const TempoTotale = lazy(() => import('./pages/TempoTotale').then(m => ({ default: m.TempoTotale })));
const Percorsi = lazy(() => import('./pages/Percorsi').then(m => ({ default: m.Percorsi })));
const DeleteAccountFlow = lazy(() => import('./pages/DeleteAccountFlow').then(m => ({ default: m.DeleteAccountFlow })));
const ConfermaEmail = lazy(() => import('./pages/ConfermaEmail').then(m => ({ default: m.ConfermaEmail })));

/**
 * Componente principale dell'applicazione RoR.
 * Configura il contesto globale (AppProvider), il router SPA (BrowserRouter) e le rotte.
 */
import { ProtectedRoute } from './components/ProtectedRoute';
import { ErrorBoundary } from './components/ErrorBoundary';
import { NativeAppBridge } from './components/NativeAppBridge';
import { enableRoleButtonKeyboard } from './utils/keyboardButtons';

/** Vecchi QR delle bici (/bike/<codice>): la scheda della bici è in /bici/<codice>. */
const LegacyBikeLink = () => {
  const { bikeId } = useParams();
  return <Navigate to={`/bici/${encodeURIComponent(bikeId)}`} replace />;
};

export const App = () => {
  // card e voci di menu con role="button": attivabili anche con Invio / Spazio
  useEffect(() => enableRoleButtonKeyboard(), []);

  useEffect(() => {
    // Pre-caricamento differito in background delle rotte frequenti (0ms delay al click)
    const preloadRoutes = () => {
      import('./pages/Statistiche');
      import('./pages/Mappa');
      import('./pages/Altro');
      import('./pages/Consegne');
      import('./pages/Notifiche');
      import('./pages/Profilo');
      import('./pages/Info');
    };

    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(preloadRoutes);
    } else {
      setTimeout(preloadRoutes, 800);
    }
  }, []);

  return (
    <AppProvider>
      <RideTrackingProvider>
      <NotificationsProvider>
      <ErrorBoundary>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <NativeAppBridge />
          <Suspense fallback={<PageLoader />}>
            <Routes>
            {/* ROTTE PUBBLICHE DI AUTENTICAZIONE ED ONBOARDING */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/accedi" element={<Accedi />} />
            <Route path="/info" element={<InfoPage />} />
            {/* vecchio link del hub: le bici con dati reali sono in /bici */}
            <Route path="/tazzoli-13-hub" element={<Navigate to="/bici" replace />} />
            <Route path="/bici" element={<BikeCataloguePage />} />
            <Route path="/bici/:bikeId" element={<BikeHubPage />} />
            <Route path="/bike/:bikeId" element={<LegacyBikeLink />} />
            <Route path="/bike-story" element={<BikeStoryPage />} />
            <Route path="/privacy" element={<Privacy />} />
            {/* pagina pubblica per chiedere la cancellazione dell'account anche senza app (Google Play) */}
            <Route path="/eliminazione-account" element={<EliminazioneAccount />} />
            <Route path="/lingua" element={<Lingua />} />

            {/* ROTTA PRINCIPALE PROTETTA: DASHBOARD HOME */}
            <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />

            {/* ROTTE TELEMETRIA E STATISTICHE PROTETTE */}
            <Route path="/statistiche" element={<ProtectedRoute><Statistiche /></ProtectedRoute>} />
            <Route path="/velocita_media" element={<ProtectedRoute><VelocitaMedia /></ProtectedRoute>} />
            <Route path="/tempo_totale" element={<ProtectedRoute><TempoTotale /></ProtectedRoute>} />
            <Route path="/percorsi" element={<ProtectedRoute><Percorsi /></ProtectedRoute>} />
            <Route path="/punteggio_totale" element={<ProtectedRoute><PunteggioTotale /></ProtectedRoute>} />

            {/* ROTTA MAPPA E GEOLOCALIZZAZIONE PROTETTA */}
            <Route path="/mappa" element={<ProtectedRoute><Mappa /></ProtectedRoute>} />

            {/* ROTTE GESTIONE CONSEGNE E TURNI PROTETTE */}
            <Route path="/consegne" element={<ProtectedRoute><Consegne /></ProtectedRoute>} />
            <Route path="/panoramica_uscite" element={<ProtectedRoute><PanoramicaUscite /></ProtectedRoute>} />

            {/* ROTTE PROFILO, COMMUNITY E IMPOSTAZIONI PROTETTE */}
            <Route path="/profilo" element={<ProtectedRoute><Profilo /></ProtectedRoute>} />
            <Route path="/altro" element={<ProtectedRoute><Altro /></ProtectedRoute>} />
            <Route path="/gruppi" element={<ProtectedRoute><Gruppi /></ProtectedRoute>} />
            <Route path="/gruppo-chat" element={<ProtectedRoute><GruppoChat /></ProtectedRoute>} />
            <Route path="/notifiche" element={<ProtectedRoute><Notifiche /></ProtectedRoute>} />
            <Route path="/impostazioni" element={<ProtectedRoute><Impostazioni /></ProtectedRoute>} />
            <Route path="/posizione" element={<ProtectedRoute><Posizione /></ProtectedRoute>} />
            <Route path="/elimina-account" element={<ProtectedRoute><DeleteAccountFlow /></ProtectedRoute>} />
            <Route path="/conferma-email" element={<ProtectedRoute><ConfermaEmail /></ProtectedRoute>} />

            {/* REINDIRIZZAMENTO FALLBACK IN CASO DI PERCORSO NON VALIDO */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        </BrowserRouter>
      </ErrorBoundary>
      </NotificationsProvider>
      </RideTrackingProvider>
    </AppProvider>
  );
};

export default App;

