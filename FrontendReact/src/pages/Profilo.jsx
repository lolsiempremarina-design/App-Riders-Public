import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { PhoneFrame } from '../components/PhoneFrame';
import { HeaderBanner } from '../components/HeaderBanner';
import { useApp } from '../context/AppContext';
import { useRideTracking } from '../context/RideTrackingContext';
import {
  profileService,
  riderLevelFromKm,
  authErrorMessage,
  fieldErrorsToList
} from '../services';
import { DEFAULT_AVATAR } from '../services/authService';
import { resizeImageToDataUrl } from '../utils/imageUtils';
import { isValidPhoneNumber } from '../utils/authUtils';

/**
 * Valida un numero telefonico verificando prefisso internazionale e lunghezza cifre (E.164 o standard)
 * @param {string} phoneNumber - Numero di telefono da verificare
 * @returns {boolean} Se il numero è valido
 */
// la regola è in utils/authUtils.js, condivisa con la registrazione e uguale a quella del server
export const isValidInternationalPhone = isValidPhoneNumber;

/** Stile comune dei campi nelle finestre modali del profilo */
const modalInputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '14px',
  border: '1px solid var(--border-card)',
  background: 'var(--bg-card-subtle)',
  color: 'var(--text-main)',
  fontSize: '0.84rem',
  outline: 'none',
  boxSizing: 'border-box'
};

const modalLabelStyle = { fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' };

/** Data di nascita YYYY-MM-DD → GG/MM/AAAA */
const formatBirthDate = (value) => {
  if (!value || typeof value !== 'string') return '';
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
};

/** Minuti totali → "12 h 30 min" */
const formatMinutes = (minutes) => {
  const total = Math.round(Number(minutes) || 0);
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  return hours ? `${hours} h ${mins} min` : `${mins} min`;
};

/** Finestra modale semplice usata per modifica dati e cambio password */
const ProfileModal = ({ title, onClose, children }) => (
  <div className="profile-modal-backdrop" onClick={onClose}>
    <div className="profile-modal-card" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>{title}</h3>
        <button type="button" onClick={onClose} aria-label="Chiudi" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem', fontWeight: 800 }}>
          ✕
        </button>
      </div>
      {children}
    </div>
  </div>
);

/** Elenco degli errori restituiti dal server */
const ErrorList = ({ errors }) =>
  errors.length > 0 ? (
    <div className="auth-form-error" role="alert" style={{ margin: 0 }}>
      <ul style={{ margin: 0, paddingLeft: '18px' }}>
        {errors.map((item) => (
          <li key={item.field}>{item.label ? <strong>{item.label}: </strong> : null}{item.message}</li>
        ))}
      </ul>
    </div>
  ) : null;

/**
 * Pagina Profilo Rider.
 * Tutti i dati arrivano dal backend (/api/profile, /api/sos-contacts):
 * anagrafica, statistiche reali (km e uscite), foto profilo, dati di contatto
 * modificabili, cambio password e contatti di emergenza SOS.
 */
export const Profilo = () => {
  const navigate = useNavigate();
  const { openModal, showToast, t, userProfile, registerUser, logoutUser } = useApp();
  const tracking = useRideTracking();

  const fullName = userProfile ? `${userProfile.name || ''} ${userProfile.surname || ''}`.trim() || userProfile.username : '';
  const email = userProfile?.email || '';
  const phone = userProfile?.phone || '—';
  const fiscalCode = userProfile?.fiscalCode || '—';
  const avatarSrc = userProfile?.photo || DEFAULT_AVATAR;

  /** Riferimento al tag input per il caricamento dell'avatar */
  const fileInputRef = useRef(null);

  /** Statistiche reali dal backend */
  const [stats, setStats] = useState(null);
  const level = riderLevelFromKm(stats?.totalDistanceKm);

  /** Contatti SOS salvati sul server */
  const [contacts, setContacts] = useState([]);
  const [maxContacts, setMaxContacts] = useState(5);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [contactsError, setContactsError] = useState('');

  /** Carica profilo aggiornato, statistiche e contatti SOS al montaggio */
  useEffect(() => {
    let isMounted = true;

    profileService.getProfile()
      .then(({ profile, stats: serverStats }) => {
        if (!isMounted) return;
        setStats(serverStats);
        if (profile) registerUser(profile);
      })
      .catch((err) => {
        if (isMounted) console.warn('Profilo non disponibile:', err.message);
      });

    profileService.listSosContacts()
      .then(({ contacts: serverContacts, maxContacts: limit }) => {
        if (!isMounted) return;
        setContacts(serverContacts);
        setMaxContacts(limit);
        setContactsError('');
      })
      .catch((err) => {
        if (isMounted) setContactsError(authErrorMessage(err, t));
      })
      .finally(() => {
        if (isMounted) setContactsLoading(false);
      });

    return () => { isMounted = false; };
  }, []);

  /** Stato visibilità mini modal per aggiungere contatto */
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSavingContact, setIsSavingContact] = useState(false);

  /** Campi del modulo di aggiunta contatto */
  const [newName, setNewName] = useState('');
  const [newRelationship, setNewRelationship] = useState('Familiare');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [phoneTouched, setPhoneTouched] = useState(false);

  /** Validazione in tempo reale del numero di telefono SOS */
  const isPhoneValid = isValidInternationalPhone(newPhone);
  const showPhoneError = phoneTouched && newPhone.trim().length > 0 && !isPhoneValid;
  const showPhoneSuccess = phoneTouched && newPhone.trim().length > 0 && isPhoneValid;

  /** Modifica dati di contatto */
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ username: '', email: '', phone: '' });
  const [editErrors, setEditErrors] = useState([]);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  /** Cambio password */
  const [isPasswordOpen, setIsPasswordOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ current: '', next: '', confirm: '' });
  const [passwordErrors, setPasswordErrors] = useState([]);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const triggerHaptic = (pattern = [30, 45, 30]) => {
    if ('vibrate' in navigator) navigator.vibrate(pattern);
  };

  /**
   * Caricamento della foto profilo: ridimensionata e salvata sul server.
   */
  const handlePhotoUpload = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast(t.profiloPhotoInvalidType || 'Seleziona un file immagine valido (JPEG, PNG, WebP)', 'warning', 3000);
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      showToast(t.profiloPhotoTooLarge || "L'immagine selezionata non deve superare 10MB", 'warning', 3000);
      return;
    }

    try {
      const dataUrl = await resizeImageToDataUrl(file, 256);
      const { profile, stats: serverStats } = await profileService.updateProfile({ avatar: dataUrl });
      registerUser(profile);
      setStats(serverStats);
      triggerHaptic([35, 45, 35]);
      showToast(t.profiloPhotoUpdated || 'Foto profilo aggiornata con successo! 📸', 'success', 2500);
    } catch (err) {
      showToast(err?.fields?.avatar || authErrorMessage(err, t), 'error', 3500);
    } finally {
      if (e.target) e.target.value = '';
    }
  };

  /** Apre la finestra di modifica dei dati di contatto */
  const openEditModal = () => {
    triggerHaptic();
    setEditForm({
      username: userProfile?.username || '',
      email: userProfile?.email || '',
      phone: userProfile?.phone || ''
    });
    setEditErrors([]);
    setIsEditOpen(true);
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setIsSavingProfile(true);
    setEditErrors([]);
    try {
      const { profile, stats: serverStats } = await profileService.updateProfile({
        username: editForm.username.trim(),
        email: editForm.email.trim(),
        phone_number: editForm.phone.trim()
      });
      registerUser(profile);
      setStats(serverStats);
      setIsEditOpen(false);
      if (profile.pendingEmail && profile.pendingEmail !== userProfile?.pendingEmail) {
        // posta configurata: la nuova email vale dopo il codice che le abbiamo inviato
        showToast((t.profiloEmailCodeSent || 'Ti abbiamo inviato un codice a {email}: inseriscilo per completare il cambio.')
          .replace('{email}', profile.pendingEmail), 'success', 4000);
        navigate('/conferma-email');
        return;
      }
      showToast(t.profiloUpdatedToast || 'Dati del profilo aggiornati ✓', 'success', 2500);
    } catch (err) {
      setEditErrors(err.fields ? fieldErrorsToList(err.fields, t) : [{ field: 'general', label: '', message: authErrorMessage(err, t) }]);
    } finally {
      setIsSavingProfile(false);
    }
  };

  /** Apre la finestra di cambio password */
  const openPasswordModal = () => {
    triggerHaptic();
    setPasswordForm({ current: '', next: '', confirm: '' });
    setPasswordErrors([]);
    setIsPasswordOpen(true);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setIsSavingPassword(true);
    setPasswordErrors([]);
    try {
      await profileService.changePassword(passwordForm.current, passwordForm.next, passwordForm.confirm);
      setIsPasswordOpen(false);
      showToast(t.profiloPasswordChanged || 'Password aggiornata. Gli altri dispositivi sono stati disconnessi.', 'success', 3500);
    } catch (err) {
      setPasswordErrors(err.fields ? fieldErrorsToList(err.fields, t) : [{ field: 'general', label: '', message: authErrorMessage(err, t) }]);
    } finally {
      setIsSavingPassword(false);
    }
  };

  const logoutNow = () => {
    logoutUser();
    showToast(t.profiloLoggedOut || 'Disconnessione effettuata ✓', 'info', 2000);
    navigate('/login');
  };

  /**
   * Uscendo, la sessione GPS in corso (anche in pausa) viene scartata dal telefono: prima bastava un tocco per
   * perdere il percorso, e i punti già inviati restavano sul server senza diventare mai un percorso.
   */
  const handleLogout = () => {
    if (tracking?.ride && tracking.ride.status !== 'idle') {
      openModal(
        t.profiloLogoutRideTitle || 'Sessione GPS in corso',
        <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--text-main)' }}>
          {t.profiloLogoutRideBody || 'Se esci adesso, il percorso di questa sessione non verrà salvato. Per salvarlo terminala dalla Home, poi esci.'}
        </p>,
        t.profiloLogoutRideConfirm || 'Esci senza salvare',
        logoutNow
      );
      return;
    }
    logoutNow();
  };

  /** Apre la mini finestra modal per il contatto SOS */
  const openAddModal = () => {
    triggerHaptic();
    if (contacts.length >= maxContacts) {
      showToast((t.sosMaxContactsToast || 'Puoi salvare al massimo {max} contatti SOS. Rimuovine uno per aggiungerne un altro.')
        .replace('{max}', String(maxContacts)), 'warning', 3500);
      return;
    }
    setNewName('');
    setNewRelationship('Familiare');
    setNewPhone('');
    setNewEmail('');
    setPhoneTouched(false);
    setIsModalOpen(true);
  };

  /** Chiude la mini finestra modal */
  const closeAddModal = () => {
    triggerHaptic();
    setIsModalOpen(false);
  };

  /** Salva un nuovo contatto di emergenza sul server dopo la validazione del telefono */
  const handleSaveContact = async (e) => {
    e.preventDefault();
    if (!newName.trim() || !newPhone.trim()) {
      showToast(t.sosFillToast || 'Compila nome e numero di telefono', 'warning', 2500);
      return;
    }

    if (!isValidInternationalPhone(newPhone)) {
      setPhoneTouched(true);
      triggerHaptic([50, 70, 50]);
      showToast(t.sosPhoneInvalid || 'Inserisci un prefisso internazionale valido (es. +39 340 1234567)', 'warning', 3000);
      return;
    }

    setIsSavingContact(true);
    try {
      const saved = await profileService.addSosContact({
        name: newName.trim(),
        relationship: newRelationship.trim(),
        phone: newPhone.trim(),
        email: newEmail.trim()
      });
      triggerHaptic([40, 60, 40]);
      setContacts((prev) => [...prev, saved]);
      setIsModalOpen(false);
      showToast(`${t.sosAddedToast || 'Contatto SOS'} ${saved.name} ${t.sosSuccessToast || 'Aggiunto con Successo!'}`, 'success', 3000);
    } catch (err) {
      const fieldMessage = err?.fields ? Object.values(err.fields)[0] : null;
      showToast(fieldMessage || authErrorMessage(err, t), 'error', 3500);
    } finally {
      setIsSavingContact(false);
    }
  };

  /** Elimina un contatto di emergenza dal server */
  const handleDeleteContact = async (id, name) => {
    triggerHaptic([30, 40, 30]);
    try {
      await profileService.removeSosContact(id);
      setContacts((prev) => prev.filter((c) => c.id !== id));
      showToast(`${t.sosRemovedToast || 'Contatto'} ${name} ${t.sosRemovedToastEnd || 'Rimosso'}`, 'info', 2000);
    } catch (err) {
      showToast(authErrorMessage(err, t), 'error', 3000);
    }
  };

  return (
    <PhoneFrame toolbarTitle="RoR Profilo Rider" showNavbar={true}>
      <HeaderBanner backTo="/altro" />
      <div className="app-content" style={{ padding: '16px 16px 95px 16px' }}>
        <div className="app-page-view active" id="page-profilo">
          
          <div className="user-welcome-row" style={{ marginBottom: '16px' }}>
            <div className="user-greeting-text">
              <h2 className="greeting-main-title" style={{ fontSize: '1.45rem' }}>{t.profiloTitle || 'Il Mio Profilo'}</h2>
              <span className="greeting-subtitle">{t.profiloSubtitle || 'Gestisci i tuoi dati personali e profilo rider'}</span>
            </div>
          </div>

          {/* SCHEDA PRINCIPALE PROFILO CON AVATAR PERSONALIZZABILE E BADGE LIVELLO */}
          <section className="profile-hero-card" aria-label="Informazioni Personali Rider">
            <div className="profile-avatar-container">
              <picture>
                <source srcSet={avatarSrc.replace(/\.jpg$/, '.webp')} type="image/webp" />
                <img
                  src={avatarSrc}
                  alt={`Foto Profilo ${fullName}`}
                  className="profile-avatar-img"
                  loading="lazy"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = DEFAULT_AVATAR;
                  }}
                />
              </picture>

              {/* PULSANTE MODIFICA FOTO PROFILO */}
              <button
                type="button"
                className="profile-avatar-edit-btn"
                onClick={() => fileInputRef.current?.click()}
                title={t.profiloChangePhoto || "Cambia foto profilo"}
                aria-label={t.profiloChangePhoto || "Cambia foto profilo"}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                  <circle cx="12" cy="13" r="4"></circle>
                </svg>
              </button>

              {/* INPUT FILE NASCOSTO PER SELEZIONARE L'IMMAGINE */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handlePhotoUpload}
                accept="image/*"
                aria-label="Carica nuova foto profilo"
                style={{ display: 'none' }}
              />

              <span className="profile-expert-badge">{level.label}</span>
            </div>
            <h3 className="profile-user-name">{fullName}</h3>
            <span className="profile-user-email">{email}</span>
          </section>

          <section className="profile-stats-row" aria-label="Statistiche Sintetiche Profilo">
            <div className="profile-stat-box">
              <span className="stat-box-num">{stats ? stats.totalDistanceKm.toFixed(1) : '—'}</span>
              <span className="stat-box-label">{t.profiloKmLabel || 'KM PERCORSI'}</span>
            </div>
            <div className="profile-stat-box">
              <span className="stat-box-num">{stats ? stats.ridesCount : '—'}</span>
              <span className="stat-box-label">{t.profiloRidesLabel || 'USCITE'}</span>
            </div>
          </section>

          <section className="profile-section-card" aria-label="Dati Anagrafici">
            <div className="section-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="section-card-title">{t.profiloPersonalData || 'DATI ANAGRAFICI'}</h3>
              <button type="button" className="action-pill-btn profile-edit-pill" onClick={openEditModal}>
                {t.profiloEditBtn || 'Modifica'}
              </button>
            </div>
            <div className="data-table-list">
              <div className="data-table-row">
                <span className="data-field-label">{t.profiloNameLabel || 'Nome'}</span>
                <span className="data-field-val">{fullName}</span>
              </div>
              <div className="data-table-row">
                <span className="data-field-label">{t.profiloUsernameLabel || 'Nome utente'}</span>
                <span className="data-field-val">{userProfile?.username || '—'}</span>
              </div>
              <div className="data-table-row">
                <span className="data-field-label">{t.profiloEmailLabel || 'Email'}</span>
                <span className="data-field-val">{email}</span>
              </div>
              {userProfile?.pendingEmail && (
                <div className="data-table-row">
                  <span className="data-field-label">{t.profiloEmailPendingLabel || 'Nuova email da confermare'}</span>
                  <button type="button" className="data-field-val" onClick={() => navigate('/conferma-email')}
                    style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit',
                      color: 'var(--text-success)', textDecoration: 'underline', textAlign: 'right' }}>
                    {userProfile.pendingEmail}
                  </button>
                </div>
              )}
              <div className="data-table-row">
                <span className="data-field-label">{t.profiloPhoneLabel || 'Telefono'}</span>
                <span className="data-field-val">{phone}</span>
              </div>
              <div className="data-table-row">
                <span className="data-field-label">{t.profiloFiscalLabel || 'Codice Fiscale'}</span>
                <span className="data-field-val">{fiscalCode}</span>
              </div>
              <div className="data-table-row">
                <span className="data-field-label">{t.profiloBirthLabel || 'Nascita'}</span>
                <span className="data-field-val">
                  {[formatBirthDate(userProfile?.birthDate), userProfile?.birthPlace].filter(Boolean).join(' • ') || '—'}
                </span>
              </div>
            </div>
          </section>

          {/* SEZIONE CONTATTI DI EMERGENZA SOS CON BOTTONE INTERATTIVO + AGGIUNGI */}
          <section className="profile-section-card" aria-label="Contatti di Emergenza">
            <div className="section-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="section-card-title">{t.profiloEmergencyContacts || 'CONTATTI DI EMERGENZA'}</h3>
              <button
                className="action-pill-btn"
                onClick={openAddModal}
                style={{
                  background: 'var(--ror-cyan)',
                  color: '#000000',
                  fontWeight: 800,
                  border: 'none',
                  borderRadius: '14px',
                  padding: '6px 14px',
                  cursor: 'pointer',
                  fontSize: '0.78rem',
                  boxShadow: '0 4px 12px rgba(155, 225, 145, 0.3)'
                }}
              >
                {t.profiloAddBtn || '+ Aggiungi'}
              </button>
            </div>

            <div className="data-table-list">
              {contactsLoading ? (
                <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                  {t.loadingLabel || 'Caricamento...'}
                </div>
              ) : contactsError ? (
                <div className="auth-form-error" role="alert" style={{ margin: '8px 0' }}>{contactsError}</div>
              ) : contacts.length === 0 ? (
                <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                  {t.sosNoContacts || 'Nessun contatto SOS configurato. Tocca "+ Aggiungi" per configurarne uno.'}
                </div>
              ) : (
                contacts.map((contact, idx) => (
                  <div
                    key={contact.id}
                    style={{
                      padding: '10px 0',
                      borderBottom: idx < contacts.length - 1 ? '1px solid var(--border-card)' : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-main)' }}>{contact.name}</span>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--ror-cyan)', background: 'var(--bg-card-subtle)', padding: '2px 8px', borderRadius: '10px' }}>
                          {contact.relationship || '—'}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>
                        {contact.phone}
                      </span>
                      {contact.email && (
                        <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'block' }}>
                          {contact.email}
                        </span>
                      )}
                    </div>

                    {contacts.length > 1 && (
                      <button
                        onClick={() => handleDeleteContact(contact.id, contact.name)}
                        title="Rimuovi contatto"
                        aria-label={`Rimuovi contatto ${contact.name}`}
                        style={{
                          background: 'rgba(239, 68, 68, 0.12)',
                          border: 'none',
                          color: 'var(--text-danger)',
                          borderRadius: '50%',
                          width: '28px',
                          height: '28px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer'
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="profile-section-card" aria-label="Sicurezza Account">
            <div className="section-card-header">
              <h3 className="section-card-title">{t.profiloAccountTitle || 'ACCOUNT & SICUREZZA'}</h3>
            </div>
            <div className="data-table-list">
              <div className="data-table-row">
                <span className="data-field-label">{t.profiloTimeLabel || 'Tempo in sella'}</span>
                <span className="data-field-val">{stats ? formatMinutes(stats.totalDurationMin) : '—'}</span>
              </div>
              <div className="data-table-row">
                <span className="data-field-label">{t.profiloSensorsLabel || 'Sensori GPS'}</span>
                <span className="data-field-val">{userProfile?.sensorsEnabled ? (t.profiloSensorsOn || 'Attivi') : (t.profiloSensorsOff || 'Disattivati')}</span>
              </div>
              <div className="data-table-row">
                <span className="data-field-label">{t.profiloShareLabel || 'Posizione ai gruppi'}</span>
                <span className="data-field-val">{userProfile?.shareLocationWithGroups ? (t.profiloShared || 'Condivisa') : (t.profiloNotShared || 'Non condivisa')}</span>
              </div>
            </div>
            <button type="button" className="profile-secondary-btn" onClick={openPasswordModal}>
              {t.profiloChangePasswordBtn || 'Cambia password'}
            </button>
          </section>

          <button
            className="btn-logout-danger"
            onClick={handleLogout}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            <span>{t.profiloLogoutBtn || 'Esci dal mio account'}</span>
          </button>

          {/* ACCESSO FLUSSO GDPR: ELIMINAZIONE DEFINITIVA ACCOUNT */}
          <button
            type="button"
            onClick={() => navigate('/elimina-account')}
            style={{
              width: '100%',
              marginTop: '12px',
              padding: '10px',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              textDecoration: 'underline',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'color 0.2s ease'
            }}
            aria-label="Elimina Account"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            <span>{t.delAccMenuOption || 'Elimina definitivamente account'}</span>
          </button>

          {/* MINI FINESTRA MODAL PER AGGIUNGERE UN NUOVO CONTATTO SOS */}
          {isModalOpen && (
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.65)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                zIndex: 1000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '20px'
              }}
              onClick={closeAddModal}
            >
              <div
                style={{
                  background: 'var(--bg-card)',
                  borderRadius: '24px',
                  padding: '22px',
                  width: '100%',
                  maxWidth: '360px',
                  border: '1px solid var(--border-card)',
                  boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px'
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>
                    {t.sosModalTitle || 'Nuovo Contatto SOS'}
                  </h3>
                  <button
                    onClick={closeAddModal}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem', fontWeight: 800 }}
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleSaveContact} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                      {t.sosNameLabel || 'Nome e Cognome'}
                    </label>
                    <input
                      type="text"
                      placeholder={t.sosNamePlaceholder || "es. Anna Bianchi"}
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '14px',
                        border: '1px solid var(--border-card)',
                        background: 'var(--bg-card-subtle)',
                        color: 'var(--text-main)',
                        fontSize: '0.84rem',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                      {t.sosRelationLabel || 'Relazione / Parentela'}
                    </label>
                    <select
                      value={newRelationship}
                      onChange={(e) => setNewRelationship(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '14px',
                        border: '1px solid var(--border-card)',
                        background: 'var(--bg-card-subtle)',
                        color: 'var(--text-main)',
                        fontSize: '0.84rem',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    >
                      <option value="Familiare">{t.sosRelFamiliare || 'Familiare'}</option>
                      <option value="Padre / Madre">{t.sosRelGenitore || 'Padre / Madre'}</option>
                      <option value="Convivente / Partner">{t.sosRelPartner || 'Convivente / Partner'}</option>
                      <option value="Fratello / Sorella">{t.sosRelFratello || 'Fratello / Sorella'}</option>
                      <option value="Amico / Collega">{t.sosRelAmico || 'Amico / Collega'}</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                      {t.sosPhoneLabel || 'Numero di Telefono SOS'}
                    </label>
                    <input
                      type="tel"
                      placeholder={t.sosPhonePlaceholder || "es. +39 340 1234567"}
                      value={newPhone}
                      onChange={(e) => {
                        setNewPhone(e.target.value);
                        if (!phoneTouched) setPhoneTouched(true);
                      }}
                      onBlur={() => setPhoneTouched(true)}
                      required
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '14px',
                        border: showPhoneError
                          ? '1.5px solid #EF4444'
                          : showPhoneSuccess
                          ? '1.5px solid #059669'
                          : '1px solid var(--border-card)',
                        background: 'var(--bg-card-subtle)',
                        color: 'var(--text-main)',
                        fontSize: '0.84rem',
                        outline: 'none',
                        boxSizing: 'border-box',
                        transition: 'border-color 0.2s ease'
                      }}
                    />

                    {/* MESSAGGIO DI ERRORE O SUCCESSO IN TEMPO REALE */}
                    {showPhoneError && (
                      <span
                        role="alert"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          color: 'var(--text-danger)',
                          fontSize: '0.73rem',
                          fontWeight: 700,
                          marginTop: '4px'
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                          <circle cx="12" cy="12" r="10"></circle>
                          <line x1="12" y1="8" x2="12" y2="12"></line>
                          <line x1="12" y1="16" x2="12.01" y2="16"></line>
                        </svg>
                        {t.sosPhoneInvalid || 'Inserisci un prefisso internazionale valido (es. +39 340 1234567)'}
                      </span>
                    )}
                    {showPhoneSuccess && (
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          color: 'var(--text-success)',
                          fontSize: '0.73rem',
                          fontWeight: 700,
                          marginTop: '4px'
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        {t.sosPhoneValid || 'Numero valido ✓'}
                      </span>
                    )}
                  </div>

                  <div>
                    <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                      {t.sosEmailLabel || 'Email (opzionale)'}
                    </label>
                    <input
                      type="email"
                      placeholder="es. marco@email.com"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      style={modalInputStyle}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '6px' }}>
                    <button
                      type="button"
                      onClick={closeAddModal}
                      style={{
                        padding: '10px',
                        borderRadius: '14px',
                        border: '1px solid var(--border-card)',
                        background: 'var(--bg-card-subtle)',
                        color: 'var(--text-main)',
                        fontWeight: 700,
                        fontSize: '0.8rem',
                        cursor: 'pointer'
                      }}
                    >
                      {t.sosCancelBtn || 'Annulla'}
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingContact}
                      style={{
                        opacity: isSavingContact ? 0.7 : 1,
                        padding: '10px',
                        borderRadius: '14px',
                        border: 'none',
                        background: 'var(--ror-cyan)',
                        color: '#000000',
                        fontWeight: 800,
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(155, 225, 145, 0.4)'
                      }}
                    >
                      {t.sosSaveBtn || 'Salva Contatto'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* MODIFICA DATI DI CONTATTO */}
          {isEditOpen && (
            <ProfileModal title={t.profiloEditTitle || 'Modifica dati di contatto'} onClose={() => setIsEditOpen(false)}>
              <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={modalLabelStyle} htmlFor="edit-username">{t.profiloUsernameLabel || 'Nome utente'}</label>
                  {/* stessa regola della registrazione e del server (USERNAME_PATTERN): prima qui mancava */}
                  <input id="edit-username" type="text" value={editForm.username} minLength="3" maxLength="50" required
                    pattern="[A-Za-z0-9_.\-]{3,50}" title={t.usernameRuleHint || '3-50 caratteri: lettere, numeri, punto, trattino o underscore'}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, username: e.target.value }))} style={modalInputStyle} />
                </div>
                <div>
                  <label style={modalLabelStyle} htmlFor="edit-email">{t.profiloEmailLabel || 'Email'}</label>
                  <input id="edit-email" type="email" value={editForm.email} required
                    onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))} style={modalInputStyle} />
                </div>
                <div>
                  <label style={modalLabelStyle} htmlFor="edit-phone">{t.profiloPhoneLabel || 'Telefono'}</label>
                  <input id="edit-phone" type="tel" value={editForm.phone} placeholder="+39 348 1234567"
                    onChange={(e) => setEditForm((prev) => ({ ...prev, phone: e.target.value }))} style={modalInputStyle} />
                </div>
                <small style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  {t.profiloLockedFields || 'Nome, cognome e codice fiscale non sono modificabili perché identificano il rider.'}
                </small>
                <ErrorList errors={editErrors} />
                <button type="submit" className="save-btn" disabled={isSavingProfile} style={{ opacity: isSavingProfile ? 0.7 : 1 }}>
                  {isSavingProfile ? 'Salvataggio...' : (t.profiloSaveBtn || 'Salva modifiche')}
                </button>
              </form>
            </ProfileModal>
          )}

          {/* CAMBIO PASSWORD */}
          {isPasswordOpen && (
            <ProfileModal title={t.profiloChangePasswordBtn || 'Cambia password'} onClose={() => setIsPasswordOpen(false)}>
              <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={modalLabelStyle} htmlFor="pwd-current">{t.profiloPwdCurrent || 'Password attuale'}</label>
                  <input id="pwd-current" type="password" autoComplete="current-password" required value={passwordForm.current}
                    onChange={(e) => setPasswordForm((prev) => ({ ...prev, current: e.target.value }))} style={modalInputStyle} />
                </div>
                <div>
                  <label style={modalLabelStyle} htmlFor="pwd-next">{t.profiloPwdNew || 'Nuova password'}</label>
                  <input id="pwd-next" type="password" autoComplete="new-password" minLength="8" required value={passwordForm.next}
                    onChange={(e) => setPasswordForm((prev) => ({ ...prev, next: e.target.value }))} style={modalInputStyle} />
                </div>
                <div>
                  <label style={modalLabelStyle} htmlFor="pwd-confirm">{t.profiloPwdConfirm || 'Conferma nuova password'}</label>
                  <input id="pwd-confirm" type="password" autoComplete="new-password" minLength="8" required value={passwordForm.confirm}
                    onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirm: e.target.value }))} style={modalInputStyle} />
                </div>
                <ErrorList errors={passwordErrors} />
                <button type="submit" className="save-btn" disabled={isSavingPassword} style={{ opacity: isSavingPassword ? 0.7 : 1 }}>
                  {isSavingPassword ? 'Aggiornamento...' : 'Aggiorna password'}
                </button>
              </form>
            </ProfileModal>
          )}

        </div>
      </div>
    </PhoneFrame>
  );
};
