import { useState } from 'react';
import { useAuth } from '../lib/AuthProvider';
import { useToast } from '../lib/ToastProvider';
import { useSWRConfig } from 'swr';
import { apiUrl } from '../lib/api';

export interface Election {
  id: number;
  status: string;
  tally?: string;
}

export default function AdminElectionForm({ onCreated }: { onCreated?: (e: Election) => void }) {
  const { token } = useAuth();
  const { showToast } = useToast();
  const { mutate } = useSWRConfig();
  const [meta, setMeta] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      JSON.parse(meta);
    } catch {
      showToast({ type: 'error', message: 'Invalid JSON' });
      setLoading(false);
      return;
    }
    const res = await fetch(apiUrl('/elections'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ metadata: meta }),
    });
    if (res.ok) {
      const data: Election = await res.json();
      mutate(['/elections', token]);
      onCreated?.(data);
    } else {
      showToast({ type: 'error', message: 'Failed to create election' });
    }
    setLoading(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <label htmlFor="meta">Election Metadata (JSON)</label>
      <textarea
        id="meta"
        value={meta}
        onChange={(e) => setMeta(e.target.value)}
        rows={10}
        style={{ fontFamily: 'monospace', border: '1px solid #ccc', padding: '0.5rem' }}
      />
      <button onClick={submit} disabled={loading || !meta.trim()}>
        {loading ? 'Submitting...' : 'Create'}
      </button>
    </div>
  );
}
