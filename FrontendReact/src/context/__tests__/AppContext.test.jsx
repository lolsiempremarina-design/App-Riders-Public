import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AppProvider, useApp } from '../AppContext';
import * as AppContextModule from '../AppContext';

// Componente di test per accedere ai valori e metodi del contesto
const TestConsumer = ({ onRender }) => {
  const context = useApp();
  if (onRender) onRender(context);
  return (
    <div>
      <span data-testid="theme-val">{context.theme}</span>
      <span data-testid="lang-val">{context.language}</span>
      <span data-testid="user-name">{context.userProfile?.name || 'Ospite'}</span>
      <span data-testid="translation-home">{context.t?.homeHello || ''}</span>
      <button onClick={context.toggleTheme} data-testid="toggle-theme-btn">Toggle Theme</button>
      <button onClick={() => context.setLanguage('en')} data-testid="set-lang-en-btn">Set EN</button>
      <button onClick={() => context.setLanguage('es')} data-testid="set-lang-es-btn">Set ES</button>
      <button
        onClick={() => context.registerUser({
          name: 'Luca', surname: 'Bianchi', email: 'luca@ror.it',
          fiscalCode: 'BNCLCU92C15H501X', phone: '+39 333 1234567', birthDate: '1992-03-15', birthPlace: 'Roma (RM)', gender: 'M'
        })}
        data-testid="register-btn"
      >
        Register
      </button>
      <button onClick={context.logoutUser} data-testid="logout-btn">Logout</button>
      <button onClick={() => context.openModal('Titolo Test', '<p>Corpo Test</p>')} data-testid="open-modal-btn">
        Open Modal
      </button>
      <button onClick={context.closeModal} data-testid="close-modal-btn">Close Modal</button>
      <button onClick={() => context.showToast('Test Toast', 'success', 5000)} data-testid="show-toast-btn">
        Show Toast
      </button>
    </div>
  );
};

describe('AppContext & AppProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.className = '';
    document.documentElement.lang = 'it';
    vi.restoreAllMocks();
  });

  it('fornisce valori di default coerenti (lingua it, tema light o preferito, profilo iniziale null/ospite)', () => {
    render(
      <AppProvider>
        <TestConsumer />
      </AppProvider>
    );

    expect(screen.getByTestId('lang-val').textContent).toBe('it');
    expect(screen.getByTestId('user-name').textContent).toBe('Ospite');
    expect(screen.getByTestId('translation-home').textContent).toBe('Ciao');
  });

  it('alterna il tema tra light e dark e sincronizza con localStorage e document.body', () => {
    render(
      <AppProvider>
        <TestConsumer />
      </AppProvider>
    );

    const toggleBtn = screen.getByTestId('toggle-theme-btn');
    const initialTheme = screen.getByTestId('theme-val').textContent;

    act(() => {
      toggleBtn.click();
    });

    const expectedNewTheme = initialTheme === 'light' ? 'dark' : 'light';
    expect(screen.getByTestId('theme-val').textContent).toBe(expectedNewTheme);
    expect(localStorage.getItem('ror-theme')).toBe(expectedNewTheme);
    expect(document.body.className).toContain(`theme-${expectedNewTheme}`);
  });

  it('cambia la lingua dinamicamente (EN / ES) e aggiorna le traduzioni t', () => {
    render(
      <AppProvider>
        <TestConsumer />
      </AppProvider>
    );

    const setEnBtn = screen.getByTestId('set-lang-en-btn');
    act(() => {
      setEnBtn.click();
    });

    expect(screen.getByTestId('lang-val').textContent).toBe('en');
    expect(screen.getByTestId('translation-home').textContent).toBe('Hi');
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('ror-language')).toBe('en');

    const setEsBtn = screen.getByTestId('set-lang-es-btn');
    act(() => {
      setEsBtn.click();
    });

    expect(screen.getByTestId('lang-val').textContent).toBe('es');
    expect(screen.getByTestId('translation-home').textContent).toBe('Hola');
    expect(document.documentElement.lang).toBe('es');
  });

  it('permette registrazione e logout dell\'utente aggiornando userProfile e localStorage', () => {
    render(
      <AppProvider>
        <TestConsumer />
      </AppProvider>
    );

    const registerBtn = screen.getByTestId('register-btn');
    act(() => {
      registerBtn.click();
    });

    expect(screen.getByTestId('user-name').textContent).toBe('Luca');
    const saved = JSON.parse(localStorage.getItem('ror-user-profile'));
    expect(saved.name).toBe('Luca');
    // i dati anagrafici sensibili non restano salvati nel telefono (solo in memoria, dal server)
    ['fiscalCode', 'phone', 'birthDate', 'birthPlace', 'gender'].forEach((field) => {
      expect(saved, field).not.toHaveProperty(field);
    });
    expect(localStorage.getItem('ror-user-profile')).not.toMatch(/BNCLCU|333 1234567|1992-03-15/);

    const logoutBtn = screen.getByTestId('logout-btn');
    act(() => {
      logoutBtn.click();
    });

    expect(screen.getByTestId('user-name').textContent).toBe('Ospite');
    expect(localStorage.getItem('ror-user-profile')).toBeNull();
  });

  it('gestisce correttamente l\'apertura e chiusura della Modal globale', () => {
    let capturedContext;
    render(
      <AppProvider>
        <TestConsumer onRender={(ctx) => { capturedContext = ctx; }} />
      </AppProvider>
    );

    expect(capturedContext.modal.isOpen).toBe(false);

    const openModalBtn = screen.getByTestId('open-modal-btn');
    act(() => {
      openModalBtn.click();
    });

    expect(capturedContext.modal.isOpen).toBe(true);
    expect(capturedContext.modal.title).toBe('Titolo Test');

    const closeModalBtn = screen.getByTestId('close-modal-btn');
    act(() => {
      closeModalBtn.click();
    });

    expect(capturedContext.modal.isOpen).toBe(false);
  });

  it('gestisce le notifiche Toast temporizzate', () => {
    let capturedContext;
    render(
      <AppProvider>
        <TestConsumer onRender={(ctx) => { capturedContext = ctx; }} />
      </AppProvider>
    );

    expect(capturedContext.toast.isOpen).toBe(false);

    const showToastBtn = screen.getByTestId('show-toast-btn');
    act(() => {
      showToastBtn.click();
    });

    expect(capturedContext.toast.isOpen).toBe(true);
    expect(capturedContext.toast.message).toBe('Test Toast');

    act(() => {
      capturedContext.hideToast();
    });

    expect(capturedContext.toast.isOpen).toBe(false);
  });

  describe('Hook Granulari Modulari (useTheme, useI18n, useAuth, useUI, useNetwork)', () => {
    it('espone useTheme con gestione tema e modalità vista', () => {
      let themeContext;
      const ThemeConsumer = () => {
        const ctx = AppContextModule.useTheme();
        themeContext = ctx;
        return <span>{ctx.theme} - {ctx.viewMode}</span>;
      };

      render(
        <AppProvider>
          <ThemeConsumer />
        </AppProvider>
      );

      expect(themeContext.theme).toBe('light');
      expect(themeContext.viewMode).toBe('mobile');
      expect(typeof themeContext.toggleTheme).toBe('function');
      expect(typeof themeContext.setViewMode).toBe('function');
    });

    it('espone useI18n con traduzioni t e selettore lingua', () => {
      let i18nContext;
      const I18nConsumer = () => {
        const ctx = AppContextModule.useI18n();
        i18nContext = ctx;
        return <span>{ctx.language}</span>;
      };

      render(
        <AppProvider>
          <I18nConsumer />
        </AppProvider>
      );

      expect(i18nContext.language).toBe('it');
      expect(typeof i18nContext.t).toBe('object');
      expect(typeof i18nContext.setLanguage).toBe('function');
    });

    it('espone useAuth con profilo rider e funzioni di sessione', () => {
      let authContext;
      const AuthConsumer = () => {
        const ctx = AppContextModule.useAuth();
        authContext = ctx;
        return <span>{ctx.userProfile?.name || 'Ospite'}</span>;
      };

      render(
        <AppProvider>
          <AuthConsumer />
        </AppProvider>
      );

      expect(authContext.userProfile).toBeNull();
      expect(typeof authContext.registerUser).toBe('function');
      expect(typeof authContext.logoutUser).toBe('function');
    });

    it('espone useUI con modale, toast e notifiche push', () => {
      let uiContext;
      const UIConsumer = () => {
        const ctx = AppContextModule.useUI();
        uiContext = ctx;
        return <span>{ctx.modal.isOpen ? 'open' : 'closed'}</span>;
      };

      render(
        <AppProvider>
          <UIConsumer />
        </AppProvider>
      );

      expect(uiContext.modal.isOpen).toBe(false);
      expect(uiContext.toast.isOpen).toBe(false);
      expect(typeof uiContext.openModal).toBe('function');
      expect(typeof uiContext.showToast).toBe('function');
      expect(typeof uiContext.triggerPushNotification).toBe('function');
    });

    it('espone useNetwork con stato di connettività online/offline', () => {
      let netContext;
      const NetConsumer = () => {
        const ctx = AppContextModule.useNetwork();
        netContext = ctx;
        return <span>{ctx.isOnline ? 'online' : 'offline'}</span>;
      };

      render(
        <AppProvider>
          <NetConsumer />
        </AppProvider>
      );

      expect(typeof netContext.isOnline).toBe('boolean');
      expect(typeof netContext.wasOffline).toBe('boolean');
      expect(typeof netContext.showRestoredNotice).toBe('boolean');
    });

    it('re-esporta fedelmente getI18n, supportedLanguages e normalizeLanguageCode', () => {
      expect(AppContextModule.supportedLanguages).toBeDefined(); expect(AppContextModule.supportedLanguages.length).toBeGreaterThanOrEqual(3);
      expect(AppContextModule.normalizeLanguageCode('EN-us')).toBe('en');
      expect(AppContextModule.normalizeLanguageCode('unknown')).toBe('it');

      const itDict = AppContextModule.getI18n('it');
      expect(itDict.homeHello).toBe('Ciao');

      const esDict = AppContextModule.getI18n('es');
      expect(esDict.homeHello).toBe('Hola');
    });
  });
});

