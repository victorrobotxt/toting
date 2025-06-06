import useSWR from 'swr';
import { useAuth } from '../lib/AuthProvider';
import withAuth from '../components/withAuth';
import NavBar from '../components/NavBar';
import Link from 'next/link';
import Skeleton from '../components/Skeleton';
import { NoElections } from '../components/ZeroState';
import { jsonFetcher } from '../lib/api';

interface Election {
  id: number;
  meta: string;
  start: number;
  end: number;
  status: string;
  tally?: string;
}

const fetcher = ([url, token]: [string, string]) =>
  jsonFetcher([url, token]);

function DashboardPage() {
  const { token, logout, eligibility } = useAuth();
  const { data, error } = useSWR<Election[]>(token ? ['/elections', token] as [string, string] : null, fetcher);

  if (error) {
    if (error.message === 'Unauthorized') logout();
    return <p style={{color:'red'}}>Failed to load elections</p>;
  }

  return (
    <>
      <NavBar />
      <div style={{padding:'1rem'}}>
        {eligibility && <Link href="/elections/create">Create Election</Link>}
        <h2>Election List</h2>
        {!data ? (
          <table>
            <thead>
              <tr><th>ID</th><th>Meta</th><th>Start</th><th>End</th><th>Status</th></tr>
            </thead>
            <tbody>
              {[1,2,3].map(i => (
                <tr key={i}>
                  <td><Skeleton width={20} height={16} /></td>
                  <td><Skeleton width={80} height={16} /></td>
                  <td><Skeleton width={80} height={16} /></td>
                  <td><Skeleton width={80} height={16} /></td>
                  <td><Skeleton width={60} height={16} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : data.length === 0 ? (
          <NoElections />
        ) : (
          <table>
            <thead>
              <tr><th>ID</th><th>Meta</th><th>Start</th><th>End</th><th>Status</th></tr>
            </thead>
            <tbody>
              {data.map(e => (
                <tr key={e.id}>
                  <td><Link href={`/elections/${e.id}`}>{e.id}</Link></td>
                  <td>{e.meta}</td>
                  <td>{e.start}</td>
                  <td>{e.end}</td>
                  <td>{e.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

export default withAuth(DashboardPage);
