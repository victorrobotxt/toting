import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from '../lib/AuthProvider';
import AuthChip from './AuthChip';
import AccountMenu from './AccountMenu';
import ThemeToggle from './ThemeToggle';

export default function NavBar() {
  const { isLoggedIn, eligibility, role } = useAuth();
  const [open, setOpen] = useState(false);

  const links = (
    <>
      <Link href="/">Home</Link>
      {isLoggedIn && (
        <>
          <Link href="/dashboard">Dashboard</Link>
          {eligibility && <Link href="/eligibility">Eligibility</Link>}
          {(role === 'admin' || role === 'verifier') && (
            <Link href="/elections/create">Create Election</Link>
          )}
          {role === 'admin' && <Link href="/admin">Admin</Link>}
          {role === 'verifier' && <Link href="/verifier">Verifier Panel</Link>}
        </>
      )}
    </>
  );

  return (
    <>
      <nav className="navbar">
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button className="hamburger" onClick={() => setOpen(true)} aria-label="Open menu">
            &#9776;
          </button>
          <div className="nav-links">{links}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', alignItems:'center' }}>
          {isLoggedIn ? <AccountMenu /> : <Link href="/login">Log in with eID</Link>}
          <ThemeToggle />
          <AuthChip />
        </div>
      </nav>
      {open && (
        <div className="drawer-overlay" onClick={() => setOpen(false)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            {links}
            {isLoggedIn ? (
              <AccountMenu />
            ) : (
              <Link href="/login" onClick={() => setOpen(false)}>Log in with eID</Link>
            )}
          </div>
        </div>
      )}
      <ThemeToggle />
      <AuthChip />
      {(role === 'admin' || role === 'verifier') && (
        <div style={{background:'red',color:'white',textAlign:'center',padding:'0.25rem'}}>frontend-only role, not enforced</div>
      )}
    </>
  );
}
