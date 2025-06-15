import React from 'react';
import NoDataIllustration from '../assets/no_data.svg';
import CancelIllustration from '../assets/cancel.svg';
import EmptyIllustration from '../assets/empty.svg';

export function NoElections() {
  return (
    <div style={{ textAlign: 'center', padding: '2rem' }}>
      <img src={NoDataIllustration} alt="No elections" style={{ width: '12rem', maxWidth: '100%' }} />
      <p>No elections yet</p>
    </div>
  );
}

export function NotEligible() {
  return (
    <div style={{ textAlign: 'center', padding: '2rem' }}>
      <img src={CancelIllustration} alt="Not eligible" style={{ width: '12rem', maxWidth: '100%' }} />
      <p>Not eligible</p>
    </div>
  );
}

export function NoProofs() {
  return (
    <div style={{ textAlign: 'center', padding: '2rem' }}>
      <img src={EmptyIllustration} alt="No proofs" style={{ width: '12rem', maxWidth: '100%' }} />
      <p>No proofs yet</p>
    </div>
  );
}
