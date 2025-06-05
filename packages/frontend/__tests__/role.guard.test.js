import React from 'react';
import { render } from '@testing-library/react';
import router from 'next-router-mock';
import NavBar from '../src/components/NavBar';
import withAuth from '../src/components/withAuth';
import { AuthProvider } from '../src/lib/AuthProvider';

jest.mock('next/router', () => require('next-router-mock'));

function makeToken(role) {
  const payload = Buffer.from(JSON.stringify({ role })).toString('base64url');
  return `a.${payload}.c`;
}

describe('role based guards', () => {
  beforeEach(() => {
    localStorage.clear();
    router.setCurrentUrl('/');
  });

  test('admin sees create link', () => {
    localStorage.setItem('id_token', makeToken('admin'));
    localStorage.setItem('eligibility', 'true');
    localStorage.setItem('auth_mode', 'eid');
    const { getByText } = render(
      <AuthProvider>
        <NavBar />
      </AuthProvider>
    );
    expect(getByText('Create Election')).toBeInTheDocument();
  });

  test('user does not see create link', () => {
    localStorage.setItem('id_token', makeToken('user'));
    localStorage.setItem('eligibility', 'true');
    localStorage.setItem('auth_mode', 'eid');
    const { queryByText } = render(
      <AuthProvider>
        <NavBar />
      </AuthProvider>
    );
    expect(queryByText('Create Election')).toBeNull();
  });

  test('forbidden route shows 403', () => {
    localStorage.setItem('id_token', makeToken('user'));
    localStorage.setItem('eligibility', 'true');
    localStorage.setItem('auth_mode', 'eid');
    const Protected = withAuth(() => <p>secret</p>, ['verifier']);
    const { getByText } = render(
      <AuthProvider>
        <Protected />
      </AuthProvider>
    );
    expect(getByText(/403/)).toBeInTheDocument();
  });
});
