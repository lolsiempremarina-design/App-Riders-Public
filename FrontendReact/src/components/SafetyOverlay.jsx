import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useRideTracking } from '../context/RideTrackingContext';
import { profileService } from '../services/profileService';
import { EMERGENCY_NUMBER, buildSosSmsLink, buildTelLink } from '../services/sosService';

const overlayStyle = {
  position: 'absolute',
  inset: 0,
  zIndex: 2000,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  gap: '14px',
  padding: '24px 20px',
  overflowY: 'auto',
  fontFamily: 'var(--font-main)'
};

const bigBtn = {
  width: '100%',
  minHeight: '52px',
  borderRadius: '16px',
  border: 'none',
  fontWeight: 800,
  fontSize: '1rem',
  cursor: 'pointer',
  fontFamily: 'var(--font-main)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  textDecoration: 'none'
};

const smallLink = {
  padding: '8px 12px',
  borderRadius: '12px',
  background: '#FFFFFF',
  color: '#0F171A',
  fontWeight: 700,
  fontSize: '0.8rem',
  textDecoration: 'none',
  whiteSpace: 'nowrap'
};

/**
 * Schermate di sicurezza sopra qualsiasi pagina:
 *  - caduta rilevata: conto alla rovescia prima dell'SOS automatico ("Sto bene" per annullare);
 *  - SOS: invio, esito reale (email inviate o no) e azioni dirette (chiama/SMS ai contatti, 112).
 */
export const SafetyOverlay = () => {
  const tracking = useRideTracking();
  const { t } = useApp();
  const [contacts, setContacts] = useState(null);

  const sos = tracking?.sos;
  const needsContacts = sos?.status === 'sent' && !sos.result?.contacts;
  useEffect(() => {
    if (!needsContacts) return undefined;
    let cancelled = false;
    profileService.listSosContacts()
      .then((data) => { if (!cancelled) setContacts(data.contacts); })
      .catch(() => { if (!cancelled) setContacts([]); });
    return () => { cancelled = true; };
  }, [needsContacts]);

  if (!tracking) return null;
  const { fallAlert, cancelFall, confirmFall, resolveSos, dismissSos, triggerSos } = tracking;

  if (fallAlert) {
    return (
      <div role="alertdialog" aria-modal="true" aria-labelledby="fall-title" style={{ ...overlayStyle, background: '#B91C1C', color: '#FFFFFF', textAlign: 'center' }}>
        <h2 id="fall-title" style={{ margin: 0, fontSize: '1.5rem' }}>{t.fallTitle || 'Caduta rilevata'}</h2>
        <p style={{ margin: 0, fontSize: '0.95rem' }}>{t.fallBody || 'Se non rispondi, verrà inviato un SOS con la tua posizione.'}</p>
        <div aria-live="assertive" style={{ fontSize: '4.5rem', fontWeight: 900, lineHeight: 1 }}>{fallAlert.secondsLeft}</div>
        <button type="button" style={{ ...bigBtn, background: '#FFFFFF', color: '#0F171A' }} onClick={cancelFall}>
          {t.fallImOk || 'Sto bene'}
        </button>
        <button type="button" style={{ ...bigBtn, background: '#7F1D1D', color: '#FFFFFF', border: '2px solid #FFFFFF' }} onClick={confirmFall}>
          {t.fallSendNow || 'Invia SOS ora'}
        </button>
      </div>
    );
  }

  if (!sos) return null;

  // SOS non ancora arrivato: l'app riprova da sola (anche se il rider non può toccare il telefono)
  const retrying = (sos.status === 'error' && sos.retrying) || (sos.status === 'sending' && sos.attempt > 1);
  if (retrying) {
    return (
      <div role="alertdialog" aria-modal="true" aria-label="SOS" style={{ ...overlayStyle, background: '#B91C1C', color: '#FFFFFF', textAlign: 'center' }}>
        <h2 style={{ margin: 0 }}>{t.sosPendingTitle || 'SOS non ancora inviato'}</h2>
        <p style={{ margin: 0 }}>{t.sosPendingBody || 'Il server non risponde: RoR riprova da solo finché l\'SOS non arriva. Se puoi, chiama i soccorsi.'}</p>
        <p aria-live="polite" style={{ margin: 0, fontSize: '0.85rem', opacity: 0.9 }}>
          {sos.status === 'sending'
            ? (t.sosRetrySending || 'Nuovo tentativo in corso...')
            : `${t.sosAttempts || 'Tentativi senza risposta'}: ${sos.attempt}`}
        </p>
        <a href={buildTelLink(EMERGENCY_NUMBER)} style={{ ...bigBtn, background: '#FFFFFF', color: '#B91C1C' }}>
          {`${t.sosCall || 'Chiama'} ${EMERGENCY_NUMBER}`}
        </a>
        <button type="button" style={{ ...bigBtn, background: '#7F1D1D', color: '#FFFFFF', border: '2px solid #FFFFFF' }} onClick={() => triggerSos(sos.source)}>
          {t.sosRetryNow || 'Riprova ora'}
        </button>
        <button type="button" style={{ ...bigBtn, background: 'transparent', color: '#FFFFFF', minHeight: '40px' }} onClick={dismissSos}>
          {t.sosCancelPending || 'Sto bene: non inviarlo'}
        </button>
      </div>
    );
  }

  if (sos.status === 'sending') {
    return (
      <div role="alertdialog" aria-modal="true" aria-label="SOS" style={{ ...overlayStyle, background: '#B91C1C', color: '#FFFFFF', textAlign: 'center' }}>
        <h2 style={{ margin: 0 }}>{t.sosSending || 'Invio SOS in corso...'}</h2>
        <a href={buildTelLink(EMERGENCY_NUMBER)} style={{ ...bigBtn, background: '#FFFFFF', color: '#B91C1C' }}>
          {`${t.sosCall || 'Chiama'} ${EMERGENCY_NUMBER}`}
        </a>
      </div>
    );
  }

  if (sos.status === 'error') {
    return (
      <div role="alertdialog" aria-modal="true" aria-label="SOS" style={{ ...overlayStyle, background: '#B91C1C', color: '#FFFFFF', textAlign: 'center' }}>
        <h2 style={{ margin: 0 }}>{t.sosErrorTitle || 'SOS non inviato'}</h2>
        <p style={{ margin: 0 }}>{t.sosErrorBody || 'Non è stato possibile registrare l\'SOS. Chiama direttamente i soccorsi.'} ({sos.error})</p>
        <a href={buildTelLink(EMERGENCY_NUMBER)} style={{ ...bigBtn, background: '#FFFFFF', color: '#B91C1C' }}>
          {`${t.sosCall || 'Chiama'} ${EMERGENCY_NUMBER}`}
        </a>
        <button type="button" style={{ ...bigBtn, background: '#7F1D1D', color: '#FFFFFF', border: '2px solid #FFFFFF' }} onClick={() => triggerSos(sos.source)}>
          {t.retryBtn || 'Riprova'}
        </button>
        <button type="button" style={{ ...bigBtn, background: 'transparent', color: '#FFFFFF', minHeight: '40px' }} onClick={dismissSos}>
          {t.sosClose || 'Chiudi'}
        </button>
      </div>
    );
  }

  // SOS registrato
  const { alert, notifications } = sos.result || {};
  const list = sos.result?.contacts || contacts || [];
  const emailsSent = notifications?.emailsSent || alert?.emailsSent || 0;
  let notifyText;
  if (!notifications) {
    notifyText = emailsSent
      ? `${t.sosEmailsSent || 'Email di allarme inviate ai contatti'}: ${emailsSent}.`
      : (t.sosActiveNoEmail || 'Hai un SOS attivo.');
  } else if (emailsSent) {
    notifyText = `${t.sosEmailsSent || 'Email di allarme inviate ai contatti'}: ${emailsSent}.`;
  } else if (!notifications.emailConfigured) {
    notifyText = t.sosEmailNotConfigured || 'Gli avvisi automatici via email non sono configurati: avvisa tu i tuoi contatti qui sotto.';
  } else if (!notifications.contactsWithEmail) {
    notifyText = t.sosNoContactEmail || 'Nessun contatto ha un indirizzo email: avvisali tu qui sotto.';
  } else {
    notifyText = t.sosEmailFailed || 'Invio delle email non riuscito: avvisa tu i tuoi contatti qui sotto.';
  }

  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="sos-title" style={{ ...overlayStyle, justifyContent: 'flex-start', background: '#7F1D1D', color: '#FFFFFF' }}>
      <h2 id="sos-title" style={{ margin: '12px 0 0 0', fontSize: '1.4rem' }}>
        {t.sosSentTitle || 'SOS registrato'}{alert?.source === 'fall' ? ` • ${t.sosFromFall || 'caduta'}` : ''}
      </h2>
      <p style={{ margin: 0, fontSize: '0.88rem' }}>{notifyText}</p>
      {notifications?.groupMembers > 0 && (
        <p style={{ margin: 0, fontSize: '0.82rem' }}>
          {`${t.sosGroupVisible || 'Visibile nell\'app ai membri dei tuoi gruppi'}: ${notifications.groupMembers}`}
        </p>
      )}
      {!alert?.lat && <p style={{ margin: 0, fontSize: '0.82rem' }}>{t.sosNoLocation || 'Posizione non disponibile.'}</p>}

      <a href={buildTelLink(EMERGENCY_NUMBER)} style={{ ...bigBtn, background: '#FFFFFF', color: '#B91C1C' }}>
        {`${t.sosCall || 'Chiama'} ${EMERGENCY_NUMBER}`}
      </a>

      <section aria-label={t.sosContactsTitle || 'I tuoi contatti SOS'} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <h3 style={{ margin: 0, fontSize: '0.95rem' }}>{t.sosContactsTitle || 'I tuoi contatti SOS'}</h3>
        {list.length === 0 && (
          <p style={{ margin: 0, fontSize: '0.82rem' }}>{t.sosNoContactsSaved || 'Nessun contatto SOS salvato: aggiungili dal Profilo.'}</p>
        )}
        {list.map((contact) => (
          <div key={contact.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.12)', borderRadius: '12px', padding: '8px 10px' }}>
            <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: '0.86rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>{contact.name}</span>
            <a href={buildTelLink(contact.phone)} style={smallLink}>{t.sosCall || 'Chiama'}</a>
            <a href={buildSosSmsLink(contact.phone, alert?.mapUrl, t)} style={smallLink}>SMS</a>
          </div>
        ))}
      </section>

      <button type="button" style={{ ...bigBtn, background: '#FFFFFF', color: '#0F171A', marginTop: '6px' }} onClick={resolveSos}>
        {t.sosImOk || 'Sto bene: annulla l\'SOS'}
      </button>
    </div>
  );
};
