import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PhoneFrame } from '../components/PhoneFrame';
import { HeaderBanner } from '../components/HeaderBanner';
import { useApp } from '../context/AppContext';
import { routeService } from '../services/routeService';
import { dateTimeShort, formatDuration, formatKm } from '../utils/statsFormat';
import { isNativeApp } from '../native/platform';

const PAGE_SIZE = 20;

const actionStyle = {
  fontFamily: 'var(--font-main)',
  whiteSpace: 'nowrap',
  height: '32px',
  padding: '0 12px',
  borderRadius: '16px',
  border: '1px solid var(--border-light)',
  background: 'var(--bg-card)',
  color: 'var(--text-main)',
  fontWeight: 700,
  fontSize: '0.74rem',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  textDecoration: 'none'
};

/**
 * Storico dei percorsi GPS registrati (GET /api/routes): visualizzazione sulla mappa,
 * download del file GPX ed eliminazione.
 */
export const Percorsi = () => {
  const navigate = useNavigate();
  const { t, language, openModal, showToast } = useApp();
  const [routes, setRoutes] = useState([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const data = await routeService.list({ limit: PAGE_SIZE, offset: 0 });
      setRoutes(data.routes || []);
      setTotal(data.total || 0);
      setStatus('ready');
    } catch (err) {
      setError(err?.message || 'Errore');
      setStatus('error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const data = await routeService.list({ limit: PAGE_SIZE, offset: routes.length });
      setRoutes((prev) => [...prev, ...(data.routes || [])]);
      setTotal(data.total || 0);
    } catch (err) {
      showToast(err?.message || 'Errore', 'error');
    } finally {
      setLoadingMore(false);
    }
  };

  /** App Android: GPX salvato o inviato con il menu "Condividi". */
  const shareGpx = (route) => {
    const day = String(route.startedAt || '').slice(0, 10).replace(/-/g, '');
    routeService.shareGpx(route.id, `ror-percorso-${day || route.id}-${route.id}.gpx`)
      .catch(() => showToast(t.nativeShareError || 'Impossibile condividere il file', 'error'));
  };

  const confirmDelete = (route) => {
    openModal(
      t.routesDeleteTitle || 'Eliminare il percorso?',
      `<p style="font-size:0.86rem; color:var(--text-main);">${dateTimeShort(route.startedAt, language)} • ${formatKm(route.distanceKm, 2)} km<br />${t.routesDeleteBody || 'Il percorso e il suo file GPX verranno eliminati definitivamente.'}</p>`,
      t.routesDeleteBtn || 'Elimina',
      async () => {
        try {
          await routeService.remove(route.id);
          setRoutes((prev) => prev.filter((r) => r.id !== route.id));
          setTotal((prev) => Math.max(0, prev - 1));
          showToast(t.routesDeletedToast || 'Percorso eliminato', 'success');
        } catch (err) {
          showToast(err?.message || 'Errore', 'error');
        }
      }
    );
  };

  return (
    <PhoneFrame toolbarTitle={t.routesTitle || 'I miei percorsi'} showNavbar={true}>
      <HeaderBanner backTo="/statistiche" />

      <div className="app-content" style={{ padding: '16px 16px 95px 16px' }}>
        <div className="app-page-view active" id="page-percorsi">
          <div className="user-welcome-row" style={{ marginBottom: '16px' }}>
            <div className="user-greeting-text">
              <h2 className="greeting-main-title" style={{ fontSize: '1.4rem' }}>{t.routesTitle || 'I miei percorsi'}</h2>
              <span className="greeting-subtitle">
                {status === 'ready'
                  ? `${total} ${total === 1 ? (t.routesCountSingular || 'percorso registrato') : (t.routesCountPlural || 'percorsi registrati')}`
                  : (t.routesSubtitle || 'Percorsi GPS registrati durante le sessioni')}
              </span>
            </div>
          </div>

          {status === 'loading' && <div className="dot-pulse" aria-label={t.loadingLabel || 'Caricamento'} style={{ margin: '40px auto' }}></div>}

          {status === 'error' && (
            <div role="alert" style={{ textAlign: 'center', padding: '24px 8px', color: 'var(--text-main)' }}>
              <p style={{ fontSize: '0.86rem' }}>{t.routesLoadError || 'Impossibile caricare i percorsi.'} {error}</p>
              <button type="button" className="filter-tab active retry-btn" onClick={load}>{t.retryBtn || 'Riprova'}</button>
            </div>
          )}

          {status === 'ready' && routes.length === 0 && (
            <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-muted)' }}>
              <div style={{ fontWeight: 700, fontSize: '0.92rem', marginBottom: '4px', color: 'var(--text-main)' }}>
                {t.routesEmptyTitle || 'Nessun percorso registrato'}
              </div>
              <div style={{ fontSize: '0.78rem' }}>
                {t.routesEmptyBody || 'I percorsi vengono salvati quando termini una sessione con il tracciamento GPS attivo.'}
              </div>
            </div>
          )}

          {status === 'ready' && routes.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {routes.map((route) => (
                <li key={route.id} className="stat-metric-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div className="stat-card-header">
                    <span className="metric-name">{dateTimeShort(route.startedAt, language)}</span>
                    <span className="pct-badge positive">{`${(route.avgSpeedKmh || 0).toFixed(1)} km/h`}</span>
                  </div>
                  <div className="metric-val-group">
                    <span className="metric-number">{formatKm(route.distanceKm, 2)}</span>
                    <span className="metric-unit">km • {formatDuration(route.durationSec)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {route.hasGpx ? (
                      <>
                        <button type="button" style={actionStyle} onClick={() => navigate(`/mappa?percorso=${route.id}`)}>
                          {t.routesShowOnMap || 'Mostra sulla mappa'}
                        </button>
                        {isNativeApp() ? (
                          <button type="button" style={actionStyle} onClick={() => shareGpx(route)}>
                            {t.routesDownloadGpx || 'Scarica GPX'}
                          </button>
                        ) : (
                          <a style={actionStyle} href={routeService.gpxUrl(route.id)} download>
                            {t.routesDownloadGpx || 'Scarica GPX'}
                          </a>
                        )}
                      </>
                    ) : (
                      <span className="greeting-subtitle" style={{ fontSize: '0.74rem', alignSelf: 'center' }}>
                        {t.routesGpxUnavailable || 'File GPX non disponibile'}
                      </span>
                    )}
                    <button type="button" style={{ ...actionStyle, color: 'var(--text-danger)' }} onClick={() => confirmDelete(route)}>
                      {t.routesDeleteBtn || 'Elimina'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {status === 'ready' && routes.length < total && (
            <button type="button" className="filter-tab active" style={{ margin: '16px auto', display: 'block' }} onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? (t.loadingLabel || 'Caricamento') : (t.routesLoadMore || 'Carica altri')}
            </button>
          )}
        </div>
      </div>
    </PhoneFrame>
  );
};
