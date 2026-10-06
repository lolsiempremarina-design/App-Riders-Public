import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { PhoneFrame } from '../components/PhoneFrame';
import { HeaderBanner } from '../components/HeaderBanner';
import { useApp } from '../context/AppContext';
import { authService, authErrorMessage, fieldErrorsToList } from '../services';
import { resizeImageToDataUrl } from '../utils/imageUtils';
import {
  calculatePasswordStrength,
  getRememberMePreference,
  setRememberMePreference,
  redirectPathFromState,
  latestAdultBirthDate,
  isValidPhoneNumber
} from '../utils/authUtils';
import {
  buildFiscalCode,
  MUNICIPALITY_CODES,
  FALLBACK_MUNICIPALITIES
} from '../utils/fiscalCodeUtils';

/** Nome di un comune senza maiuscole, accenti e spazi doppi, per confrontare ciò che si digita. */
const normalizePlaceName = (value) => String(value || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Elenco dei prefissi telefonici internazionali supportati con bandiere e codici ISO.
 */
const PHONE_PREFIXES = [
  ['Afghanistan', 'af', '+93'], ['Albania', 'al', '+355'], ['Algeria', 'dz', '+213'], ['Andorra', 'ad', '+376'], ['Angola', 'ao', '+244'],
  ['Argentina', 'ar', '+54'], ['Armenia', 'am', '+374'], ['Australia', 'au', '+61'], ['Austria', 'at', '+43'], ['Azerbaijan', 'az', '+994'],
  ['Bahamas', 'bs', '+1'], ['Bahrain', 'bh', '+973'], ['Bangladesh', 'bd', '+880'], ['Barbados', 'bb', '+1'], ['Belarus', 'by', '+375'],
  ['Belgium', 'be', '+32'], ['Belize', 'bz', '+501'], ['Benin', 'bj', '+229'], ['Bolivia', 'bo', '+591'], ['Bosnia and Herzegovina', 'ba', '+387'],
  ['Brazil', 'br', '+55'], ['Bulgaria', 'bg', '+359'], ['Burkina Faso', 'bf', '+226'], ['Cambodia', 'kh', '+855'], ['Cameroon', 'cm', '+237'],
  ['Canada', 'ca', '+1'], ['Cape Verde', 'cv', '+238'], ['Chile', 'cl', '+56'], ['China', 'cn', '+86'], ['Colombia', 'co', '+57'],
  ['Costa Rica', 'cr', '+506'], ['Croatia', 'hr', '+385'], ['Cuba', 'cu', '+53'], ['Cyprus', 'cy', '+357'], ['Czech Republic', 'cz', '+420'],
  ['Denmark', 'dk', '+45'], ['Dominican Republic', 'do', '+1'], ['Ecuador', 'ec', '+593'], ['Egypt', 'eg', '+20'], ['Estonia', 'ee', '+372'],
  ['Ethiopia', 'et', '+251'], ['Finland', 'fi', '+358'], ['France', 'fr', '+33'], ['Georgia', 'ge', '+995'], ['Germany', 'de', '+49'],
  ['Ghana', 'gh', '+233'], ['Greece', 'gr', '+30'], ['Guatemala', 'gt', '+502'], ['Haiti', 'ht', '+509'], ['Honduras', 'hn', '+504'],
  ['Hong Kong', 'hk', '+852'], ['Hungary', 'hu', '+36'], ['Iceland', 'is', '+354'], ['India', 'in', '+91'], ['Indonesia', 'id', '+62'],
  ['Iran', 'ir', '+98'], ['Iraq', 'iq', '+964'], ['Ireland', 'ie', '+353'], ['Israel', 'il', '+972'], ['Italy', 'it', '+39'],
  ['Jamaica', 'jm', '+1'], ['Japan', 'jp', '+81'], ['Jordan', 'jo', '+962'], ['Kazakhstan', 'kz', '+7'], ['Kenya', 'ke', '+254'],
  ['Kuwait', 'kw', '+965'], ['Latvia', 'lv', '+371'], ['Lebanon', 'lb', '+961'], ['Libya', 'ly', '+218'], ['Liechtenstein', 'li', '+423'],
  ['Lithuania', 'lt', '+370'], ['Luxembourg', 'lu', '+352'], ['Malaysia', 'my', '+60'], ['Malta', 'mt', '+356'], ['Mexico', 'mx', '+52'],
  ['Moldova', 'md', '+373'], ['Monaco', 'mc', '+377'], ['Mongolia', 'mn', '+976'], ['Montenegro', 'me', '+382'], ['Morocco', 'ma', '+212'],
  ['Nepal', 'np', '+977'], ['Netherlands', 'nl', '+31'], ['New Zealand', 'nz', '+64'], ['Nicaragua', 'ni', '+505'], ['Nigeria', 'ng', '+234'],
  ['North Macedonia', 'mk', '+389'], ['Norway', 'no', '+47'], ['Oman', 'om', '+968'], ['Pakistan', 'pk', '+92'], ['Panama', 'pa', '+507'],
  ['Paraguay', 'py', '+595'], ['Peru', 'pe', '+51'], ['Philippines', 'ph', '+63'], ['Poland', 'pl', '+48'], ['Portugal', 'pt', '+351'],
  ['Qatar', 'qa', '+974'], ['Romania', 'ro', '+40'], ['San Marino', 'sm', '+378'], ['Saudi Arabia', 'sa', '+966'], ['Serbia', 'rs', '+381'],
  ['Singapore', 'sg', '+65'], ['Slovakia', 'sk', '+421'], ['Slovenia', 'si', '+386'], ['South Africa', 'za', '+27'], ['South Korea', 'kr', '+82'],
  ['Spain', 'es', '+34'], ['Sri Lanka', 'lk', '+94'], ['Sudan', 'sd', '+249'], ['Sweden', 'se', '+46'], ['Switzerland', 'ch', '+41'],
  ['Taiwan', 'tw', '+886'], ['Thailand', 'th', '+66'], ['Tunisia', 'tn', '+216'], ['Turkey', 'tr', '+90'], ['Ukraine', 'ua', '+380'],
  ['United Arab Emirates', 'ae', '+971'], ['United Kingdom', 'gb', '+44'], ['United States', 'us', '+1'], ['Uruguay', 'uy', '+598'],
  ['Vatican City', 'va', '+39'], ['Venezuela', 've', '+58'], ['Vietnam', 'vn', '+84'], ['Zambia', 'zm', '+260'], ['Zimbabwe', 'zw', '+263']
].sort((a, b) => a[0].localeCompare(b[0], 'it'));

/**
 * Elenco delle 107 province italiane ufficiali.
 */
const ITALIAN_PROVINCES = [
  ['Agrigento', 'AG'], ['Alessandria', 'AL'], ['Ancona', 'AN'], ['Aosta', 'AO'], ['Arezzo', 'AR'], ['Ascoli Piceno', 'AP'], ['Asti', 'AT'],
  ['Avellino', 'AV'], ['Bari', 'BA'], ['Barletta-Andria-Trani', 'BT'], ['Belluno', 'BL'], ['Benevento', 'BN'], ['Bergamo', 'BG'], ['Biella', 'BI'],
  ['Bologna', 'BO'], ['Bolzano', 'BZ'], ['Brescia', 'BS'], ['Brindisi', 'BR'], ['Cagliari', 'CA'], ['Caltanissetta', 'CL'], ['Campobasso', 'CB'],
  ['Caserta', 'CE'], ['Catania', 'CT'], ['Catanzaro', 'CZ'], ['Chieti', 'CH'], ['Como', 'CO'], ['Cosenza', 'CS'], ['Cremona', 'CR'], ['Crotone', 'KR'],
  ['Cuneo', 'CN'], ['Enna', 'EN'], ['Fermo', 'FM'], ['Ferrara', 'FE'], ['Firenze', 'FI'], ['Foggia', 'FG'], ['Forlì-Cesena', 'FC'], ['Frosinone', 'FR'],
  ['Genova', 'GE'], ['Gorizia', 'GO'], ['Grosseto', 'GR'], ['Imperia', 'IM'], ['Isernia', 'IS'], ['L’Aquila', 'AQ'], ['La Spezia', 'SP'], ['Latina', 'LT'],
  ['Lecce', 'LE'], ['Lecco', 'LC'], ['Livorno', 'LI'], ['Lodi', 'LO'], ['Lucca', 'LU'], ['Macerata', 'MC'], ['Mantova', 'MN'], ['Massa-Carrara', 'MS'],
  ['Matera', 'MT'], ['Messina', 'ME'], ['Milano', 'MI'], ['Modena', 'MO'], ['Monza e della Brianza', 'MB'], ['Napoli', 'NA'], ['Novara', 'NO'],
  ['Nuoro', 'NU'], ['Oristano', 'OR'], ['Padova', 'PD'], ['Palermo', 'PA'], ['Parma', 'PR'], ['Pavia', 'PV'], ['Perugia', 'PG'], ['Pesaro e Urbino', 'PU'],
  ['Pescara', 'PE'], ['Piacenza', 'PC'], ['Pisa', 'PI'], ['Pistoia', 'PT'], ['Pordenone', 'PN'], ['Potenza', 'PZ'], ['Prato', 'PO'], ['Ragusa', 'RG'],
  ['Ravenna', 'RA'], ['Reggio Calabria', 'RC'], ['Reggio Emilia', 'RE'], ['Rieti', 'RI'], ['Rimini', 'RN'], ['Roma', 'RM'], ['Rovigo', 'RO'],
  ['Salerno', 'SA'], ['Sassari', 'SS'], ['Savona', 'SV'], ['Siena', 'SI'], ['Siracusa', 'SR'], ['Sondrio', 'SO'], ['Sud Sardegna', 'SU'], ['Taranto', 'TA'],
  ['Teramo', 'TE'], ['Terni', 'TR'], ['Torino', 'TO'], ['Trapani', 'TP'], ['Trento', 'TN'], ['Treviso', 'TV'], ['Trieste', 'TS'], ['Udine', 'UD'],
  ['Varese', 'VA'], ['Venezia', 'VE'], ['Verbano-Cusio-Ossola', 'VB'], ['Vercelli', 'VC'], ['Verona', 'VR'], ['Vibo Valentia', 'VV'], ['Vicenza', 'VI'], ['Viterbo', 'VT']
].sort((a, b) => a[0].localeCompare(b[0], 'it'));

/** Bandierina del paese selezionato */
const Flag = ({ country, label }) => (
  <img
    className="reg-phone-flag"
    src={`https://flagcdn.com/w40/${country}.png`}
    alt={label}
    style={{ width: '24px', height: '16px', objectFit: 'cover', borderRadius: '2px', border: '1px solid rgba(0,0,0,0.1)' }}
  />
);


/**
 * Pagina di Registrazione Anagrafica Rider.
 * Include validazione automatica del Codice Fiscale (calcolato tramite buildFiscalCode),
 * selettore internazionale di prefissi, comuni d'Italia e salvataggio locale del profilo.
 */
/** Evita l'iniezione di HTML nei testi mostrati nella modale. */
const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export const Register = () => {
  const navigate = useNavigate();
  // Pagina protetta richiesta prima della registrazione (es. link d'invito a un gruppo)
  const location = useLocation();
  const redirectTo = redirectPathFromState(location.state, '/profilo');
  const { openModal, showToast, t, registerUser, language } = useApp();

  const [phoneSelection, setPhoneSelection] = useState('it:+39');
  const [sosSelection, setSosSelection] = useState('it:+39');
  // nessun dato di nascita precompilato: valori non toccati finirebbero nel codice fiscale
  const [personData, setPersonData] = useState({
    surname: '',
    name: '',
    birthDate: '',
    gender: '',
    province: '',
    municipality: '',
    municipalityCode: ''
  });
  // nato/a all'estero: il codice fiscale (con il codice dello Stato, Z...) si inserisce a mano
  const [bornAbroad, setBornAbroad] = useState(false);
  const [birthCountry, setBirthCountry] = useState('');
  // comune soppresso o fuso con un altro: non è nell'elenco ISTAT vigente, il codice fiscale
  // (con il codice catastale di allora) si inserisce a mano
  const [municipalityNotListed, setMunicipalityNotListed] = useState(false);
  const [manualFiscalCode, setManualFiscalCode] = useState('');
  const [municipalities, setMunicipalities] = useState(FALLBACK_MUNICIPALITIES);
  const [municipalitySource, setMunicipalitySource] = useState(null);
  const [photo, setPhoto] = useState('');
  const [formErrors, setFormErrors] = useState([]);
  const [passwordValue, setPasswordValue] = useState('');
  const [rememberMe, setRememberMe] = useState(() => getRememberMePreference());

  // Calcolo in tempo reale della sicurezza della password
  const pwdStrength = calculatePasswordStrength(passwordValue);

  const selectedPhoneCountry = PHONE_PREFIXES.find(([, code, prefix]) => `${code}:${prefix}` === phoneSelection)?.[1] || 'it';
  const selectedSosCountry = PHONE_PREFIXES.find(([, code, prefix]) => `${code}:${prefix}` === sosSelection)?.[1] || 'it';
  const manualFiscalCodeMode = bornAbroad || municipalityNotListed;
  const generatedFiscalCode = manualFiscalCodeMode ? '' : buildFiscalCode(personData);
  const fiscalCodeValue = manualFiscalCodeMode ? manualFiscalCode : generatedFiscalCode;
  const municipalityMissing = !bornAbroad && personData.municipality.trim() !== '' && !personData.municipalityCode;
  const municipalityUnknown = municipalityMissing && !municipalityNotListed;

  const updatePersonData = (field) => (event) => {
    setPersonData((current) => ({ ...current, [field]: event.target.value }));
  };

  // solo maggiorenni: il campo non accetta date successive e spiega perché
  const adultBirthDateLimit = latestAdultBirthDate();
  const updateBirthDate = (event) => {
    event.target.setCustomValidity(event.target.value > adultBirthDateLimit
      ? (t.regMinAge || 'Per registrarti devi avere almeno 18 anni.')
      : '');
    updatePersonData('birthDate')(event);
  };

  const updateProvince = (event) => {
    const provinceCode = event.target.value;
    setPersonData((current) => ({
      ...current,
      province: provinceCode,
      municipality: '',
      municipalityCode: ''
    }));
  };

  // Il comune si può scrivere a mano: confronto senza maiuscole né accenti ("forli" = "Forlì").
  // Se non è nell'elenco il codice catastale resta vuoto (niente codice fiscale inventato).
  const updateMunicipality = (event) => {
    const municipalityName = event.target.value;
    const key = normalizePlaceName(municipalityName);
    const candidates = municipalities.filter((item) => normalizePlaceName(item.name) === key);
    const found = candidates.find((item) => item.province === personData.province) || candidates[0];
    setPersonData((current) => ({
      ...current,
      municipality: municipalityName,
      municipalityCode: key ? found?.cadastralCode || '' : ''
    }));
  };

  /**
   * Comuni italiani dall'elenco ufficiale ISTAT servito dal nostro backend (niente siti esterni).
   */
  useEffect(() => {
    let isMounted = true;
    authService.getMunicipalities()
      .then(({ list, source, updated }) => {
        if (!isMounted) return;
        setMunicipalities(list);
        setMunicipalitySource({ source, updated });
      })
      .catch(() => {
        if (!isMounted) return;
        setMunicipalities(FALLBACK_MUNICIPALITIES);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const selectedMunicipalities = municipalities
    .filter((item) => !personData.province || !item.province || item.province === personData.province)
    .sort((a, b) => a.name.localeCompare(b.name, 'it'));

  const validatePasswords = (event) => {
    const form = event.currentTarget.form;
    const password = form.elements.password;
    const passwordConfirm = form.elements.passwordConfirm;
    if (password) {
      setPasswordValue(password.value);
    }
    if (password && passwordConfirm) {
      passwordConfirm.setCustomValidity(password.value === passwordConfirm.value ? '' : (t.regPasswordMismatch || 'Le password non coincidono.'));
    }
  };

  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const phonePrefix = phoneSelection.split(':')[1];
    const sosPrefix = sosSelection.split(':')[1];
    const phoneDigits = String(formData.get('phone') || '').trim();
    const sosPhoneDigits = String(formData.get('sosPhone') || '').trim();
    // nome ufficiale del comune scelto ("forli" scritto a mano → "Forlì"), se riconosciuto nell'elenco
    const officialMunicipality = municipalities.find((item) => item.cadastralCode === personData.municipalityCode)?.name;
    const municipality = officialMunicipality
      || String(formData.get('municipality') || personData.municipality || '').trim();
    const province = formData.get('province') || personData.province;
    const email = String(formData.get('email') || '').trim();

    // Payload nel formato atteso da POST /api/auth/register
    const payload = {
      username: String(formData.get('username') || '').trim(),
      email,
      password: formData.get('password'),
      password_confirm: formData.get('passwordConfirm'),
      first_name: String(formData.get('name') || personData.name || '').trim(),
      last_name: String(formData.get('surname') || personData.surname || '').trim(),
      date_of_birth: formData.get('birthDate') || personData.birthDate,
      gender: formData.get('gender') || personData.gender,
      birth_city_country: bornAbroad
        ? birthCountry.trim()
        : (province ? `${municipality} (${province})` : municipality),
      tax_id_code: manualFiscalCodeMode ? manualFiscalCode.trim().toUpperCase() : generatedFiscalCode,
      phone_number: phoneDigits ? `${phonePrefix} ${phoneDigits}` : '',
      avatar: photo || null,
      language: ['it', 'en', 'es'].includes(language) ? language : 'it',
      remember: rememberMe,
      sos_contact: {
        name: `${formData.get('sosName') || ''} ${formData.get('sosSurname') || ''}`.trim(),
        phone: sosPhoneDigits ? `${sosPrefix} ${sosPhoneDigits}` : '',
        email: String(formData.get('sosEmail') || '').trim()
      }
    };

    // stessa regola del Profilo e del server (8–15 cifre): prima qui passava qualsiasi testo
    const phoneMessage = t.regPhoneInvalid || 'Il numero di telefono deve avere da 8 a 15 cifre.';
    const phoneErrors = [
      ['phone_number', payload.phone_number],
      ['sos_contact.phone', payload.sos_contact.phone]
    ].filter(([, value]) => value && !isValidPhoneNumber(value))
      .map(([field]) => ({ field, label: t.fieldLabels?.[field] || field, message: phoneMessage }));
    if (phoneErrors.length) {
      setFormErrors(phoneErrors);
      return;
    }

    setIsLoading(true);
    setFormErrors([]);
    // Salvataggio della preferenza Ricordami su questo dispositivo
    setRememberMePreference(rememberMe, email);

    let profile = null;
    try {
      profile = await authService.register(payload);
    } catch (err) {
      const fieldErrors = fieldErrorsToList(err.fields, t);
      setFormErrors(fieldErrors);
      showToast(authErrorMessage(err, t), 'error', 4000);
      return;
    } finally {
      setIsLoading(false);
    }

    registerUser(profile);
    if (profile && profile.emailConfirmed === false) {
      // posta configurata: prima il codice inviato all'email (ProtectedRoute porterebbe comunque lì)
      navigate('/conferma-email', { replace: true });
      return;
    }
    showToast(t.regSuccessToast || 'Registrazione completata con successo! 🎉', 'success', 2500);

    openModal(
      t.regSuccessToast || 'Registrazione Completata ✅',
      `<p style="font-size:0.86rem; color:var(--text-main);">${escapeHtml(t.regWelcomeBody || 'Benvenuto in RoR {name}! Il tuo account è stato creato e la sessione è attiva.').replace('{name}', `<strong>${escapeHtml(`${profile?.name || ''} ${profile?.surname || ''}`.trim())}</strong>`)}</p>`,
      t.accediModalSuccessBtn || 'Vai al Profilo',
      () => navigate(redirectTo, { replace: true })
    );
  };

  return (
    <PhoneFrame showNavbar={false} toolbarTitle="RoR Registrazione Anagrafica">
      <HeaderBanner backTo="/login" />

      <div className="app-content" style={{ padding: '16px 16px 30px 16px' }}>
        <div className="app-page-view active" id="page-register">

          {/* INTESTAZIONE DI BENVENUTO */}
          <div className="user-welcome-row" style={{ marginBottom: '20px', gap: '14px' }}>
            <div className="auth-logo-circle" style={{ width: '52px', height: '52px', flexShrink: 0 }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
            </div>
            <div className="user-greeting-text">
              <h2 className="greeting-main-title" style={{ fontSize: '1.45rem' }}>{t.regTitle || "Registrazione Rider"}</h2>
              <span className="greeting-subtitle">{t.regSubtitle || "Crea il tuo account di guida e flotta."}</span>
            </div>
          </div>

          <form onSubmit={handleSubmit}>

            {/* SCHEDA 1: DATI ANAGRAFICI */}
            <div className="reg-card" style={{ marginBottom: '16px' }}>
              <div className="reg-card-head">
                <span className="reg-card-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                </span>
                <span className="reg-card-title">{t.profiloPersonalData || "Dati Anagrafici"}</span>
              </div>

              <div className="reg-field-group">
                <div className="reg-field-wrapper">
                  <label className="reg-field-label" htmlFor="reg-ssn">
                    {manualFiscalCodeMode ? (t.regFiscalCodeManual || 'Codice Fiscale') : (t.regFiscalCode || 'Codice Fiscale Calcolato')}
                  </label>
                  <input
                    type="text"
                    id="reg-ssn"
                    name="fiscalCode"
                    className="reg-input-text"
                    value={fiscalCodeValue}
                    onChange={manualFiscalCodeMode ? (e) => setManualFiscalCode(e.target.value.toUpperCase()) : undefined}
                    placeholder={manualFiscalCodeMode
                      ? (bornAbroad ? 'RSSMRA90A01Z600X' : 'RSSMRA90A01H501X')
                      : (t.regFiscalCodeAuto || 'Generato automaticamente')}
                    readOnly={!manualFiscalCodeMode}
                    required
                    minLength={16}
                    maxLength={16}
                    autoCapitalize="characters"
                    style={{ fontWeight: '700', letterSpacing: '1px', background: 'rgba(5, 150, 105, 0.06)' }}
                  />
                  <small className="reg-field-help" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                    {manualFiscalCodeMode
                      ? (t.regFiscalCodeManualHelp || 'Copialo dalla tessera sanitaria o dal documento dell\'Agenzia delle Entrate.')
                      : (t.regFiscalCodeHelp || 'Calcolato con codice catastale e carattere di controllo.')}
                  </small>
                </div>

                <div className="reg-field-row-2col">
                  <div className="reg-field-wrapper">
                    <label className="reg-field-label" htmlFor="reg-nome">{t.regName || "Nome"}</label>
                    <input type="text" id="reg-nome" name="name" className="reg-input-text" placeholder="Mario" onChange={updatePersonData('name')} required />
                  </div>
                  <div className="reg-field-wrapper">
                    <label className="reg-field-label" htmlFor="reg-cognome">{t.regSurname || "Cognome"}</label>
                    <input type="text" id="reg-cognome" name="surname" className="reg-input-text" placeholder="Rossi" onChange={updatePersonData('surname')} required />
                  </div>
                </div>

                <div className="reg-field-row-2col">
                  <div className="reg-field-wrapper">
                    <label className="reg-field-label" htmlFor="reg-dob">{t.regBirthDate || "Data di Nascita"}</label>
                    <input type="date" id="reg-dob" name="birthDate" className="reg-input-text" value={personData.birthDate} max={adultBirthDateLimit} onChange={updateBirthDate} style={{ color: 'var(--text-main)' }} required />
                  </div>
                  <div className="reg-field-wrapper">
                    <label className="reg-field-label" htmlFor="reg-gender">{t.regGender || "Genere"}</label>
                    <select id="reg-gender" name="gender" className="reg-input-text" value={personData.gender} onChange={updatePersonData('gender')} required>
                      <option value="" disabled>{t.regSelectGender || '-- Seleziona --'}</option>
                      <option value="M">{t.regGenderM || "Maschio (M)"}</option>
                      <option value="F">{t.regGenderF || "Femmina (F)"}</option>
                    </select>
                  </div>
                </div>

                <label htmlFor="reg-abroad" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', color: 'var(--text-main)', margin: '4px 0 10px' }}>
                  <input type="checkbox" id="reg-abroad" checked={bornAbroad} onChange={(e) => setBornAbroad(e.target.checked)} />
                  {t.regBornAbroad || "Nato/a all'estero"}
                </label>

                {bornAbroad ? (
                  <div className="reg-field-wrapper">
                    <label className="reg-field-label" htmlFor="reg-birth-country">{t.regBirthCountry || 'Stato di nascita'}</label>
                    <input type="text" id="reg-birth-country" name="birthCountry" className="reg-input-text" value={birthCountry}
                      onChange={(e) => setBirthCountry(e.target.value)} placeholder={t.regBirthCountryPh || 'es. Argentina'} minLength={2} required />
                  </div>
                ) : (
                  <div className="reg-field-row-2col">
                    <div className="reg-field-wrapper">
                      <label className="reg-field-label" htmlFor="reg-pob">{t.regProvince || "Provincia di Nascita"}</label>
                      <select id="reg-pob" name="province" className="reg-input-text" value={personData.province} onChange={updateProvince} required>
                        <option value="" disabled>{t.regSelectProvince || "-- Seleziona Provincia --"}</option>
                        {ITALIAN_PROVINCES.map(([provName, provCode]) => (
                          <option key={provCode} value={provCode}>{provName} ({provCode})</option>
                        ))}
                      </select>
                    </div>
                    <div className="reg-field-wrapper">
                      <label className="reg-field-label" htmlFor="reg-municipality">{t.regMunicipality || "Comune di Nascita"}</label>
                      <input
                        type="text"
                        id="reg-municipality"
                        name="municipality"
                        className="reg-input-text"
                        list="reg-municipalities"
                        value={personData.municipality}
                        placeholder={t.regSelectMunicipality || "-- Seleziona Comune --"}
                        onChange={updateMunicipality}
                        aria-invalid={municipalityUnknown}
                        required
                      />
                      <datalist id="reg-municipalities">
                        {selectedMunicipalities.map((mun) => (
                          <option key={`${mun.province}-${mun.name}`} value={mun.name}>{mun.cadastralCode}</option>
                        ))}
                      </datalist>
                      {municipalityUnknown && (
                        <small role="alert" style={{ fontSize: '0.75rem', color: 'var(--text-danger)', marginTop: '4px', display: 'block' }}>
                          {t.regMunicipalityPick || "Scegli il comune dall'elenco: serve per calcolare il codice fiscale."}
                        </small>
                      )}
                      {municipalitySource && (
                        <small style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                          {(t.regMunicipalitySource || 'Elenco dei comuni: {source}, aggiornato al {date}')
                            .replace('{source}', municipalitySource.source)
                            .replace('{date}', municipalitySource.updated)}
                        </small>
                      )}
                    </div>
                  </div>
                )}

                {/* l'elenco ISTAT contiene solo i comuni di oggi: chi è nato in un comune soppresso o fuso lo scrive
                    e inserisce il proprio codice fiscale (il server controlla nome, data, sesso e carattere di controllo) */}
                {!bornAbroad && (municipalityMissing || municipalityNotListed) && (
                  <label htmlFor="reg-municipality-not-listed" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.84rem', color: 'var(--text-main)', margin: '4px 0 10px' }}>
                    <input type="checkbox" id="reg-municipality-not-listed" checked={municipalityNotListed}
                      onChange={(e) => setMunicipalityNotListed(e.target.checked)} style={{ marginTop: '3px' }} />
                    {t.regMunicipalityNotListed || "Il mio comune di nascita non esiste più (soppresso o fuso con un altro): inserisco il codice fiscale a mano"}
                  </label>
                )}

                <div className="reg-field-wrapper">
                  <label className="reg-field-label" htmlFor="reg-phone">{t.regPhone || "Telefono Cellulare"}</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <select
                      name="phonePrefix"
                      value={phoneSelection}
                      onChange={(e) => setPhoneSelection(e.target.value)}
                      style={{ flex: '0 0 110px', padding: '10px 8px', borderRadius: '12px', border: '1px solid #ccc', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '0.85rem' }}
                      required
                    >
                      {PHONE_PREFIXES.map(([country, code, prefix]) => (
                        <option key={`${code}-${prefix}`} value={`${code}:${prefix}`}>{prefix} ({code.toUpperCase()})</option>
                      ))}
                    </select>
                    <Flag country={selectedPhoneCountry} label="Bandiera" />
                    <input type="tel" id="reg-phone" name="phone" className="reg-input-text" placeholder="348 1234567" style={{ flex: 1 }} required />
                  </div>
                </div>

                <div className="reg-field-wrapper">
                  <label className="reg-field-label" htmlFor="reg-username">{t.regUsername || "Nome Utente"}</label>
                  <input
                    type="text"
                    id="reg-username"
                    name="username"
                    className="reg-input-text"
                    placeholder="mario_rider"
                    autoComplete="username"
                    autoCapitalize="none"
                    minLength="3"
                    maxLength="50"
                    pattern="[A-Za-z0-9_.\-]{3,50}"
                    title={t.usernameRuleHint || '3-50 caratteri: lettere, numeri, punto, trattino o underscore'}
                    required
                  />
                </div>

                <div className="reg-field-wrapper">
                  <label className="reg-field-label" htmlFor="reg-email">{t.regEmail || "Email Personale"}</label>
                  <input type="email" id="reg-email" name="email" className="reg-input-text" placeholder="nome.cognome@email.com" autoComplete="email" required />
                </div>

                <div className="reg-field-row-2col">
                  <div className="reg-field-wrapper">
                    <label className="reg-field-label" htmlFor="reg-password">{t.regPassword || "Password"}</label>
                    <input type="password" id="reg-password" name="password" className="reg-input-text" placeholder="••••••••" minLength="8" autoComplete="new-password" onChange={validatePasswords} required />
                  </div>
                  <div className="reg-field-wrapper">
                    <label className="reg-field-label" htmlFor="reg-password-confirm">{t.regPasswordConfirmLabel || 'Conferma password'}</label>
                    <input type="password" id="reg-password-confirm" name="passwordConfirm" className="reg-input-text" placeholder="••••••••" minLength="8" autoComplete="new-password" onChange={validatePasswords} required />
                  </div>
                </div>

                {/* Indicatore visivo di sicurezza della password (Strength Meter) */}
                {passwordValue && (
                  <div className="pwd-strength-container" role="status" aria-live="polite">
                    <div className="pwd-strength-bar-track">
                      <div
                        className="pwd-strength-bar-fill"
                        style={{
                          width: `${pwdStrength.percent}%`,
                          backgroundColor: pwdStrength.color
                        }}
                      />
                    </div>
                    <div className="pwd-strength-info">
                      <span className="pwd-strength-label">
                        {t.pwdStrengthLabel || "Sicurezza Password:"}{' '}
                        <strong style={{ color: pwdStrength.color }}>
                          {t[pwdStrength.labelKey] || pwdStrength.level}
                        </strong>
                      </span>
                      <span className="pwd-strength-hint">
                        {pwdStrength.level === 'strong'
                          ? (t.pwdStrengthRobust || "✓ Password robusta")
                          : (t.pwdStrengthHint || "Usa 8+ caratteri con lettere, numeri e simboli")}
                      </span>
                    </div>
                  </div>
                )}

                <div className="reg-field-wrapper">
                  <label className="reg-field-label" htmlFor="reg-photo">{t.regPhotoOptional || 'Foto profilo (facoltativa)'}</label>
                  <input
                    type="file"
                    id="reg-photo"
                    className="reg-input-text"
                    accept="image/*"
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      try {
                        // Ridimensionata a 256px per un invio leggero al server
                        setPhoto(await resizeImageToDataUrl(file, 256));
                      } catch {
                        setPhoto('');
                        showToast(t.regPhotoReadError || 'Impossibile leggere la foto selezionata.', 'error', 3000);
                      }
                    }}
                  />
                </div>

                {/* Switch: Ricordami su questo dispositivo */}
                <div className="auth-remember-row">
                  <label className="auth-remember-label" htmlFor="reg-remember-device-toggle">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="5" y="2" width="14" height="20" rx="3" ry="3"></rect>
                      <line x1="12" y1="18" x2="12.01" y2="18"></line>
                    </svg>
                    <span>{t.authRememberDevice || "Ricordami su questo dispositivo"}</span>
                  </label>
                  <label className="switch">
                    <input
                      type="checkbox"
                      id="reg-remember-device-toggle"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                    />
                    <span className="switch-slider"></span>
                  </label>
                </div>
              </div>
            </div>

            {/* SCHEDA 2: CONTATTI DI EMERGENZA SOS */}
            <div className="reg-card" style={{ marginBottom: '20px' }}>
              <div className="reg-card-head">
                <span className="reg-card-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                  </svg>
                </span>
                <span className="reg-card-title">{t.profiloEmergencyContacts || "Contatti SOS (Emergenza)"}</span>
              </div>

              <div className="reg-field-group">
                <div className="reg-field-row-2col">
                  <div className="reg-field-wrapper">
                    <label className="reg-field-label" htmlFor="reg-sos-nome">{t.regName || "Nome"}</label>
                    <input type="text" id="reg-sos-nome" name="sosName" className="reg-input-text" placeholder="Maria" required />
                  </div>
                  <div className="reg-field-wrapper">
                    <label className="reg-field-label" htmlFor="reg-sos-cognome">{t.regSurname || "Cognome"}</label>
                    <input type="text" id="reg-sos-cognome" name="sosSurname" className="reg-input-text" placeholder="Bianchi" required />
                  </div>
                </div>

                <div className="reg-field-wrapper">
                  <label className="reg-field-label" htmlFor="reg-sos-phone">{t.regSosPhone || "Telefono Emergenza SOS"}</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <select
                      name="sosPrefix"
                      value={sosSelection}
                      onChange={(e) => setSosSelection(e.target.value)}
                      style={{ flex: '0 0 110px', padding: '10px 8px', borderRadius: '12px', border: '1px solid #ccc', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '0.85rem' }}
                      required
                    >
                      {PHONE_PREFIXES.map(([country, code, prefix]) => (
                        <option key={`sos-${code}-${prefix}`} value={`${code}:${prefix}`}>{prefix} ({code.toUpperCase()})</option>
                      ))}
                    </select>
                    <Flag country={selectedSosCountry} label="Bandiera SOS" />
                    <input type="tel" id="reg-sos-phone" name="sosPhone" className="reg-input-text" placeholder="333 9876543" style={{ flex: 1 }} required />
                  </div>
                </div>

                <div className="reg-field-wrapper">
                  <label className="reg-field-label" htmlFor="reg-sos-email">{t.regSosEmailOptional || 'Email SOS (facoltativa)'}</label>
                  <input type="email" id="reg-sos-email" name="sosEmail" className="reg-input-text" placeholder="anna.bianchi@email.com" />
                </div>
              </div>
            </div>

            {/* ERRORI DI VALIDAZIONE RESTITUITI DAL SERVER */}
            {formErrors.length > 0 && (
              <div className="auth-form-error" role="alert">
                <strong>Controlla questi campi:</strong>
                <ul>
                  {formErrors.map((item) => (
                    <li key={item.field}><strong>{item.label}:</strong> {item.message}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* PULSANTE DI INVIO REGISTRAZIONE */}
            <button type="submit" className="save-btn" disabled={isLoading} style={{ marginBottom: '16px', opacity: isLoading ? 0.7 : 1 }}>
              <span>{isLoading ? (t.regLoading || 'Registrazione in corso...') :(t.regSubmitBtn || "Completa Registrazione 🚀")}</span>
            </button>
          </form>

        </div>
      </div>
    </PhoneFrame>
  );
};
