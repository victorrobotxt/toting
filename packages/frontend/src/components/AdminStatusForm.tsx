import { useState } from 'react';
import { useAuth } from '../lib/AuthProvider';
import { apiUrl } from '../lib/api';

export default function AdminStatusForm({ id, current, onUpdated }: { id: number; current: string; onUpdated: () => void }) {
  const { token } = useAuth();
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!status) return;
    setLoading(true);
    await fetch(apiUrl(`/elections/${id}`), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status }),
    });
    setStatus('');
    setLoading(false);
    onUpdated();
  };

  return (
    <div style={{ marginTop: '1rem' }}>
      <label>
        Status:
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">--</option>
          <option value="pending">pending</option>
          <option value="open">open</option>
          <option value="closed">closed</option>
          <option value="tallied">tallied</option>
        </select>
      </label>
      <button onClick={submit} disabled={loading || !status} style={{ marginLeft: '0.5rem' }}>
        {loading ? 'Updating...' : 'Update'}
      </button>
    </div>
  );
}
