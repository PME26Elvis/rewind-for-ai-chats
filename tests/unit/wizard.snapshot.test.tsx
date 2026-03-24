import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { App } from '../../apps/web/src/app/App';

describe('app shell', () => {
  test('renders the rewind dashboard by default', () => {
    render(<App />);

    expect(screen.getByText(/Rewind dashboard/i)).toBeInTheDocument();
    expect(screen.getByText(/No rewind data yet/i)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Year selector/i })).toBeInTheDocument();
  });
});
