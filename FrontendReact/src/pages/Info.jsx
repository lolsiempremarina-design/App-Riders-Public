import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PhoneFrame } from '../components/PhoneFrame';
import { HeaderBanner } from '../components/HeaderBanner';
import { useApp } from '../context/AppContext';
import { infoGuideFor } from '../content/infoGuide';
import { isNativeApp } from '../native/platform';

const COLORS = {
  uso: '#10B981', sicurezza: '#EF4444', consegne: '#F59E0B', gruppi: '#3B82F6', bici: '#059669', faq: '#A855F7', app: '#64748B'
};

const ICONS = {
  uso: <path d="M12 22s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />,
  sicurezza: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M12 8v4 M12 16h.01" />,
  consegne: <path d="M3 7h13v10H3z M16 10h4l2 3v4h-6 M7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M18 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />,
  gruppi: <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8" />,
  bici: <path d="M5.5 20a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M18.5 20a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M12 17.5V14l-3-3 4-3 2 3h2.5" />,
  faq: <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3 M12 17h.01" />,
  app: <path d="M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z M12 18h.01" />
};

const sectionText = (section) => [
  section.title,
  section.subtitle,
  ...(section.items || []).flat(),
  ...(section.faq || []).flat()
].join(' ').toLowerCase();

/**
 * Pagina Info: guida delle funzioni reali dell'app (testi in src/content/infoGuide.js),
 * con ricerca, filtro per categoria e sezioni a fisarmonica.
 */
export const Info = () => {
  const navigate = useNavigate();
  const { t, language } = useApp();
  const guide = infoGuideFor(language, { native: isNativeApp() });
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('tutti');
  const [expandedSection, setExpandedSection] = useState('sessione');

  const filteredSections = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return guide.sections.filter((section) =>
      (activeCategory === 'tutti' || section.category === activeCategory) && (!query || sectionText(section).includes(query))
    );
  }, [guide, activeCategory, searchQuery]);

  const toggleSection = (id) => setExpandedSection((prev) => (prev === id ? null : id));

  return (
    <PhoneFrame toolbarTitle={t.infoToolbarTitle || 'RoR Info'} showNavbar={true}>
      <HeaderBanner backTo="/altro" />

      <div className="app-content" style={{ padding: '14px 16px 95px 16px' }}>
        <div className="app-page-view active" id="page-info">
          <section
            style={{
              background: 'linear-gradient(135deg, rgba(155, 225, 145, 0.25) 0%, rgba(16, 185, 129, 0.1) 100%)',
              borderRadius: '24px',
              padding: '18px 16px',
              border: '1px solid var(--ror-cyan)',
              marginBottom: '14px',
              boxShadow: 'var(--shadow-card)'
            }}
          >
            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-success)', textTransform: 'uppercase', letterSpacing: '0.8px', background: 'var(--bg-card-subtle)', padding: '4px 10px', borderRadius: '10px' }}>
              {guide.heroBadge}
            </span>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '10px 0 6px 0', color: 'var(--text-main)' }}>{guide.title}</h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-main)', opacity: 0.85, margin: 0, lineHeight: 1.4 }}>{guide.subtitle}</p>
          </section>

          <div style={{ position: 'relative', marginBottom: '12px' }}>
            <input
              type="search"
              aria-label={guide.searchPlaceholder}
              placeholder={guide.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 14px 12px 38px',
                borderRadius: '16px',
                border: '1px solid var(--border-card)',
                background: 'var(--bg-card)',
                color: 'var(--text-main)',
                fontSize: '0.84rem',
                outline: 'none',
                boxShadow: 'var(--shadow-card)',
                boxSizing: 'border-box'
              }}
            />
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
              style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>

          <div className="category-filter-chips" style={{ display: 'flex', gap: '6px', overflowX: 'auto', marginBottom: '14px', paddingBottom: '4px', scrollbarWidth: 'none' }}>
            {Object.entries(guide.categories).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={activeCategory === id}
                onClick={() => setActiveCategory(id)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '14px',
                  border: 'none',
                  background: activeCategory === id ? 'var(--ror-cyan)' : 'var(--bg-card-subtle)',
                  color: activeCategory === id ? '#000000' : 'var(--text-muted)',
                  fontWeight: 800,
                  fontSize: '0.76rem',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {filteredSections.length === 0 ? (
              <div style={{ padding: '30px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <p style={{ fontSize: '0.88rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>{guide.noResultsTitle}</p>
                <span style={{ fontSize: '0.76rem' }}>{guide.noResultsSub}</span>
              </div>
            ) : filteredSections.map((section) => {
              const color = COLORS[section.category];
              const open = expandedSection === section.id || Boolean(searchQuery.trim());
              return (
                <section
                  key={section.id}
                  style={{
                    background: 'var(--bg-card)',
                    borderRadius: '20px',
                    padding: '16px',
                    border: open ? `1px solid ${color}` : '1px solid var(--border-card)',
                    boxShadow: 'var(--shadow-card)'
                  }}
                >
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => toggleSection(section.id)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', color: 'inherit' }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ width: '38px', height: '38px', borderRadius: '50%', background: `${color}26`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          {ICONS[section.category]}
                        </svg>
                      </span>
                      <span>
                        <span style={{ display: 'block', fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-main)' }}>{section.title}</span>
                        <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{section.subtitle}</span>
                      </span>
                    </span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                      style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.25s ease', color: 'var(--text-muted)', flexShrink: 0 }}>
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>

                  {open && (
                    <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border-card)', fontSize: '0.82rem', color: 'var(--text-main)', display: 'flex', flexDirection: 'column', gap: '10px', lineHeight: 1.45 }}>
                      {(section.items || []).map(([label, text]) => (
                        <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: color, marginTop: '6px', flexShrink: 0 }} />
                          <span><strong>{label}:</strong> {text}</span>
                        </div>
                      ))}
                      {(section.faq || []).map(([question, answer]) => (
                        <div key={question}>
                          <strong style={{ color: 'var(--ror-cyan)', display: 'block', marginBottom: '2px' }}>{question}</strong>
                          <span style={{ color: 'var(--text-muted)' }}>{answer}</span>
                        </div>
                      ))}
                      {section.privacyLink && (
                        <button
                          type="button"
                          onClick={() => navigate('/privacy')}
                          style={{ alignSelf: 'flex-start', padding: '6px 12px', borderRadius: '12px', border: 'none', background: 'var(--bg-card-subtle)', color: 'var(--text-main)', fontWeight: 700, fontSize: '0.74rem', cursor: 'pointer' }}
                        >
                          {guide.privacyButton}
                        </button>
                      )}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
};
