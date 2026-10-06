import React, { useState, useMemo, useEffect } from 'react';
import { PhoneFrame } from '../components/PhoneFrame';
import { HeaderBanner } from '../components/HeaderBanner';
import { useApp, normalizeLanguageCode, supportedLanguages, getI18n } from '../context/AppContext';

const LANGUAGES = supportedLanguages
  .map(({ name, nativeName, country, code }) => [name, nativeName, country, code])
  .sort((a, b) => a[0].localeCompare(b[0], 'it'));

const FlagIcon = ({ cc, name }) => {
  const [imgError, setImgError] = useState(false);

  if (!cc || imgError) {
    return <span className="lang-flag-globe" role="img" aria-label={name}>🌐</span>;
  }

  return (
    <img
      className="lang-flag-img"
      src={`https://flagcdn.com/w80/${cc}.png`}
      alt={name}
      onError={() => setImgError(true)}
    />
  );
};

export const Lingua = () => {
  const { language, setLanguage } = useApp();
  const fallbackLang = LANGUAGES.find(l => l[0] === 'Italiano') || LANGUAGES[0];
  const normalizedLanguage = normalizeLanguageCode(language);
  const currentLang = LANGUAGES.find(l => normalizeLanguageCode(l[3]) === normalizedLanguage) || fallbackLang;
  
  const [selectedLang, setSelectedLang] = useState(currentLang);
  const [appliedLang, setAppliedLang] = useState(currentLang);
  const [searchQuery, setSearchQuery] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [isOpen, setIsOpen] = useState(false); // Collapsed by default

  useEffect(() => {
    const nextLang = LANGUAGES.find(l => normalizeLanguageCode(l[3]) === normalizeLanguageCode(language)) || fallbackLang;
    setSelectedLang(nextLang);
    setAppliedLang(nextLang);
  }, [language, fallbackLang]);

  const t = useMemo(() => getI18n(language), [language]);

  const filteredLanguages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return LANGUAGES;
    return LANGUAGES.filter(
      ([name, native]) => name.toLowerCase().includes(q) || native.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const toggleDropdown = () => {
    setIsOpen(prev => !prev);
  };

  const handleApply = () => {
    setLanguage(selectedLang[3]);
    setAppliedLang(selectedLang);

    setIsApplying(true);
    setTimeout(() => {
      setIsApplying(false);
      setIsOpen(false); // Smoothly collapse after applying
    }, 1200);
  };

  return (
    <PhoneFrame toolbarTitle="RoR Lingua App">
      <HeaderBanner backTo="/altro" />

      <div className="app-content" style={{ padding: '12px 16px 85px 16px' }}>
        <div className="app-page-view active" id="page-lingua">

          {/* INTESTAZIONE PAGINA */}
          <div className="user-welcome-row" style={{ marginTop: '4px', marginBottom: '8px' }}>
            <div className="user-greeting-text">
              <h2 className="greeting-main-title" style={{ fontSize: '1.35rem', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                {t.heading}
              </h2>
            </div>
          </div>

          {/* DESCRIZIONE PAGINA */}
          <p className="info-text" style={{ marginBottom: '14px', fontSize: '0.84rem', lineHeight: '1.45', color: 'var(--text-muted)' }}>
            {t.desc}
          </p>

          {/* SCHEDA HERO LINGUA ATTIVA (PULSANTE A FISARMONICA) */}
          <button
            className={`lang-active-card ${isOpen ? 'open' : ''}`}
            onClick={toggleDropdown}
            type="button"
            aria-expanded={isOpen}
            style={{ marginBottom: isOpen ? '16px' : '20px' }}
          >
            <span className="lang-flag" style={{ display: 'flex', alignItems: 'center' }}>
              <FlagIcon cc={appliedLang[2]} name={appliedLang[0]} />
            </span>
            <div className="lang-info">
              <span className="lang-name">{appliedLang[0]}</span>
              <span className="lang-sub">{t.activeLabel} &bull; {isOpen ? (t.closeLabel || 'Tocca per chiudere') : (t.openLabel || 'Tocca per aprire')}</span>
            </div>
            <div
              className="lang-chevron-btn"
              style={{
                transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)'
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0c2b17" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </div>
          </button>

          {/* CONTENUTO A FISARMONICA ESPANDIBILE */}
          {isOpen && (
            <div className="lang-accordion-content" style={{ animation: 'fadeIn 0.3s ease-in-out' }}>
              
              {/* BARRA DI RICERCA FISSA */}
              <div className="search-bar-sticky">
                <div className="search-bar-inline">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                  <input
                    type="text"
                    placeholder={t.searchPh}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    aria-label="Cerca lingua"
                    autoFocus
                  />
                </div>
              </div>

              {/* ETICHETTA DELLA SEZIONE */}
              <div className="section-label">{t.section}</div>

              {/* ELENCO DELLE LINGUE */}
              <div className="lang-list-wrapper">
                {filteredLanguages.length > 0 ? (
                  filteredLanguages.map((lang) => {
                    const [name, native, cc] = lang;
                    const isSelected = selectedLang[0] === name;

                    return (
                      <button
                        key={name}
                        className={`lang-row ${isSelected ? 'selected' : ''}`}
                        onClick={() => setSelectedLang(lang)}
                        type="button"
                      >
                        <span className="lang-flag" style={{ display: 'flex', alignItems: 'center' }}>
                          <FlagIcon cc={cc} name={name} />
                        </span>
                        <div className="lang-info-row">
                          <span className="lang-name-row">{name}</span>
                          <span className="lang-native-row">{native}</span>
                        </div>
                        <span className="lang-check">
                          {isSelected && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                          )}
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <div className="no-results" style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '30px 10px' }}>
                    {t.noRes}
                  </div>
                )}
              </div>

              {/* PULSANTE PER APPLICARE LA LINGUA */}
              <div className="apply-lang-wrap">
                <button
                  className="apply-lang-btn"
                  onClick={handleApply}
                  disabled={isApplying}
                  type="button"
                >
                  <span className="apply-lang-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  </span>
                  <span>{isApplying ? t.applied : t.applyBtn}</span>
                </button>
              </div>

            </div>
          )}

          {/* SCHEDA INFORMATIVA PIATTAFORMA INCLUSIVA */}
          <div className="info-card">
            <div className="info-title" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="2" y1="12" x2="22" y2="12"></line>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
              </svg>
              {t.infoTitle}
            </div>
            <div className="info-text" style={{ fontSize: '0.84rem', lineHeight: '1.45', color: 'var(--text-muted)' }}>
              {t.infoText}
            </div>
          </div>

        </div>
      </div>
    </PhoneFrame>
  );
};
