import React, { useState } from 'react';
import NavBar from '../components/NavBar';
import { useAuth } from '../lib/AuthProvider';
import GateBanner from '../components/GateBanner';
import { useToast } from '../lib/ToastProvider';
import ProgressOverlay from '../components/ProgressOverlay';
import { NoProofs } from '../components/ZeroState';
import HelpTip from '../components/HelpTip';
import { apiUrl } from '../lib/api';

function EligibilityPage() {
  const { token, isLoggedIn } = useAuth();
  const [country, setCountry] = useState('');
  const [dob, setDob] = useState('');
  const [residency, setResidency] = useState('');
  const [proof, setProof] = useState<string | null>(null);
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    
    setProof(null);
    const payload = { country, dob, residency };
    const res = await fetch(apiUrl('/api/zk/eligibility'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    if (res.status === 429) {
      showToast({ type: 'error', message: 'quota exceeded' });
      setLoading(false);
      return;
    }
    const data = await res.json();
    const jid = data.job_id;
    setJobId(jid);
    // actual result fetched when overlay completes
  };

  const overlay = jobId && loading ? (
    <ProgressOverlay
      jobId={jobId}
      onDone={async () => {
        const res = await fetch(`${apiUrl('/api/zk/eligibility/')}${jobId}`).then(r => r.json());
        setJobId(null);
        setLoading(false);
        if (res.status === 'done' && res.proof) setProof(res.proof);
        else showToast({ type: 'error', message: 'proof error' });
      }}
    />
  ) : null;

  return (
    <>
      <NavBar />
      <div style={{padding:'1rem'}}>
        {!isLoggedIn && (
          <GateBanner message="You must log in to prove eligibility." href="/login" label="Log in" />
        )}
        <h2>Eligibility Proof <HelpTip content="Proves you meet the election rules" /></h2>
        <div>
          <label>Country: <input value={country} onChange={e => setCountry(e.target.value)} /></label>
        </div>
        <div>
          <label>DOB: <input type="date" value={dob} onChange={e => setDob(e.target.value)} /></label>
        </div>
        <div>
          <label>Residency: <input value={residency} onChange={e => setResidency(e.target.value)} /></label>
        </div>
        <button onClick={submit} disabled={loading || !isLoggedIn}>Submit</button>
        {proof ? <p>Proof: {proof}</p> : !loading && <NoProofs />}
        {loading && overlay}
      </div>
    </>
  );
}

export default EligibilityPage;
