import React, { useEffect, useState } from 'react';
import { apiUrl } from '../lib/api';

export default function ProgressOverlay({ jobId, onDone }: { jobId: string; onDone: () => void }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Build a proper ws:// or wss:// URL from whatever apiUrl() returns
    const httpUrl = apiUrl(`/ws/proofs/${jobId}`); // e.g. "http://backend:8000/ws/proofs/..."
    const urlObj = new URL(httpUrl);
    // switch protocol from 'http:' → 'ws:' (or 'https:' → 'wss:')
    urlObj.protocol = urlObj.protocol === 'https:' ? 'wss:' : 'ws:';
    // when API_BASE uses an internal hostname (e.g. "backend"), use browser host
    if (urlObj.hostname !== window.location.hostname) {
      urlObj.hostname = window.location.hostname;
    }
    const ws = new WebSocket(urlObj.toString());

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
      ws.close();
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