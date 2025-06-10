import { useRouter } from 'next/router';
import useSWR from 'swr';
import NavBar from '../../../components/NavBar';
import withAuth from '../../../components/withAuth';
import { useAuth } from '../../../lib/AuthProvider';
import { jsonFetcher } from '../../../lib/api';
import AdminStatusForm from '../../../components/AdminStatusForm';

interface Election {
  id: number;
  status: string;
  tally?: string;
}

const fetcher = ([url, token]: [string, string]) => jsonFetcher([url, token]);

function AdminElectionDetail() {
  const router = useRouter();
  const { token } = useAuth();
  const { id } = router.query;
  const { data, error, mutate } = useSWR<Election>(id && token ? [`/elections/${id}`, token] as [string, string] : null, fetcher);

  if (error) return <><NavBar /><p style={{ color: 'red' }}>Error loading</p></>;

  return (
    <>
      <NavBar />
      <div style={{ padding: '1rem' }}>
        {!data ? (
          <p>Loading...</p>
        ) : (
          <div>
            <h2>Election {data.id}</h2>
            <p>Status: {data.status}</p>
            {data.tally && <p>Tally: {data.tally}</p>}
            <AdminStatusForm id={data.id} current={data.status} onUpdated={mutate} />
          </div>
        )}
      </div>
    </>
  );
}

export default withAuth(AdminElectionDetail, ['admin']);
