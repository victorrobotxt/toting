import { useState } from 'react';
import { keccak256, toUtf8Bytes } from 'ethers/lib/utils';
import { useAuth } from '../../lib/AuthProvider';
import withAuth from '../../components/withAuth';
import NavBar from '../../components/NavBar';

function CreateElectionPage() {
  const { token, eligibility } = useAuth();
  const [meta, setMeta] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!eligibility) return;
    const hash = keccak256(toUtf8Bytes(meta));
    const res = await fetch('http://localhost:8000/elections', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ meta_hash: hash }),
    });
    if (res.ok) {
      window.location.href = '/dashboard';
    } else {
      setError('Failed to create');
    }
  };

  if (!eligibility) return <p>Not authorized</p>;

  return (
    <>
      <NavBar />
      <div style={{padding:'1rem'}}>
        <h2>Create Election</h2>
        <input value={meta} onChange={e => setMeta(e.target.value)} placeholder="metadata" />
        <button onClick={submit}>Submit</button>
        {error && <p style={{color:'red'}}>{error}</p>}
      </div>
    </>
  );
}

export default withAuth(CreateElectionPage);
