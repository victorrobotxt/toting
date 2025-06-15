import useSWR from 'swr';
import NavBar from '../../components/NavBar';
import withAuth from '../../components/withAuth';
import { useAuth } from '../../lib/AuthProvider';
import { jsonFetcher } from '../../lib/api';
import AdminElectionList, { AdminElection } from '../../components/AdminElectionList';
import Skeleton from '../../components/Skeleton';

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
        {!data ? (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Status</th>
                <th>Tally</th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3].map((i) => (
                <tr key={i}>
                  <td>
                    <Skeleton width={20} height={16} />
                  </td>
                  <td>
                    <Skeleton width={80} height={16} />
                  </td>
                  <td>
                    <Skeleton width={80} height={16} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <AdminElectionList elections={data} />
        )}
      </div>
    </>
  );
}

export default withAuth(AdminDashboard, ['admin']);
