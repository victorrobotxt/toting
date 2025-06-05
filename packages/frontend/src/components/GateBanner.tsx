import React from 'react';
import Link from 'next/link';

export default function GateBanner({ message, href, label }: { message: string; href: string; label: string }) {
  return (
    <div style={{marginBottom:'1rem',padding:'0.5rem 1rem',border:'1px solid',borderRadius:'4px',background:'white',color:'red'}}>
      {message} <Link href={href}>{label}</Link>
    </div>
  );
}
