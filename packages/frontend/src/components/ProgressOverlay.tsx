import React, { useEffect, useState, useRef } from 'react';
import { apiUrl } from '../lib/api';

export default function ProgressOverlay({
  jobId,
  onDone,
}: {
  jobId: string;
  onDone: () => void;
}) {
  const [progress, setProgress] = useState(0);
  const onDoneCalled = useRef(false);

  useEffect(() => {
    const handleDone = () => {
      if (!onDoneCalled.current) {
        onDoneCalled.current = true;
        onDone();
      }
    };

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const apiBase = process.env.NEXT_PUBLIC_API_BASE;
    const host = apiBase ? new URL(apiBase).host : window.location.host;
    const wsUrl = `${protocol}//${host}/ws/proofs/${jobId}`;

    const ws = new WebSocket(wsUrl);

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        setProgress(msg.progress || 0);
        if (msg.state === 'done' || msg.state === 'error') {
          handleDone();
          ws.close();
        }
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
        handleDone();
        ws.close();
      }
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
      handleDone();
    };

    ws.onclose = () => {
      handleDone();
    };

    return () => {
      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
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
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        color: 'white',
      }}
    >
      <div className="spinner" style={{ marginBottom: '1rem' }} />
      <p>{progress}%</p>
    </div>
  );
}
