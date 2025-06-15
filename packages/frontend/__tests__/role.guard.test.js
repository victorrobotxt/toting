import React from 'react';
import { render } from '@testing-library/react';
import router from 'next-router-mock';
import NavBar from '../src/components/NavBar';
import withAuth from '../src/components/withAuth';
import { AuthProvider } from '../src/lib/AuthProvider';
import { I18nProvider } from '../src/lib/I18nProvider';

jest.mock('next/router', () => require('next-router-mock'));

function makeToken(role) {
  const payload = Buffer.from(JSON.stringify({ role })).toString('base64url');
  return `a.${payload}.c`;
}

describe('role based guards', () => {
  beforeEach(() => {
    sessionStorage.clear();
    router.setCurrentUrl('/');
  });

  test('admin sees create link', () => {
    sessionStorage.setItem('id_token', makeToken('admin'));
    sessionStorage.setItem('eligibility', 'true');
    sessionStorage.setItem('auth_mode', 'eid');
    const { getByText } = render(
      <I18nProvider>
        <AuthProvider>
          <NavBar />
        </AuthProvider>
      </I18nProvider>
    );
    expect(getByText('Create Election')).toBeInTheDocument();
  });

  test('verifier sees panel link', () => {
    sessionStorage.setItem('id_token', makeToken('verifier'));
    sessionStorage.setItem('eligibility', 'true');
    sessionStorage.setItem('auth_mode', 'eid');
    const { getByText } = render(
      <I18nProvider>
        <AuthProvider>
          <NavBar />
        </AuthProvider>
      </I18nProvider>
    );
    expect(getByText('Verifier Panel')).toBeInTheDocument();
  });

  test('admin does not see panel link', () => {
    sessionStorage.setItem('id_token', makeToken('admin'));
    sessionStorage.setItem('eligibility', 'true');
    sessionStorage.setItem('auth_mode', 'eid');
    const { queryByText } = render(
      <I18nProvider>
        <AuthProvider>
          <NavBar />
        </AuthProvider>
      </I18nProvider>
    );
    expect(queryByText('Verifier Panel')).toBeNull();
  });

  test('user does not see create link', () => {
    sessionStorage.setItem('id_token', makeToken('user'));
    sessionStorage.setItem('eligibility', 'true');
    sessionStorage.setItem('auth_mode', 'eid');
    const { queryByText } = render(
      <I18nProvider>
        <AuthProvider>
          <NavBar />
        </AuthProvider>
      </I18nProvider>
    );
    expect(queryByText('Create Election')).toBeNull();
  });

  test('forbidden route shows 403', () => {
    sessionStorage.setItem('id_token', makeToken('user'));
    sessionStorage.setItem('eligibility', 'true');
    sessionStorage.setItem('auth_mode', 'eid');
    const Protected = withAuth(() => <p>secret</p>, ['verifier']);
    const { getByText } = render(
      <I18nProvider>
        <AuthProvider>
          <Protected />
        </AuthProvider>
      </I18nProvider>
    );
    expect(getByText(/403/)).toBeInTheDocument();
  });
});
