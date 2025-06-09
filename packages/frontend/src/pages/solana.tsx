import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import Skeleton from '../components/Skeleton';

interface SolanaTally {
  A: number;
  B: number;
}

export default function SolanaChart() {
  const [data, setData] = useState([
    { option: 'A', votes: 0 },
    { option: 'B', votes: 0 },
  ]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // The relay-daemon runs on port 9300. We need to construct its URL.
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';
    const host = new URL(apiBaseUrl).hostname; // e.g., 'localhost'
    const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    // The relay daemon is exposed on port 9300 in docker-compose.yml
    const wsUrl = `${wsProtocol}://${host}:9300`;

    console.log(`Connecting to Solana WebSocket at: ${wsUrl}`);
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('Solana WebSocket connected.');
      setError(null);
    };

    ws.onmessage = (event) => {
      try {
        const msg: SolanaTally = JSON.parse(event.data);
        // Correctly map the incoming data to the 'votes' property.
        setData([
          { option: 'A', votes: msg.A },
          { option: 'B', votes: msg.B },
        ]);
        setLoading(false);
      } catch {
        console.error("Failed to parse WebSocket message:", event.data);
      }
    };
    
    ws.onerror = (err) => {
        console.error("Solana WebSocket error:", err);
        setError("Failed to connect to the Solana data stream.");
        setLoading(false);
    };

    ws.onclose = () => {
        console.log("Solana WebSocket disconnected.");
    };

    return () => ws.close();
  }, []);

  if (error) {
    return (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'red' }}>
            <p>{error}</p>
        </div>
    );
  }

  return (
    <div style={{ display:'flex',justifyContent:'center',paddingTop:'2rem' }}>
      {loading ? (
        <Skeleton width={400} height={300} />
      ) : (
        <BarChart width={400} height={300} data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="option" />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Bar dataKey="votes" fill="#8884d8" isAnimationActive={false} />
        </BarChart>
      )}
    </div>
  );
}
