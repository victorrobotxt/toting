import { useState } from 'react';
import { useRouter } from 'next/router';
import { keccak256, toUtf8Bytes } from 'ethers/lib/utils';
import { useAuth } from '../../lib/AuthProvider';
import NavBar from '../../components/NavBar';
import { useToast } from '../../lib/ToastProvider';
import GateBanner from '../../components/GateBanner';
import { useSWRConfig } from 'swr';

interface Election {
  id: number;
  meta: string;
  start: number;
  end: number;
  status: string;
  tally?: string;
}

function CreateElectionPage() {
  const { token, eligibility, role, isLoggedIn } = useAuth();
  const { mutate } = useSWRConfig();
  const router = useRouter();
  const step = parseInt((router.query.step as string) || '1', 10);
  const [meta, setMeta] = useState('');
  const [hash, setHash] = useState('');
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const goto = (n: number) => router.replace(`/elections/create?step=${n}`);

  const handleSubmit = async () => {
    setLoading(true);
    const res = await fetch('http://localhost:8000/elections', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ meta_hash: hash }),
    });
    if (res.ok) {
      const data: Election = await res.json();
      mutate(['/elections', token] as any, (curr: Election[] = []) => [...curr, data], false);
      router.push(`/elections/${data.id}`);
    } else {
      showToast({ type: 'error', message: 'Failed to create' });
    }
    setLoading(false);
  };

  if (!isLoggedIn) {
    return (
      <>
        <NavBar />
        <div style={{padding:'1rem'}}>
          <GateBanner message="You must log in first." href="/login" label="Log in" />
        </div>
      </>
    );
  }

  if (role !== 'admin' && role !== 'verifier') {
    return (
      <>
        <NavBar />
        <div style={{padding:'1rem'}}>
          <GateBanner message="Insufficient role." href="/dashboard" label="Back" />
        </div>
      </>
    );
  }

  if (!eligibility) {
    return (
      <>
        <NavBar />
        <div style={{padding:'1rem'}}>
          <GateBanner message="Provide an eligibility proof first." href="/eligibility" label="Prove" />
        </div>
      </>
    );
  }

  const stepOne = (
    <div style={{display:'flex',flexDirection:'column',gap:'0.5rem'}}>
      <textarea value={meta} onChange={e => setMeta(e.target.value)} placeholder="metadata json" />
      <button onClick={() => { setHash(keccak256(toUtf8Bytes(meta))); goto(2); }}>Next</button>
    </div>
  );

  const stepTwo = (
    <div style={{display:'flex',flexDirection:'column',gap:'0.5rem'}}>
      <p>Hash: {hash}</p>
      <button onClick={() => goto(1)}>Back</button>
      <button onClick={() => goto(3)}>Confirm</button>
    </div>
  );

  const stepThree = (
    <div style={{display:'flex',flexDirection:'column',gap:'0.5rem'}}>
      <button onClick={handleSubmit} disabled={loading}>Submit</button>
      <button onClick={() => router.push('/dashboard')}>Cancel</button>
    </div>
  );

  return (
    <>
      <NavBar />
      <div style={{padding:'1rem'}}>
        <h2>Create Election</h2>
        {step === 1 && stepOne}
        {step === 2 && stepTwo}
        {step === 3 && stepThree}
      </div>
    </>
  );
}

export default CreateElectionPage;
