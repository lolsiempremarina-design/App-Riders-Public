import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { PhoneFrame } from '../components/PhoneFrame';
import { HeaderBanner } from '../components/HeaderBanner';
import { OrderCardSkeleton } from '../components/OrderCardSkeleton';
import { useApp } from '../context/AppContext';
import { useRideTracking } from '../context/RideTrackingContext';
import { orderService } from '../services';
import { playOrderHotSound } from '../utils/audioUtils';
import { countLabel } from '../utils/statsFormat';
import { usePollInterval, useRefreshOn } from '../native/pushState';
import { shouldPollNow } from '../native/appState';

const POLL_MS = 20000;      // ogni giro sono 3 richieste (offerte, ordine in corso, completate)
const POLL_PUSH_MS = 60000; // app Android con le push attive: nuovi ordini e annullamenti arrivano subito come push

const euro = (value) => `€${Number(value || 0).toFixed(2)}`;
const hhmm = (iso) => (iso ? iso.slice(11, 16) : '');
const mapSearchUrl = (address) => `https://www.openstreetmap.org/search?query=${encodeURIComponent(address)}`;

const cardStyle = {
  background: 'var(--bg-card)',
  borderRadius: '20px',
  padding: '14px',
  border: '1px solid var(--border-card)',
  boxShadow: 'var(--shadow-card)',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px'
};

const primaryBtn = {
  padding: '10px 16px',
  borderRadius: '16px',
  border: 'none',
  background: 'var(--ror-cyan)',
  color: '#000000',
  fontWeight: 800,
  fontSize: '0.84rem',
  cursor: 'pointer',
  fontFamily: 'var(--font-main)'
};

const triggerHaptic = (pattern = [30, 45, 30]) => {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern);
};

/**
 * Pagina Consegne: ordini reali creati dall'amministratore (pannello /web/admin/).
 * - Disponibili: offerte ancora valide, con tempo rimasto per accettarle
 * - In corso: ritiro al locale → consegna al cliente (si può rinunciare prima del ritiro)
 * - Completate: consegne di oggi con i guadagni reali
 */
export const Consegne = () => {
  const { openModal, showToast, t } = useApp();
  const tracking = useRideTracking();
  const [activeTab, setActiveTab] = useState('disponibili');
  const [available, setAvailable] = useState([]);
  const [activeOrder, setActiveOrder] = useState(null);
  const [completed, setCompleted] = useState({ orders: [], summary: null });
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [loadError, setLoadError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const fetchedAtRef = useRef(Date.now());

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setStatus((prev) => (prev === 'ready' ? 'ready' : 'loading'));
    try {
      const [offers, active, done] = await Promise.all([
        orderService.getAvailableOrders(),
        orderService.getActiveOrder(),
        orderService.getCompletedOrders('today')
      ]);
      fetchedAtRef.current = Date.now();
      setAvailable(offers);
      setActiveOrder(active);
      setCompleted({ orders: done.orders || [], summary: done.summary || null });
      setStatus('ready');
      setLoadError(null);
    } catch (err) {
      if (!quiet) {
        setLoadError(err?.message || 'Errore');
        setStatus('error');
      }
    }
  }, []);

  const pollMs = usePollInterval(POLL_MS, POLL_PUSH_MS);
  useEffect(() => {
    load();
    // in background niente richieste: al ritorno useRefreshOn qui sotto ricarica subito
    const poll = setInterval(() => { if (shouldPollNow()) load({ quiet: true }); }, pollMs);
    return () => clearInterval(poll);
  }, [load, pollMs]);

  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clock);
  }, []);

  // push di un ordine con l'app aperta o ritorno in primo piano: dati aggiornati subito
  useRefreshOn(['consegne'], () => load({ quiet: true }));

  /** Secondi rimasti per accettare un'offerta (dal valore del server al momento del caricamento). */
  const secondsLeft = (order) => (order.secondsLeft === undefined || order.secondsLeft === null
    ? null
    : Math.max(0, order.secondsLeft - Math.floor((now - fetchedAtRef.current) / 1000)));
  const offers = available.filter((o) => secondsLeft(o) !== 0);

  const handleError = (err) => {
    const code = err?.code;
    const message = {
      order_unavailable: t.consegneErrTaken || 'Ordine non più disponibile: è stato preso da un altro rider o è scaduto.',
      active_order_exists: t.consegneErrBusy || 'Completa o rinuncia all\'ordine in corso prima di accettarne un altro.',
      invalid_transition: t.consegneErrState || 'Lo stato dell\'ordine è cambiato: ricarico i dati.',
      // ordine tolto dall'amministratore o passato a un altro rider nel frattempo
      not_found: t.consegneErrState || 'Lo stato dell\'ordine è cambiato: ricarico i dati.'
    }[code] || err?.message || 'Errore';
    showToast(message, 'error', 3500);
    load({ quiet: true });
  };

  const acceptOrder = async (order) => {
    setBusy(true);
    triggerHaptic([40, 60, 40]);
    try {
      const accepted = await orderService.acceptOrder(order.id);
      playOrderHotSound();
      setActiveOrder(accepted);
      setAvailable((prev) => prev.filter((o) => o.id !== order.id));
      setActiveTab('in_corso');
      showToast(`${t.consegneAcceptedToast || 'Ordine accettato'}: ${order.restaurant}`, 'success', 2500);
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (action) => {
    if (!activeOrder) return;
    setBusy(true);
    triggerHaptic([40, 50, 40]);
    try {
      const updated = await orderService.updateOrderStatus(activeOrder.id, action);
      if (action === 'picked_up') {
        setActiveOrder(updated);
        showToast(t.consegnePickedToast || 'Ritiro confermato: vai dal cliente', 'info', 2500);
      } else if (action === 'released') {
        setActiveOrder(null);
        setActiveTab('disponibili');
        showToast(t.consegneReleasedToast || 'Hai rinunciato all\'ordine: torna disponibile per gli altri rider', 'info', 3000);
        load({ quiet: true });
      } else {
        setActiveOrder(null);
        playOrderHotSound();
        await load({ quiet: true });
        setActiveTab('completate');
        // elementi React: il nome del locale (scritto dall'amministratore) si vede com'è, anche con < o >
        // (in una stringa HTML "Pizzeria <Da Mario>" perdeva il testo fra le parentesi)
        openModal(
          t.consegneDoneTitle || 'Consegna completata ✅',
          <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--text-main)' }}>
            <strong>{updated.restaurant}</strong><br />
            {t.consegnePayLabel || 'Compenso'}: {euro(updated.pay)}
            {updated.bonus ? ` + ${t.consegneBonusLabel || 'Bonus'} ${euro(updated.bonus)}` : ''}<br />
            <strong>{t.consegneTotalLabel || 'Totale'}: {euro(updated.total)}</strong>
            {updated.onTime === false && <><br />{t.consegneLate || 'Consegnata oltre l\'orario promesso.'}</>}
          </p>
        );
      }
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  };

  const confirmRelease = () => openModal(
    t.consegneReleaseTitle || 'Rinunciare all\'ordine?',
    `<p style="font-size:0.86rem; color:var(--text-main);">${t.consegneReleaseBody || 'L\'ordine tornerà disponibile per gli altri rider.'}</p>`,
    t.consegneReleaseBtn || 'Rinuncia',
    () => changeStatus('released')
  );

  const summary = completed.summary;
  const isTrackingActive = tracking?.ride && tracking.ride.status !== 'idle';

  return (
    <PhoneFrame toolbarTitle={t.consegneToolbarTitle || 'RoR Consegne'} showNavbar={true}>
      <HeaderBanner backTo="/statistiche" />

      <div className="app-content" style={{ padding: '14px 16px 95px 16px' }}>
        <div className="app-page-view active" id="page-consegne">

          {/* RIEPILOGO DI OGGI */}
          <section className="consegne-hero-card" aria-label="Riepilogo Consegne Oggi" style={{ marginBottom: '14px' }}>
            <div className="consegne-hero-header">
              <span className="ritmo-elevato-badge">{t.consegneHeroBadge || 'OGGI'}</span>
              <button
                type="button"
                onClick={() => load()}
                disabled={status === 'loading'}
                aria-label={t.consegneRefreshOrders || 'Aggiorna ordini'}
                title={t.consegneRefreshOrders || 'Aggiorna ordini'}
                data-testid="consegne-refresh-btn"
                style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--border-card)', borderRadius: '12px', padding: '6px 10px', cursor: 'pointer', color: 'var(--text-muted)', fontWeight: 800 }}
              >
                ⟳
              </button>
            </div>
            <div className="consegne-hero-val-group">
              <span className="consegne-hero-number">{summary?.deliveries ?? 0}</span>
              <span className="consegne-hero-label">{countLabel(summary?.deliveries ?? 0, t.consegneTodayLabelOne || 'consegna oggi', t.consegneTodayLabel || 'consegne oggi')}</span>
            </div>
            <div className="consegne-hero-subtitle">
              {isTrackingActive
                ? (t.consegneTrackingOn || 'Sessione GPS attiva: il percorso viene registrato')
                : <Link className="inline-link" to="/">{t.consegneTrackingOff || 'Nessuna sessione GPS attiva: avviala dalla Home'}</Link>}
            </div>
            <div className="consegne-hero-footer">
              <span>{t.consegneEarningsLabel || 'Guadagni:'} <strong style={{ color: 'var(--text-success)' }}>{euro(summary?.earnings)}</strong></span>
              <span>{t.consegnePunctualityLabel || 'Puntualità:'} <strong>{summary?.onTimeRate === null || summary?.onTimeRate === undefined ? '—' : `${Math.round(summary.onTimeRate * 100)}%`}</strong></span>
            </div>
          </section>

          {/* SCHEDE */}
          <div className="category-filter-chips" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: '14px' }}>
            {[
              { id: 'disponibili', label: `${t.tabAvailable || 'Disponibili'} (${offers.length})` },
              { id: 'in_corso', label: t.tabActive || 'In Corso', hasDot: Boolean(activeOrder) },
              { id: 'completate', label: `${t.tabCompleted || 'Completate'} (${completed.orders.length})` }
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => { triggerHaptic(); setActiveTab(tab.id); }}
                aria-pressed={activeTab === tab.id}
                style={{
                  padding: '8px 4px', borderRadius: '16px', border: 'none',
                  background: activeTab === tab.id ? 'var(--ror-cyan)' : 'var(--bg-card-subtle)',
                  color: activeTab === tab.id ? '#000000' : 'var(--text-muted)',
                  fontWeight: 800, fontSize: '0.76rem', cursor: 'pointer', whiteSpace: 'nowrap',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px', fontFamily: 'var(--font-main)'
                }}
              >
                {tab.label}
                {tab.hasDot && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#EF4444', display: 'inline-block' }} />}
              </button>
            ))}
          </div>

          {status === 'loading' && <OrderCardSkeleton count={3} />}
          {status === 'error' && (
            <div role="alert" style={{ textAlign: 'center', padding: '24px 8px', color: 'var(--text-main)' }}>
              <p style={{ fontSize: '0.86rem' }}>{t.consegneLoadError || 'Impossibile caricare gli ordini.'} {loadError}</p>
              <button type="button" style={primaryBtn} onClick={() => load()}>{t.retryBtn || 'Riprova'}</button>
            </div>
          )}

          {/* DISPONIBILI */}
          {status === 'ready' && activeTab === 'disponibili' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {offers.length === 0 ? (
                <div style={{ padding: '35px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <p style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
                    {t.consegneNoAvailableTitle || 'Nessun ordine disponibile'}
                  </p>
                  <span style={{ fontSize: '0.76rem' }}>{t.consegneNoAvailableReal || 'Riceverai una notifica quando ne arriva uno nuovo.'}</span>
                </div>
              ) : offers.map((ord) => {
                const left = secondsLeft(ord);
                return (
                  <article key={ord.id} style={cardStyle} aria-label={ord.restaurant}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-main)' }}>{ord.restaurant}</span>
                      {left !== null && (
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-danger)', background: 'rgba(239, 68, 68, 0.12)', padding: '3px 8px', borderRadius: '12px', whiteSpace: 'nowrap' }}>
                          {t.consegneAcceptIn || 'Accetta entro'} {left >= 60 ? `${Math.ceil(left / 60)} min` : `${left}s`}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      <div>{t.consegnePickup || 'Ritiro'}: <strong style={{ color: 'var(--text-main)' }}>{ord.pickupAddress}</strong></div>
                      <div>{t.consegneDropoff || 'Consegna'}: <strong style={{ color: 'var(--text-main)' }}>{ord.deliveryAddress}</strong>
                        {ord.distanceKm ? ` • ${Number(ord.distanceKm).toFixed(1)} km` : ''}</div>
                      {ord.dueAt && <div>{t.consegneDueBy || 'Consegna entro le'} {hhmm(ord.dueAt)}</div>}
                    </div>
                    {ord.items && (
                      <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', background: 'var(--bg-card-subtle)', padding: '6px 10px', borderRadius: '10px' }}>{ord.items}</div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--text-success)' }}>{euro(ord.pay)}</span>
                        {ord.bonus > 0 && <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--ror-cyan)', marginLeft: '6px' }}>+{euro(ord.bonus)} {t.consegneBonusLabel || 'Bonus'}</span>}
                      </div>
                      <button type="button" style={primaryBtn} disabled={busy} onClick={() => acceptOrder(ord)}>
                        {t.consegneAcceptBtn || 'Accetta ordine'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {/* IN CORSO */}
          {status === 'ready' && activeTab === 'in_corso' && (
            !activeOrder ? (
              <div style={{ padding: '35px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <p style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>{t.consegneNoActiveTitle || 'Nessun ordine in corso'}</p>
                <span style={{ fontSize: '0.76rem' }}>{t.consegneNoActiveSub || 'Accetta un ordine dalla scheda "Disponibili".'}</span>
              </div>
            ) : (
              <article style={{ ...cardStyle, border: '2px solid var(--ror-cyan)', gap: '12px' }} aria-label={activeOrder.restaurant}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#000', background: 'var(--ror-cyan)', padding: '3px 10px', borderRadius: '12px' }}>
                    {activeOrder.status === 'accepted' ? (t.consegneStepPickup || 'Fase 1 di 2 • Ritiro') : (t.consegneStepDeliver || 'Fase 2 di 2 • Consegna')}
                  </span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-success)' }}>{euro(activeOrder.total)}</span>
                </div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>{activeOrder.restaurant}</h3>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-main)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {activeOrder.status === 'accepted' ? (
                    <span>{t.consegnePickup || 'Ritiro'}: <strong>{activeOrder.pickupAddress}</strong> • <a className="inline-link" href={mapSearchUrl(activeOrder.pickupAddress)} target="_blank" rel="noopener noreferrer">{t.consegneOpenMap || 'mappa'}</a></span>
                  ) : (
                    <span>{t.consegneDropoff || 'Consegna'}: <strong>{activeOrder.deliveryAddress}</strong> • <a className="inline-link" href={mapSearchUrl(activeOrder.deliveryAddress)} target="_blank" rel="noopener noreferrer">{t.consegneOpenMap || 'mappa'}</a></span>
                  )}
                  {activeOrder.customerName && <span>{t.consegneCustomer || 'Cliente'}: {activeOrder.customerName}</span>}
                  {activeOrder.items && <span>{activeOrder.items}</span>}
                  {activeOrder.notes && <span>📝 {activeOrder.notes}</span>}
                  {activeOrder.dueAt && <span>{t.consegneDueBy || 'Consegna entro le'} {hhmm(activeOrder.dueAt)}</span>}
                </div>
                <div style={{ height: '8px', background: 'rgba(0,0,0,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: activeOrder.status === 'accepted' ? '50%' : '100%', background: 'linear-gradient(90deg, #9BE191 0%, #10B981 100%)', transition: 'width 0.35s ease' }} />
                </div>
                {activeOrder.status === 'accepted' ? (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button type="button" style={{ ...primaryBtn, flex: 1 }} disabled={busy} onClick={() => changeStatus('picked_up')}>
                      {t.consegneStep1Btn || 'Conferma ritiro'}
                    </button>
                    <button type="button" style={{ ...primaryBtn, background: 'var(--bg-card-subtle)', color: 'var(--text-main)' }} disabled={busy} onClick={confirmRelease}>
                      {t.consegneReleaseBtn || 'Rinuncia'}
                    </button>
                  </div>
                ) : (
                  <button type="button" style={primaryBtn} disabled={busy} onClick={() => changeStatus('delivered')}>
                    {t.consegneStep2Btn || 'Conferma consegna'}
                  </button>
                )}
              </article>
            )
          )}

          {/* COMPLETATE OGGI */}
          {status === 'ready' && activeTab === 'completate' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 4px' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-main)' }}>{t.consegneHistoryTitle || 'Oggi'} ({completed.orders.length})</span>
                <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-success)' }}>{t.consegneTotalLabel || 'Totale'}: {euro(summary?.earnings)}</span>
              </div>
              {completed.orders.length === 0 && (
                <p style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t.consegneNoCompleted || 'Nessuna consegna completata oggi.'}</p>
              )}
              {completed.orders.map((ord) => (
                <div key={ord.id} className="delivery-item-row">
                  <div className="deliv-left">
                    <div className="deliv-icon-circle" style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--text-success)' }}>✓</div>
                    <div className="deliv-info">
                      <span className="deliv-place">{ord.restaurant}</span>
                      <span className="deliv-route">{ord.deliveryAddress}{ord.distanceKm ? ` • ${Number(ord.distanceKm).toFixed(1)} km` : ''}</span>
                    </div>
                  </div>
                  <div className="deliv-right">
                    <span className="deliv-price" style={{ color: 'var(--text-success)' }}>{euro(ord.total)}</span>
                    <span className="deliv-time">
                      {hhmm(ord.deliveredAt)}{ord.onTime === true ? ` • ${t.consegneOnTime || 'puntuale'}` : ord.onTime === false ? ` • ${t.consegneLateShort || 'in ritardo'}` : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PhoneFrame>
  );
};
