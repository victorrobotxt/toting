import React, { useEffect, useState } from 'react';
import { apiUrl } from '../lib/api';

export default function ProgressOverlay({ jobId, onDone }: { jobId: string; onDone: () => void }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Use the API base host from env vars, otherwise fall back to the window's host.
    // This correctly handles Docker's internal networking vs. local dev where ports differ.
    const apiBase = process.env.NEXT_PUBLIC_API_BASE;
    const host = apiBase ? new URL(apiBase).host : window.location.host;
    const wsUrl = `${protocol}//${host}/ws/proofs/${jobId}`;

    const ws = new WebSocket(wsUrl);

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      setProgress(msg.progress || 0);
      // once backend says "done" or "error", close the socket and call onDone()
      if (msg.state === 'done' || msg.state === 'error') {
        onDone();
        ws.close();
      }
    };
    ws.onerror = () => {
      // If WebSocket fails immediately, we still want to call onDone
      onDone();
    };
    ws.onclose = () => {
      // just in case onDone hasn't been called yet
      onDone();
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [jobId, onDone]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
      }}
    >
      <div
        style={{
          background: 'white',
          padding: '1rem',
          borderRadius: '8px',
          minWidth: '200px',
          textAlign: 'center',
        }}
      >
        <p>Processing... {progress}%</p>
      </div>
    </div>
  );
}
