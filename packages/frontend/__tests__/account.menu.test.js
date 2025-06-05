import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import router from 'next-router-mock';
import AccountMenu from '../src/components/AccountMenu';
import { AuthProvider } from '../src/lib/AuthProvider';
import { I18nProvider } from '../src/lib/I18nProvider';

jest.mock('next/router', () => require('next-router-mock'));

function makeToken(role) {
  const payload = Buffer.from(JSON.stringify({ role })).toString('base64url');
  return `a.${payload}.c`;
}

describe('account menu role switcher', () => {
  beforeEach(() => {
    localStorage.clear();
    router.setCurrentUrl('/');
  });

  test('admin sees role switch option', () => {
    localStorage.setItem('id_token', makeToken('admin'));
    localStorage.setItem('eligibility', 'true');
    localStorage.setItem('auth_mode', 'eid');
    const { getByLabelText, getByText } = render(
      <I18nProvider>
        <AuthProvider>
          <AccountMenu />
        </AuthProvider>
      </I18nProvider>
    );
    fireEvent.click(getByLabelText('Account menu'));
    expect(getByText('Change User Role')).toBeInTheDocument();
  });

  test('user does not see role switch option', () => {
    localStorage.setItem('id_token', makeToken('user'));
    localStorage.setItem('eligibility', 'true');
    localStorage.setItem('auth_mode', 'eid');
    const { getByLabelText, queryByText } = render(
      <I18nProvider>
        <AuthProvider>
          <AccountMenu />
        </AuthProvider>
      </I18nProvider>
    );
    fireEvent.click(getByLabelText('Account menu'));
    expect(queryByText('Change User Role')).toBeNull();
  });
});
