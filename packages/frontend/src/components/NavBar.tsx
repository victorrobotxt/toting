import Link from 'next/link';
import { useAuth } from '../lib/AuthProvider';
import ThemeToggle from './ThemeToggle';
import { useState } from 'react';

export default function NavBar() {
  const { isLoggedIn, eligibility, logout } = useAuth();
  const [open, setOpen] = useState(false);

  const links = (
    <>
      <Link href="/">Home</Link>
      {isLoggedIn && (
        <>
          <Link href="/dashboard">Dashboard</Link>
          {eligibility && <Link href="/eligibility">Eligibility</Link>}
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
          <ThemeToggle />
          {isLoggedIn ? (
            <button onClick={logout}>Logout</button>
          ) : (
            <Link href="/login">Log in with eID</Link>
          )}
        </div>
      </nav>
      {open && (
        <div className="drawer-overlay" onClick={() => setOpen(false)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            {links}
            {isLoggedIn ? (
              <button onClick={() => { setOpen(false); logout(); }}>Logout</button>
            ) : (
              <Link href="/login" onClick={() => setOpen(false)}>Log in with eID</Link>
            )}
            <ThemeToggle />
          </div>
        </div>
      )}
    </>
  );
}
