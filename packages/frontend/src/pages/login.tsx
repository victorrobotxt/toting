import { useEffect, useState } from 'react';
import NavBar from '../components/NavBar';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/AuthProvider';
import MockLoginModal from '../components/MockLoginModal';

export default function LoginPage() {
  const router = useRouter();
  const { isLoggedIn, setMode } = useAuth();
  const [showMock, setShowMock] = useState(false);

  useEffect(() => {
    if (isLoggedIn) router.replace('/dashboard');
  }, [isLoggedIn, router]);

  const startLogin = async () => {
    setMode('eid');
    const res = await fetch('http://localhost:8000/auth/initiate', { redirect: 'manual' });
    const location = res.status >= 300 && res.status < 400 ? res.headers.get('Location') : undefined;
    if (res.ok && res.headers.get('content-type')?.includes('text/html') && !location) {
      const html = await res.text();
      const popup = window.open('', 'login', 'width=500,height=600');
      if (popup) {
        popup.document.write(html);
        popup.document.close();
      }
      return;
    }
    const url = location || 'http://localhost:8000/auth/initiate';
    window.open(url, 'login', 'width=500,height=600');
  };

  const openMock = () => {
    setMode('mock');
    setShowMock(true);
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
