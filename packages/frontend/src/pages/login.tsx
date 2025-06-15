import { useEffect, useState } from 'react';
import NavBar from '../components/NavBar';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/AuthProvider';
import MockLoginModal from '../components/MockLoginModal';
import { useI18n } from '../lib/I18nProvider';
import { apiUrl } from '../lib/api';

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

  const openMock = () => {
    setMode('mock');
    setShowMock(true);
  };

  const startLogin = async () => {
    setMode('eid');
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
      <main
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1rem',
          padding: '2rem',
        }}
      >
        <h1 style={{ fontSize: '1.5rem' }}>Login</h1>
        {flowAborted && (
          <div style={{background:'#fee2e2',padding:'0.5rem 1rem',borderRadius:'4px'}}>
            {t('login.retry')} <button onClick={startLogin}>{t('login.retryBtn')}</button> {' '}
            <button onClick={openMock}>{t('login.switch')}</button>
          </div>
        )}
        <button onClick={startLogin} aria-label="Log in with national eID">
          Log in with eID
        </button>
        <button
          onClick={openMock}
          aria-label="Open developer mock login"
        >
          Mock Login (developer mode)
        </button>
      </main>
      {showMock && <MockLoginModal onClose={() => setShowMock(false)} />}
    </>
  );
}
