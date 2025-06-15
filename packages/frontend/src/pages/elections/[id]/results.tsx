import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Connection, PublicKey } from '@solana/web3.js';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import NavBar from '../../../components/NavBar';
import withAuth from '../../../components/withAuth';
import { useAuth } from '../../../lib/AuthProvider';
import { jsonFetcher } from '../../../lib/api';
import Skeleton from '../../../components/Skeleton';

interface Election {
  id: number;
  meta: string;
  start: number;
  end: number;
  status: string;
  tally?: string;
}

const fetcher = ([url, token]: [string, string]) => jsonFetcher([url, token]);

function ResultsPage() {
  const router = useRouter();
  const { token } = useAuth();
  const id = router.query.id as string | undefined;

  const { data, error } = useSWR<Election>(id && token ? [`/elections/${id}`, token] : null, fetcher);

  const [chartData, setChartData] = useState([
    { option: 'A', votes: 0 },
    { option: 'B', votes: 0 },
  ]);
  const [loading, setLoading] = useState(true);
  const [solError, setSolError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;

    const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC || 'http://localhost:8899';
    const connection = new Connection(rpc, 'confirmed');
    const programId = new PublicKey('AdemcJyFzDyiCTyuCQuhkWQHQdQUkaqj15nwAPgsARmj');

    const metaHex = data.meta.startsWith('0x') ? data.meta.slice(2) : data.meta;
    const metaBuf = Buffer.from(metaHex, 'hex');
    const [pda] = PublicKey.findProgramAddressSync([Buffer.from('election'), metaBuf], programId);

    const decode = (buf: Buffer) => {
      const offset = 8 + 32 + 32; // discriminator + authority + metadata
      const votesA = Number(buf.readBigUInt64LE(offset));
      const votesB = Number(buf.readBigUInt64LE(offset + 8));
      return { votesA, votesB };
    };

    const fetchInitial = async () => {
      try {
        const acc = await connection.getAccountInfo(pda);
        if (acc) {
          const { votesA, votesB } = decode(Buffer.from(acc.data));
          setChartData([
            { option: 'A', votes: votesA },
            { option: 'B', votes: votesB },
          ]);
          setSolError(null);
        } else {
          setSolError('Election not found on Solana.');
        }
      } catch (e) {
        console.error(e);
        setSolError('Failed to fetch Solana account.');
      }
      setLoading(false);
    };

    fetchInitial();

    const subId = connection.onAccountChange(pda, info => {
      const { votesA, votesB } = decode(Buffer.from(info.data));
      setChartData([
        { option: 'A', votes: votesA },
        { option: 'B', votes: votesB },
      ]);
    });

    return () => {
      connection.removeAccountChangeListener(subId);
    };
  }, [data]);

  if (error) {
    return (
      <>
        <NavBar />
        <p style={{ color: 'red', padding: '1rem' }}>Failed to load election.</p>
      </>
    );
  }

  return (
    <>
      <NavBar />
      <div style={{ padding: '1rem' }}>
        {!data ? (
          <Skeleton width={200} height={20} />
        ) : (
          <h2>Results for Election {data.id}</h2>
        )}
        {solError && <p style={{ color: 'red' }}>{solError}</p>}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '1rem' }}>
          {loading ? (
            <Skeleton width={400} height={300} />
          ) : (
            <BarChart width={400} height={300} data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="option" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="votes" fill="#8884d8" isAnimationActive={false} />
            </BarChart>
          )}
        </div>
      </div>
    </>
  );
}

export default withAuth(ResultsPage);
