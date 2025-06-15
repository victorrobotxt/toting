import { useAuth } from '../lib/AuthProvider';

export default function AuthChip() {
  const { mode } = useAuth();
  const color = mode === 'eid' ? 'green' : mode === 'mock' ? 'blue' : 'gray';
  return (
    <span style={{ padding:'0 0.5rem', borderRadius:'9999px', background:color, color:'white' }}>
      {mode}
    </span>
  );
}
