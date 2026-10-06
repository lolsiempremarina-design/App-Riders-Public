import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider, useApp } from '../../context/AppContext';
import { Home } from '../Home';
import { defaultFetchMock } from '../../test/setup';

const HomeWithLang = ({ lang = 'it' }) => {
  const { setLanguage } = useApp();
  React.useEffect(() => {
    if (lang) setLanguage(lang);
  }, [lang, setLanguage]);

  return <Home />;
};

const renderHomeInLang = (lang = 'it') => render(
  <MemoryRouter initialEntries={['/']}>
    <AppProvider>
      <HomeWithLang lang={lang} />
    </AppProvider>
  </MemoryRouter>
);

const mockGeolocation = (impl) => {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition: vi.fn(impl) }
  });
};

describe('Home Page - Widget meteo con dati reali (Open-Meteo)', () => {
  let current;

  beforeEach(() => {
    current = { temperature_2m: 18.4, wind_speed_10m: 12.2, precipitation: 0 };
    mockGeolocation((ok) => ok({ coords: { latitude: 45.46, longitude: 9.19 } }));
    globalThis.fetch = vi.fn(async (url) => {
      if (String(url).includes('api.open-meteo.com')) {
        return { ok: true, status: 200, json: async () => ({ current }) };
      }
      return defaultFetchMock(url);
    });
  });

  afterEach(() => {
    globalThis.fetch = defaultFetchMock;
    delete navigator.geolocation;
  });

  it('mostra la temperatura reale e le condizioni calcolate in italiano', async () => {
    const { container } = renderHomeInLang('it');
    expect(await screen.findByText('18°C')).toBeInTheDocument();
    expect(screen.getByText('Condizioni buone')).toBeInTheDocument();
    expect(screen.getByText(/Vento 12 km\/h/)).toBeInTheDocument();

    const url = globalThis.fetch.mock.calls.map(([u]) => String(u)).find((u) => u.includes('open-meteo'));
    expect(url).toContain('latitude=45.46');
    expect(url).toContain('longitude=9.19');

    const topRow = container.querySelector('.weather-top-row');
    expect(topRow.querySelector('.temp-display')).not.toBeNull();
    expect(topRow.querySelector('.weather-badge')).not.toBeNull();
    // Nessun dato inventato: niente città fissa
    expect(screen.queryByText(/Milano/)).toBeNull();
  });

  it('traduce le condizioni in inglese (pioggia)', async () => {
    current = { temperature_2m: 12, wind_speed_10m: 5, precipitation: 1.4 };
    renderHomeInLang('en');
    expect(await screen.findByText('12°C')).toBeInTheDocument();
    expect(screen.getByText('Rain')).toBeInTheDocument();
  });

  it('traduce le condizioni in spagnolo (vento forte)', async () => {
    current = { temperature_2m: 20, wind_speed_10m: 42, precipitation: 0 };
    renderHomeInLang('es');
    expect(await screen.findByText('20°C')).toBeInTheDocument();
    expect(screen.getByText('Viento fuerte')).toBeInTheDocument();
  });

  it('se la posizione è negata dice che il meteo non è disponibile, senza valori finti', async () => {
    mockGeolocation((_ok, err) => err({ code: 1 }));
    renderHomeInLang('it');
    expect(await screen.findByText(/Meteo non disponibile/)).toBeInTheDocument();
    expect(screen.getByText('--')).toBeInTheDocument();
    expect(document.querySelector('.weather-badge')).toBeNull();
  });
});
