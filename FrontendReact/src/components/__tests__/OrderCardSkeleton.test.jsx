import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrderCardSkeleton } from '../OrderCardSkeleton';

describe('OrderCardSkeleton Component', () => {
  it('renderizza il gruppo di schede placeholder con attributi di accessibilità ARIA', () => {
    render(<OrderCardSkeleton />);

    const group = screen.getByTestId('order-card-skeleton-group');
    expect(group).toBeInTheDocument();
    expect(group).toHaveAttribute('role', 'status');
    expect(group).toHaveAttribute('aria-busy', 'true');
    expect(group).toHaveAttribute('aria-label', 'Caricamento ordini in corso...');
  });

  it('renderizza esattamente 3 schede skeleton per impostazione predefinita', () => {
    render(<OrderCardSkeleton />);

    const cards = screen.getAllByTestId('order-card-skeleton');
    expect(cards).toHaveLength(3);
  });

  it('permette di configurare un numero arbitrario di schede skeleton tramite prop count', () => {
    render(<OrderCardSkeleton count={5} />);

    const cards = screen.getAllByTestId('order-card-skeleton');
    expect(cards).toHaveLength(5);
  });

  it('gestisce count minore di 1 garantendo almeno una scheda placeholder', () => {
    render(<OrderCardSkeleton count={0} />);

    const cards = screen.getAllByTestId('order-card-skeleton');
    expect(cards).toHaveLength(1);
  });

  it('applica classi CSS personalizzate passate tramite prop className', () => {
    const { container } = render(<OrderCardSkeleton className="custom-test-class" />);

    expect(container.querySelector('.order-skeleton-container.custom-test-class')).toBeInTheDocument();
  });
});
