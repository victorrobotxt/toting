import { useEffect, useState } from 'react';
import NavBar from '../components/NavBar';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/AuthProvider';
import MockLoginModal from '../components/MockLoginModal';
import { useI18n } from '../lib/I18nProvider';
import { apiUrl } from '../lib/api';
import { emit } from '../lib/analytics';

export default function LoginPage() {
  const router = useRouter();
  const { isLoggedIn, setMode } = useAuth();
  const { t } = useI18n();
  const [showMock, setShowMock] = useState(false);
  const [flowAborted, setFlowAborted] = useState(false);
  let poll: number | undefined;

  useEffect(() => {
    if (isLoggedIn) router.replace('/dashboard');
    return () => {
      if (poll) window.clearInterval(poll);
    };
  }, [isLoggedIn, router]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data && e.data.error) {
        if (poll) window.clearInterval(poll);
        setFlowAborted(true);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const openMock = () => {
    setMode('mock');
    emit('auth_mode_selected', { mode: 'mock' });
    setShowMock(true);
  };

  const startLogin = async () => {
    setMode('eid');
    emit('auth_mode_selected', { mode: 'eid' });
    setFlowAborted(false);
    try {
      const res = await fetch(apiUrl('/auth/initiate'), { redirect: 'manual' });
      const location = res.status >= 300 && res.status < 400 ? res.headers.get('Location') : undefined;
      if (res.ok && res.headers.get('content-type')?.includes('text/html') && !location) {
        // Backend is in mock mode – show the modal instead of the raw HTML form.
        openMock();
        return;
      }
      const url = location || apiUrl('/auth/initiate');
      const popup = window.open(url, 'login', 'width=500,height=600');
      if (popup) {
        poll = window.setInterval(() => {
          if (popup.closed) {
            window.clearInterval(poll);
            setFlowAborted(true);
          }
        }, 500);
      }
    } catch (err) {
      openMock();
    }
  };

  return (
    <>
      <NavBar />
      <main className="auth-selector">
        <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>{t('login.title')}</h1>
        {flowAborted && (
          <div style={{background:'#fee2e2',padding:'0.5rem 1rem',borderRadius:'4px'}}>
            {t('login.retry')} <button onClick={startLogin}>{t('login.retryBtn')}</button> {' '}
            <button onClick={openMock}>{t('login.switch')}</button>
          </div>
        )}
        <div className="auth-options">
          <button
            className="auth-option-btn primary"
            onClick={startLogin}
            aria-label="Log in with national eID"
          >
            <span>{t('login.eid')}</span>
            <small>{t('login.eidDesc')}</small>
          </button>
          <button
            className="auth-option-btn"
            onClick={openMock}
            aria-label="Open developer mock login"
          >
            <span>{t('login.mock')}</span>
            <small>{t('login.mockDesc')}</small>
          </button>
        </div>
      </main>
      {showMock && <MockLoginModal onClose={() => setShowMock(false)} />}
    </>
  );
}
