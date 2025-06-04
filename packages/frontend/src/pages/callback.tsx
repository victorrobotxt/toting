import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthProvider';

export default function CallbackPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!router.isReady) return;
    const query = window.location.search;
    fetch(`http://localhost:8000/auth/callback${query}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(data => {
        if (data.id_token) {
          login(data.id_token, data.eligibility);
          router.replace('/dashboard');
        } else {
          setError('No token received');
        }
      })
      .catch(() => setError('Login failed'));
  }, [router.isReady]);

  return (
    <div style={{display:'flex',justifyContent:'center',paddingTop:'2rem'}}>
      {error ? <p style={{color:'red'}}>{error}</p> : <p>Processing login...</p>}
    </div>
  );
}
