import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '../../context/AppContext';
import { Consegne } from '../Consegne';

describe('Consegne Page Component Crash Test', () => {
  it('renderizza senza andare in crash o schermata bianca', async () => {
    const { container } = render(
      <MemoryRouter>
        <AppProvider>
          <Consegne />
        </AppProvider>
      </MemoryRouter>
    );
    expect(container).toBeInTheDocument();
  });
});