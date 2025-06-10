import Link from 'next/link';
import { NoElections } from './ZeroState';

export interface AdminElection {
  id: number;
  status: string;
  tally?: string;
}

export default function AdminElectionList({ elections }: { elections: AdminElection[] }) {
  if (!elections.length) return <NoElections />;
  return (
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Status</th>
          <th>Tally</th>
        </tr>
      </thead>
      <tbody>
        {elections.map((e) => (
          <tr key={e.id}>
            <td>
              <Link href={`/admin/elections/${e.id}`}>{e.id}</Link>
            </td>
            <td>{e.status}</td>
            <td>{e.tally || '-'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
