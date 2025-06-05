import React, { useEffect, useState } from 'react';

export default function ProgressOverlay({ jobId, onDone }: { jobId: string; onDone: () => void }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:8000/ws/proofs/${jobId}`);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      setProgress(msg.progress || 0);
      if (msg.state === 'done' || msg.state === 'error') {
        onDone();
        ws.close();
      }
    };
    return () => ws.close();
  }, [jobId, onDone]);

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2000}}>
      <div style={{background:'white',padding:'1rem',borderRadius:'8px',minWidth:'200px',textAlign:'center'}}>
        <p>Processing... {progress}%</p>
      </div>
    </div>
  );
}
