import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../lib/AuthProvider';
import { apiUrl } from '../lib/api';

export default function MockLoginModal({ onClose }: { onClose: () => void }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const emailRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    emailRef.current?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); }
      if (e.key === 'Tab') {
        const focusables = [emailRef.current, submitRef.current, cancelRef.current].filter(Boolean) as HTMLElement[];
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (!document.activeElement) return;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', trap);
    return () => document.removeEventListener('keydown', trap);
  }, [onClose]);

  const submit = async () => {
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) { setError('invalid email'); return; }
    const res = await fetch(`${apiUrl('/auth/callback')}?user=${encodeURIComponent(email)}`);
    const data = await res.json();
    if (data.id_token) {
      login(data.id_token, data.eligibility, 'mock');
      onClose();
    } else {
      setError('login failed');
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
        aria-labelledby="mocklogin-title"
        style={{ background: 'white', padding: '1rem', minWidth: '300px' }}
      >
        <h3 id="mocklogin-title">Mock Login</h3>
        <label htmlFor="mock-email" style={{ display: 'block' }}>
          Email
        </label>
        <input
          id="mock-email"
          ref={emailRef}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
        />
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
          <button ref={submitRef} onClick={submit} aria-label="Submit mock login">
            Login
          </button>
          <button ref={cancelRef} onClick={onClose} aria-label="Cancel mock login">
            Cancel
          </button>
        </div>
        {error && <p style={{ color: 'red' }}>{error}</p>}
      </div>
    </div>
  );
}
