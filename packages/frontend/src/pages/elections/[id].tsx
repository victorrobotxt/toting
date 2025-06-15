import { useRouter } from 'next/router';
import useSWR from 'swr';
import { useState } from 'react';
import Link from 'next/link';
import NavBar from '../../components/NavBar';
import withAuth from '../../components/withAuth';
import { useAuth } from '../../lib/AuthProvider';
import Skeleton from '../../components/Skeleton';
import { jsonFetcher, apiUrl } from '../../lib/api';

interface Election {
  id: number;
  meta: string;
  start: number;
  end: number;
  status: string;
  tally?: string;
}

const fetcher = ([url, token]: [string, string]) => jsonFetcher([url, token]);

function ElectionDetail() {
  const router = useRouter();
  const { token, eligibility, logout } = useAuth();
  const id = router.query.id;
  const { data, error, mutate } = useSWR<Election>(id && token ? [`/elections/${id}`, token] as [string, string] : null, fetcher);
  const [newStatus, setNewStatus] = useState('');
  const [newTally, setNewTally] = useState('');

  const submitUpdate = async () => {
    const payload: any = {};
    if (newStatus) payload.status = newStatus;
    if (newTally) payload.tally = newTally;
    await fetch(apiUrl(`/elections/${id}`), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    setNewStatus('');
    setNewTally('');
    mutate();
  };

  if (error) {
    if (error.message === 'Unauthorized') logout();
    return <p style={{color:'red'}}>Error loading</p>;
  }

  return (
    <>
      <NavBar />
      <div style={{padding:'1rem'}}>
        {!data ? (
          <div>
            <h2><Skeleton width={120} height={20} /></h2>
            <p><Skeleton width={220} height={16} /></p>
            <p><Skeleton width={180} height={16} /></p>
            <p><Skeleton width={180} height={16} /></p>
            <p><Skeleton width={180} height={16} /></p>
          </div>
        ) : (
          <div>
            <h2>Election {data.id}</h2>
            <p>Meta: {data.meta}</p>
            <p>Start: {data.start}</p>
            <p>End: {data.end}</p>
            <p>Status: {data.status}</p>
            {data.tally && (
              <p>
                Tally: {data.tally}{' '}
                <Link href={`/elections/${data.id}/results`}>View Results</Link>
              </p>
            )}
            {data.status === 'open' && eligibility && (
              <Link href={`/vote?id=${data.id}`}>Vote</Link>
            )}
            {data.status !== 'open' && eligibility && (
              <button onClick={() => alert('run tally placeholder')}>Run Tally</button>
            )}
            {eligibility && (
              <div style={{marginTop:'1rem'}}>
                <h3>Update Election</h3>
                <div>
                  <label>Status:
                    <select value={newStatus} onChange={e => setNewStatus(e.target.value)}>
                      <option value=''>--</option>
                      <option value='pending'>pending</option>
                      <option value='open'>open</option>
                      <option value='closed'>closed</option>
                      <option value='tallied'>tallied</option>
                    </select>
                  </label>
                </div>
                <div>
                  <label>Tally:
                    <input value={newTally} onChange={e => setNewTally(e.target.value)} />
                  </label>
                </div>
                <button onClick={submitUpdate}>Submit</button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

export default withAuth(ElectionDetail);
