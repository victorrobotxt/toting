import useSWR from 'swr';
import NavBar from '../components/NavBar';
import withAuth from '../components/withAuth';
import { useAuth } from '../lib/AuthProvider';
import Skeleton from '../components/Skeleton';
import { jsonFetcher } from '../lib/api';

interface AuditRow {
  id: number;
  circuit_hash: string;
  input_hash: string;
  proof_root: string;
  timestamp: string;
}

// Pass the URL and token as an array to match the jsonFetcher's expected signature.
const fetcher = ([url, token]: [string, string]) => jsonFetcher([url, token]);

function VerifierPage() {
  const { token } = useAuth();
  const { data, error } = useSWR<AuditRow[]>(token ? ['/proofs', token] as [string, string] : null, fetcher);

  return (
    <>
      <NavBar />
      <div style={{ padding: '1rem' }}>
        <h2>Verifier Panel</h2>
        {error && <p style={{color:'red'}}>Failed to load</p>}
        {!data ? (
          <table>
            <thead>
              <tr><th>ID</th><th>Circuit</th><th>Input Hash</th><th>Proof Root</th><th>Timestamp</th></tr>
            </thead>
            <tbody>
              {[1,2,3].map(i => (
                <tr key={i}>
                  <td><Skeleton width={20} height={16} /></td>
                  <td><Skeleton width={80} height={16} /></td>
                  <td><Skeleton width={80} height={16} /></td>
                  <td><Skeleton width={80} height={16} /></td>
                  <td><Skeleton width={120} height={16} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table>
            <thead>
              <tr><th>ID</th><th>Circuit</th><th>Input Hash</th><th>Proof Root</th><th>Timestamp</th></tr>
            </thead>
            <tbody>
              {data.map(row => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td>{row.circuit_hash}</td>
                  <td>{row.input_hash}</td>
                  <td>{row.proof_root}</td>
                  <td>{row.timestamp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

export default withAuth(VerifierPage, ['verifier']);
