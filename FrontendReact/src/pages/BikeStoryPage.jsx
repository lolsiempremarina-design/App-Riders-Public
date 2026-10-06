import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PhoneFrame } from '../components/PhoneFrame';
import { useApp } from '../context/AppContext';

export const BikeStoryPage = () => {
  const navigate = useNavigate();
  const { t } = useApp();

  const storySections = [
    {
      title: t.storySectionWhatIs,
      body: [
        t.storyWhatItIs1,
        t.storyWhatItIs2,
        t.storyWhatItIs3,
        t.storyWhatItIs4,
        t.storyWhatItIs5,
        t.storyWhatItIs6
      ]
    },
    {
      title: t.storySectionHow,
      body: [
        t.storyHow1,
        t.storyHow2,
        t.storyHow3,
        t.storyHow4,
        t.storyHow5
      ]
    },
    {
      title: t.storySectionPayment,
      note: t.storyConceptNote,
      body: [
        t.storyPayment1,
        t.storyPayment2,
        t.storyPayment3,
        t.storyPayment4,
        t.storyPayment5
      ]
    },
    {
      title: t.storySectionWhy,
      body: [
        t.storyWhy1,
        t.storyWhy2,
        t.storyWhy3,
        t.storyWhy4
      ]
    },
    {
      title: t.storySectionFinal,
      body: [
        t.storyFinal1,
        t.storyFinal2,
        t.storyFinal3,
        t.storyFinal4
      ]
    }
  ];

  const legend = [
    { label: t.storyLegendEngine, value: t.storyLegendEngineValue },
    { label: t.storyLegendBrain, value: t.storyLegendBrainValue },
    { label: t.storyLegendFuel, value: t.storyLegendFuelValue }
  ];

  return (
    <PhoneFrame toolbarTitle={t.storyToolbarTitle}>
      <div className="app-content" style={{ padding: '16px 14px 32px', background: '#f3f6fb' }}>
        <div className="app-page-view active" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div
            style={{
              background: 'linear-gradient(135deg, #0f172a 0%, #172554 35%, #1d4ed8 100%)',
              borderRadius: '26px',
              padding: '20px 18px 18px',
              color: '#f8fafc',
              boxShadow: '0 18px 38px rgba(15, 23, 42, 0.18)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ fontSize: '0.72rem', letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.8 }}>
                {t.storyBadge}
              </div>
              <button
                type="button"
                onClick={() => navigate(-1)}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '999px',
                  padding: '6px 10px',
                  color: '#fff',
                  fontSize: '0.72rem',
                  cursor: 'pointer'
                }}
              >
                {t.storyBack}
              </button>
            </div>

            <h1 style={{ margin: '0 0 8px', fontSize: '2.1rem', lineHeight: 1.08, letterSpacing: '-0.05em' }}>{t.storyTitle}</h1>
            <div style={{ fontSize: '0.82rem', letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.8 }}>
              {t.storySubtitle}
            </div>
          </div>

          <div
            style={{
              background: '#ffffff',
              borderRadius: '22px',
              padding: '18px 16px',
              boxShadow: '0 12px 24px rgba(15, 23, 42, 0.06)',
              color: '#0f172a'
            }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
              {t.storyTags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '999px',
                    background: '#e2e8f0',
                    fontSize: '0.7rem',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                    color: '#0f172a'
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>

            <p style={{ margin: 0, fontSize: '0.96rem', lineHeight: 1.7 }}>
              <strong>{t.storyIntroStrong}</strong><br />
              {t.storyIntroLine2}<br />
              {t.storyIntroLine3}
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: '10px'
            }}
          >
            {legend.map((item) => (
              <div
                key={item.label}
                style={{
                  background: '#0f172a',
                  color: '#f8fafc',
                  borderRadius: '18px',
                  padding: '12px 10px',
                  textAlign: 'center'
                }}
              >
                <div style={{ fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.72 }}>
                  {item.label}
                </div>
                <div style={{ marginTop: '8px', fontWeight: 700, fontSize: '0.8rem', lineHeight: 1.4 }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>

          {storySections.map((section) => (
            <div
              key={section.title}
              style={{
                background: '#fff',
                borderRadius: '22px',
                padding: '18px 16px',
                boxShadow: '0 10px 22px rgba(15, 23, 42, 0.05)',
                border: '1px solid rgba(148, 163, 184, 0.12)'
              }}
            >
              <h2
                style={{
                  margin: '0 0 12px',
                  fontSize: '0.82rem',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: '#0f172a'
                }}
              >
                {section.title}
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', color: '#1f2937', lineHeight: 1.7, fontSize: '0.9rem' }}>
                {section.body.map((line) => (
                  <div key={line}>{line}</div>
                ))}
                {section.note && (
                  <div role="note" style={{ background: '#fff7ed', border: '1px solid #fdba74', color: '#9a3412', borderRadius: '12px', padding: '8px 10px', fontSize: '0.8rem', fontWeight: 700 }}>
                    {section.note}
                  </div>
                )}
              </div>
            </div>
          ))}

          <div
            style={{
              background: '#0f172a',
              color: '#e2e8f0',
              borderRadius: '22px',
              padding: '18px 16px',
              boxShadow: '0 12px 24px rgba(15, 23, 42, 0.12)'
            }}
          >
            <div style={{ fontWeight: 800, fontSize: '1.15rem', marginBottom: '8px', letterSpacing: '0.04em' }}>
              {t.storyFinalCall}
            </div>
            <div style={{ fontSize: '0.9rem', opacity: 0.8, marginBottom: '14px' }}>{t.storyOpenTab}</div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => navigate('/bici')}
                style={{
                  flex: 1,
                  minWidth: '120px',
                  background: '#7dd3fc',
                  color: '#082f49',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '10px 12px',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                {t.storyArchive}
              </button>
            </div>
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
};

export default BikeStoryPage;
