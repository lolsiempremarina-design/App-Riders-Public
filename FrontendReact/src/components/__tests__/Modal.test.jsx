import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from '../Modal';
import * as AppContextModule from '../../context/AppContext';

describe('Modal Component - Safe Content Rendering', () => {
  const mockCloseModal = vi.fn();
  const mockOnConfirm = vi.fn();

  const setupModalWithContent = (content, title = 'Finestra Modale', onConfirm = null) => {
    vi.spyOn(AppContextModule, 'useApp').mockReturnValue({
      modal: {
        isOpen: true,
        title,
        content,
        actionLabel: 'Conferma',
        onConfirm
      },
      closeModal: mockCloseModal
    });

    return render(<Modal />);
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders plain text content safely inside modal', () => {
    setupModalWithContent('Messaggio di testo semplice senza tag');
    expect(screen.getByText('Messaggio di testo semplice senza tag')).toBeDefined();
    expect(screen.getByText('Finestra Modale')).toBeDefined();
  });

  it('renders formatted string safely as genuine DOM nodes without dangerouslySetInnerHTML', () => {
    const formattedHtml = '<p><strong>25°C • Soleggiato</strong><br />Vento: 8 km/h</p>';
    const { container } = setupModalWithContent(formattedHtml);

    // Verify strong tag exists
    const strongEl = container.querySelector('strong');
    expect(strongEl).toBeDefined();
    expect(strongEl.textContent).toBe('25°C • Soleggiato');

    // Verify br tag exists
    const brEl = container.querySelector('br');
    expect(brEl).toBeDefined();

    // Verify no dangerouslySetInnerHTML attribute was used
    expect(container.innerHTML).not.toContain('dangerouslysetinnerhtml');
  });

  it('neutralizes dangerous script tags (XSS safe)', () => {
    const malicious = '<p>Testo sicuro</p><script>window.pwned = true;</script>';
    const { container } = setupModalWithContent(malicious);

    expect(screen.getByText(/Testo sicuro/i)).toBeDefined();
    expect(container.querySelector('script')).toBeNull();
    expect(window.pwned).toBeUndefined();
  });

  it('renders genuine React JSX content passed directly', () => {
    const jsxContent = (
      <div data-testid="custom-jsx-content">
        <span>Componente JSX Puro</span>
      </div>
    );
    setupModalWithContent(jsxContent);

    expect(screen.getByTestId('custom-jsx-content')).toBeDefined();
    expect(screen.getByText('Componente JSX Puro')).toBeDefined();
  });

  it('calls onConfirm and closeModal when action button is clicked', () => {
    setupModalWithContent('Contenuto', 'Titolo', mockOnConfirm);

    const actionBtn = screen.getByRole('button', { name: 'Conferma' });
    fireEvent.click(actionBtn);

    expect(mockOnConfirm).toHaveBeenCalledTimes(1);
    expect(mockCloseModal).toHaveBeenCalledTimes(1);
  });
});
