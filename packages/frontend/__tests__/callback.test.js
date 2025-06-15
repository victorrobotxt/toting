import React from 'react';
import { render, waitFor } from '@testing-library/react';
import router from 'next-router-mock';
import CallbackPage from '../src/pages/auth/callback';

jest.mock('next/router', () => require('next-router-mock'));

describe('callback page', () => {
  beforeEach(() => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id_token: 'jwt', eligibility: true })
    });
    router.setCurrentUrl('/callback?code=dummy');
  });

  it('redirects to login without opener', async () => {
    render(<CallbackPage />);
    await waitFor(() => expect(router.asPath).toBe('/login'));
  });
});
