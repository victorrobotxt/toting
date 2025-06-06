import { useEffect, useState } from 'react';
import NavBar from '../components/NavBar';
import { useAuth } from '../lib/AuthProvider';
import { apiUrl } from '../lib/api';

export default function DevPage() {
  const { token, mode, setMode } = useAuth();
  const [quota, setQuota] = useState<number | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(apiUrl('/api/quota'), {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.ok ? r.json() : { left: 0 })
      .then(d => setQuota(d.left))
      .catch(() => setQuota(null));
  }, [token]);

  const envs = Object.entries(process.env)
    .filter(([k]) => k.startsWith('NEXT_PUBLIC'));

  return (
    <>
      <NavBar />
      <div style={{ padding: '1rem' }}>
        <h2>Developer Settings</h2>
        <h3>Env Vars</h3>
        <ul>
          {envs.map(([k, v]) => (
            <li key={k}><b>{k}</b>= {String(v)}</li>
          ))}
        </ul>
        <p>Auth mode: {mode}</p>
        {quota !== null && <p>Proof quota left: {quota}</p>}
        <label>
          <input
            type="checkbox"
            checked={mode === 'mock'}
            onChange={e => setMode(e.target.checked ? 'mock' : 'eid')}
          />{' '}
          Switch to Mock Login
        </label>
      </div>
    </>
  );
}
