import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import { apiUrl } from '../../lib/api';

export default function CallbackPage() {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) return;
    if (!window.opener) {
      router.replace('/login');
      return;
    }
    const query = window.location.search;
    fetch(`${apiUrl('/auth/callback')}${query}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(data => {
        window.opener.postMessage({ id_token: data.id_token, eligibility: data.eligibility }, window.opener.location.origin);
        window.close();
      })
      .catch(() => {
        window.opener.postMessage({ error: true }, window.opener.location.origin);
        window.close();
      });
  }, [router.isReady]);

  return (
    <p style={{padding:'1rem'}}>Processing...</p>
  );
}
