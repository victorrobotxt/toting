import React from 'react';

export function NoElections() {
  return (
    <div style={{textAlign:'center', padding:'2rem'}}>
      <svg width="120" height="80" role="img" aria-label="no elections illustration">
        <circle cx="40" cy="40" r="40" fill="#e5e7eb" />
        <rect x="80" y="10" width="30" height="60" fill="#e5e7eb" />
      </svg>
      <p>No elections yet</p>
    </div>
  );
}

export function NotEligible() {
  return (
    <div style={{textAlign:'center', padding:'2rem'}}>
      <svg width="120" height="80" role="img" aria-label="not eligible illustration">
        <circle cx="60" cy="40" r="40" fill="#e5e7eb" />
        <line x1="20" y1="20" x2="100" y2="60" stroke="red" strokeWidth="8" />
      </svg>
      <p>Not eligible</p>
    </div>
  );
}

export function NoProofs() {
  return (
    <div style={{textAlign:'center', padding:'2rem'}}>
      <svg width="120" height="80" role="img" aria-label="no proofs illustration">
        <rect x="10" y="10" width="100" height="60" fill="#e5e7eb" />
        <path d="M20 20 L100 20 L60 60 Z" fill="#fff" stroke="#ccc" />
      </svg>
      <p>No proofs yet</p>
    </div>
  );
}
