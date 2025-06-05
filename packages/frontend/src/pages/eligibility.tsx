import React, { useState } from 'react';
import withAuth from '../components/withAuth';
import NavBar from '../components/NavBar';
import { useAuth } from '../lib/AuthProvider';
import { useToast } from '../lib/ToastProvider';

function EligibilityPage() {
  const { token } = useAuth();
  const [country, setCountry] = useState('');
  const [dob, setDob] = useState('');
  const [residency, setResidency] = useState('');
  const [proof, setProof] = useState<string | null>(null);
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    
    setProof(null);
    const payload = { country, dob, residency };
    const res = await fetch('http://localhost:8000/api/zk/eligibility', {
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
    const jobId = data.job_id;
    let result = data;
    if (!data.status) {
      // initial response is job id
      while (true) {
        const poll = await fetch(`http://localhost:8000/api/zk/eligibility/${jobId}`).then(r => r.json());
        if (poll.status === 'done') { result = poll; break; }
        if (poll.status === 'error') { showToast({ type: 'error', message: 'proof error' }); setLoading(false); return; }
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    if (result.proof) setProof(result.proof);
    else showToast({ type: 'error', message: 'proof error' });
    setLoading(false);
  };

  return (
    <>
      <NavBar />
      <div style={{padding:'1rem'}}>
        <h2>Eligibility Proof</h2>
        <div>
          <label>Country: <input value={country} onChange={e => setCountry(e.target.value)} /></label>
        </div>
        <div>
          <label>DOB: <input type="date" value={dob} onChange={e => setDob(e.target.value)} /></label>
        </div>
        <div>
          <label>Residency: <input value={residency} onChange={e => setResidency(e.target.value)} /></label>
        </div>
        <button onClick={submit} disabled={loading}>Submit</button>
        {loading && <p>Waiting for proof...</p>}
        {proof && <p>Proof: {proof}</p>}
      </div>
    </>
  );
}

export default withAuth(EligibilityPage);
