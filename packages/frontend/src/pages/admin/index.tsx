import useSWR from 'swr';
import NavBar from '../../components/NavBar';
import withAuth from '../../components/withAuth';
import { useAuth } from '../../lib/AuthProvider';
import { jsonFetcher } from '../../lib/api';
import AdminElectionList, { AdminElection } from '../../components/AdminElectionList';

const fetcher = ([url, token]: [string, string]) => jsonFetcher([url, token]);

function AdminDashboard() {
  const { token, logout } = useAuth();
  const { data, error } = useSWR<AdminElection[]>(token ? ['/elections', token] as [string, string] : null, fetcher);

  if (error) {
    if (error.message === 'Unauthorized') logout();
    return <p style={{ color: 'red' }}>Failed to load elections</p>;
  }

  return (
    <>
      <NavBar />
      <div style={{ padding: '1rem' }}>
        <h2>Admin Dashboard</h2>
        {!data ? <p>Loading...</p> : <AdminElectionList elections={data} />}
      </div>
    </>
  );
}

export default withAuth(AdminDashboard, ['admin']);
