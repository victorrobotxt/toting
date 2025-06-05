import { useState } from 'react';
import { useAuth } from '../lib/AuthProvider';

export default function MockLoginModal({ onClose }: { onClose: () => void }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  const submit = async () => {
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) { setError('invalid email'); return; }
    const res = await fetch(`http://localhost:8000/auth/callback?user=${encodeURIComponent(email)}`);
    const data = await res.json();
    if (data.id_token) {
      login(data.id_token, data.eligibility, 'mock');
      onClose();
    } else {
      setError('login failed');
    }
  };

  return (
    <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{background:'white',padding:'1rem',minWidth:'300px'}}>
        <h3>Mock Login</h3>
        <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" />
        <button onClick={submit}>Login</button>
        <button onClick={onClose}>Cancel</button>
        {error && <p style={{color:'red'}}>{error}</p>}
      </div>
    </div>
  );
}
