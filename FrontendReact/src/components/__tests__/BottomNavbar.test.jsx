import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BottomNavbar } from '../BottomNavbar';

describe('BottomNavbar Component', () => {
  const renderNavbar = (initialRoute = '/') => {
    return render(
      <MemoryRouter initialEntries={[initialRoute]}>
        <BottomNavbar />
      </MemoryRouter>
    );
  };

  it('renders all 4 navigation tabs', () => {
    renderNavbar('/');
    expect(screen.getByRole('button', { name: /Bici Home/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Telemetria/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Mappa RoR/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Impostazioni Altro/i })).toBeDefined();
  });

  it('correctly activates Bici tab and positions pill at 0% when on /', () => {
    const { container } = renderNavbar('/');
    const biciBtn = screen.getByRole('button', { name: /Bici Home/i });
    expect(biciBtn.classList.contains('active')).toBe(true);

    const pill = container.querySelector('.sliding-active-pill');
    expect(pill).toBeDefined();
    expect(pill.style.transform).toContain('translate3d(0%, 0, 0)');
    expect(pill.style.width).toBe('25%');
  });

  it('correctly activates Telemetria tab and positions pill at 100% when on /statistiche', () => {
    const { container } = renderNavbar('/statistiche');
    const telemetriaBtn = screen.getByRole('button', { name: /Telemetria/i });
    expect(telemetriaBtn.classList.contains('active')).toBe(true);

    const pill = container.querySelector('.sliding-active-pill');
    expect(pill.style.transform).toContain('translate3d(100%, 0, 0)');
  });

  it('correctly activates Mappa tab and positions pill at 200% when on /mappa', () => {
    const { container } = renderNavbar('/mappa');
    const mapBtn = screen.getByRole('button', { name: /Mappa RoR/i });
    expect(mapBtn.classList.contains('active')).toBe(true);

    const pill = container.querySelector('.sliding-active-pill');
    expect(pill.style.transform).toContain('translate3d(200%, 0, 0)');
  });

  it('correctly activates Impostazioni Altro tab and positions pill at 300% when on /altro', () => {
    const { container } = renderNavbar('/altro');
    const settingsBtn = screen.getByRole('button', { name: /Impostazioni Altro/i });
    expect(settingsBtn.classList.contains('active')).toBe(true);

    const pill = container.querySelector('.sliding-active-pill');
    expect(pill.style.transform).toContain('translate3d(300%, 0, 0)');
  });
});
