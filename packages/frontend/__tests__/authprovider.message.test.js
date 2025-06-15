import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import router from 'next-router-mock';
import { AuthProvider } from '../src/lib/AuthProvider';
import { useAuth } from '../src/lib/AuthProvider';

jest.mock('next/router', () => require('next-router-mock'));

function Dummy() {
  const { isLoggedIn, eligibility } = useAuth();
  return <span>{isLoggedIn ? `logged-${eligibility}` : 'anon'}</span>;
}

describe('postMessage login', () => {
  beforeEach(() => {
    sessionStorage.clear();
    router.setCurrentUrl('/');
  });

  it('updates auth state and redirects', async () => {
    render(
      <AuthProvider>
        <Dummy />
      </AuthProvider>
    );
    await act(async () => {});
    const evt = new MessageEvent('message', {
      origin: window.location.origin,
      data: { id_token: 'jwt', eligibility: true }
    });
    await act(async () => {
      window.dispatchEvent(evt);
    });
    await waitFor(() => expect(sessionStorage.getItem('id_token')).toBe('jwt'));
    expect(sessionStorage.getItem('auth_mode')).toBe('eid');
    expect(router.asPath).toBe('/dashboard');
  });
});
