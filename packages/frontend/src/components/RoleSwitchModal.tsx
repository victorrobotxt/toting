import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../lib/AuthProvider';
import { useToast } from '../lib/ToastProvider';
import { useI18n } from '../lib/I18nProvider';

export default function RoleSwitchModal({ onClose }: { onClose: () => void }) {
  const { token } = useAuth();
  const { showToast } = useToast();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'user' | 'verifier'>('user');
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  const submit = async () => {
    const res = await fetch(
      `http://localhost:8000/admin/users/${encodeURIComponent(email)}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role }),
      },
    );
    if (res.ok) {
      showToast({ type: 'success', message: t('account.roleChanged') });
      onClose();
    } else {
      showToast({ type: 'error', message: t('account.roleFailed') });
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{ background: 'white', padding: '1rem', minWidth: '300px' }}
      >
        <h3>{t('account.role')}</h3>
        <label htmlFor="role-email" style={{ display: 'block' }}>
          Email
        </label>
        <input
          id="role-email"
          ref={emailRef}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="user@example.com"
        />
        <label htmlFor="role-select" style={{ display: 'block', marginTop: '0.5rem' }}>
          Role
        </label>
        <select
          id="role-select"
          value={role}
          onChange={(e) => setRole(e.target.value as any)}
        >
          <option value="user">user</option>
          <option value="verifier">verifier</option>
          <option value="admin">admin</option>
        </select>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
          <button onClick={submit} aria-label="Submit role change">
            Submit
          </button>
          <button onClick={onClose} aria-label="Cancel role change">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
