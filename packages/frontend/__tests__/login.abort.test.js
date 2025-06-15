import React from 'react';
import { render, act, waitFor } from '@testing-library/react';
import router from 'next-router-mock';
import LoginPage from '../src/pages/login';
import { AuthProvider } from '../src/lib/AuthProvider';
import { I18nProvider } from '../src/lib/I18nProvider';

jest.mock('next/router', () => require('next-router-mock'));

describe('login abort banner', () => {
  beforeEach(() => {
    sessionStorage.clear();
    router.setCurrentUrl('/login');
  });

  it('shows banner when popup posts error', async () => {
    const { getByText } = render(
      <I18nProvider>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </I18nProvider>
    );
    await act(async () => {});
    const evt = new MessageEvent('message', {
      origin: window.location.origin,
      data: { error: true }
    });
    await act(async () => {
      window.dispatchEvent(evt);
    });
    await waitFor(() =>
      expect(getByText('Login cancelled or window closed.')).toBeInTheDocument()
    );
  });
});
