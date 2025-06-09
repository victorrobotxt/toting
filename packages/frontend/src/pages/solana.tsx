import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import Skeleton from '../components/Skeleton';

interface SolanaTally {
  A: number;
  B: number;
}

// --- THIS IS A FIX: Add a retry mechanism for WebSocket connection ---
function connectWithRetry(wsUrl: string, onMessage: (msg: SolanaTally) => void, onError: (msg: string) => void) {
    let ws = new WebSocket(wsUrl);
    let connectInterval: NodeJS.Timeout | null = null;
    let keepAliveInterval: NodeJS.Timeout | null = null;

    const connect = () => {
        console.log(`Connecting to Solana WebSocket at: ${wsUrl}`);
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('Solana WebSocket connected.');
            onError(''); // Clear any previous error
            if (connectInterval) clearInterval(connectInterval);

            // Send a ping every 30 seconds to keep the connection alive
            keepAliveInterval = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send('ping');
                }
            }, 30000);
        };

        ws.onmessage = (event) => {
            if (event.data === 'pong') return; // Ignore keep-alive responses
            try {
                const msg: SolanaTally = JSON.parse(event.data);
                onMessage(msg);
            } catch {
                console.error("Failed to parse WebSocket message:", event.data);
            }
        };

        ws.onclose = () => {
            console.log('Solana WebSocket disconnected. Attempting to reconnect...');
            if (keepAliveInterval) clearInterval(keepAliveInterval);
            connectInterval = setTimeout(check, 5000);
        };

        ws.onerror = (err) => {
            console.error("Solana WebSocket error:", err);
            onError("Failed to connect to the Solana data stream.");
            ws.close(); // Triggers the onclose handler for reconnection
        };
    };

    const check = () => {
        if (!ws || ws.readyState === WebSocket.CLOSED) connect();
    };

    check(); // Initial connection attempt

    return () => { // Cleanup function
        if (connectInterval) clearInterval(connectInterval);
        if (keepAliveInterval) clearInterval(keepAliveInterval);
        if (ws) {
            ws.onclose = null; // prevent reconnect logic from firing on manual close
            ws.close();
        }
    };
}


export default function SolanaChart() {
  const [data, setData] = useState([
    { option: 'A', votes: 0 },
    { option: 'B', votes: 0 },
  ]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';
    const host = new URL(apiBaseUrl).hostname;
    const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${wsProtocol}://${host}:9300`;

    const onMessage = (msg: SolanaTally) => {
      setData([
        { option: 'A', votes: msg.A },
        { option: 'B', votes: msg.B },
      ]);
      setLoading(false);
    };

    const onError = (msg: string) => {
      if(msg) setError(msg);
    };

    // --- THIS IS A FIX: Use the new robust connection function ---
    const cleanup = connectWithRetry(wsUrl, onMessage, onError);
    return cleanup;
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
