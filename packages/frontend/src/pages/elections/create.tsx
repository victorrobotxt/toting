import { useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../lib/AuthProvider';
import NavBar from '../../components/NavBar';
import { useToast } from '../../lib/ToastProvider';
import GateBanner from '../../components/GateBanner';
import { useSWRConfig } from 'swr';
import { apiUrl } from '../../lib/api';

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
  const [meta, setMeta] = useState('');
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const handleSubmit = async () => {
    setLoading(true);
    let res: Response;
    try {
      // Validate that the metadata is valid JSON before sending
      JSON.parse(meta);

      res = await fetch(apiUrl('/elections'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ metadata: meta }), // Send the full metadata string
      });
    } catch (e: any) {
      const errorMessage = e instanceof SyntaxError ? "Invalid JSON format." : (e.message || "Network error");
      showToast({ type: 'error', message: errorMessage });
      setLoading(false);
      return;
    }

    if (res.ok) {
      const data: Election = await res.json();
      mutate(['/elections', token]);
      router.push(`/elections/${data.id}`);
    } else {
      try {
        const err = await res.json();
        showToast({ type: 'error', message: err.detail || 'Failed to create' });
      } catch {
        showToast({ type: 'error', message: 'Failed to create election' });
      }
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

  if (role !== 'admin') {
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

  const creationForm = (
    <div style={{display:'flex',flexDirection:'column',gap:'0.5rem'}}>
      <label htmlFor="metadata-json">Election Metadata (JSON format)</label>
      <textarea 
        id="metadata-json"
        value={meta} 
        onChange={e => setMeta(e.target.value)} 
        placeholder='e.g., {"title": "My Election", ...}' 
        rows={10}
        style={{fontFamily: 'monospace', border: '1px solid #ccc', padding: '0.5rem'}}
      />
      <button onClick={handleSubmit} disabled={loading || !meta.trim()}>
        {loading ? 'Submitting...' : 'Create Election'}
      </button>
    </div>
  );

  return (
    <>
      <NavBar />
      <div style={{padding:'1rem', maxWidth: '800px', margin: 'auto'}}>
        <h2>Create Election</h2>
        {creationForm}
      </div>
    </>
  );
}

export default CreateElectionPage;
