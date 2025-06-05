import { useEffect } from 'react';
import NavBar from '../components/NavBar';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/AuthProvider';

export default function LoginPage() {
  const router = useRouter();
  const { isLoggedIn } = useAuth();

  useEffect(() => {
    if (isLoggedIn) router.replace('/dashboard');
  }, [isLoggedIn, router]);

  const startLogin = async () => {
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

  return (
    <>
      <NavBar />
      <div style={{display:'flex',justifyContent:'center',padding:'2rem'}}>
        <button onClick={startLogin}>Log in with eID</button>
      </div>
    </>
  );
}
