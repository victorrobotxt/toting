import { useRouter } from 'next/router';
import useSWR from 'swr';
import NavBar from '../../components/NavBar';
import withAuth from '../../components/withAuth';
import { useAuth } from '../../lib/AuthProvider';

interface Election {
  id: number;
  meta: string;
  start: number;
  end: number;
  status: string;
  tally?: string;
}

const fetcher = ([url, token]: [string, string]) => fetch(`http://localhost:8000${url}`, {
  headers: { Authorization: `Bearer ${token}` }
}).then(r => {
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
});

function ElectionDetail() {
  const router = useRouter();
  const { token, eligibility, logout } = useAuth();
  const id = router.query.id;
  const { data, error } = useSWR<Election>(id && token ? [`/elections/${id}`, token] as [string, string] : null, fetcher);

  if (error) {
    if (error.message === 'Unauthorized') logout();
    return <p style={{color:'red'}}>Error loading</p>;
  }

  return (
    <>
      <NavBar />
      <div style={{padding:'1rem'}}>
        {!data ? <p>Loading...</p> : (
          <div>
            <h2>Election {data.id}</h2>
            <p>Meta: {data.meta}</p>
            <p>Start: {data.start}</p>
            <p>End: {data.end}</p>
            <p>Status: {data.status}</p>
            {data.tally && <p>Tally: {data.tally}</p>}
            {data.status === 'open' && eligibility && (
              <a href={`/vote?id=${data.id}`}>Vote</a>
            )}
            {data.status !== 'open' && eligibility && (
              <button onClick={() => alert('run tally placeholder')}>Run Tally</button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

export default withAuth(ElectionDetail);
