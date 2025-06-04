import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

interface SolanaTally {
  A: number;
  B: number;
}

export default function SolanaChart() {
  const [data, setData] = useState([
    { option: 'A', votes: 0 },
    { option: 'B', votes: 0 },
  ]);

  useEffect(() => {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${protocol}://${location.host}/ws/solana`);
    ws.onmessage = (event) => {
      try {
        const msg: SolanaTally = JSON.parse(event.data);
        setData([
          { option: 'A', votes: msg.A },
          { option: 'B', votes: msg.B },
        ]);
      } catch {
        // ignore malformed payloads
      }
    };
    return () => ws.close();
  }, []);

  return (
    <div style={{ display:'flex',justifyContent:'center',paddingTop:'2rem' }}>
      <BarChart width={400} height={300} data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="option" />
        <YAxis allowDecimals={false} />
        <Tooltip />
        <Bar dataKey="votes" fill="#8884d8" isAnimationActive={false} />
      </BarChart>
    </div>
  );
}
