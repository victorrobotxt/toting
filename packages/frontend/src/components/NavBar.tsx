import Link from 'next/link';
import { useAuth } from '../lib/AuthProvider';
import ThemeToggle from './ThemeToggle';
import AuthChip from './AuthChip';

export default function NavBar() {
  const { isLoggedIn, eligibility, logout } = useAuth();
  return (
    <nav style={{display:'flex',gap:'1rem',padding:'1rem',alignItems:'center'}}>
      <Link href="/">Home</Link>
      {isLoggedIn && (
        <>
          <Link href="/dashboard">Dashboard</Link>
          {eligibility && <Link href="/eligibility">Eligibility</Link>}
        </>
      )}
      {isLoggedIn ? (
        <button onClick={logout}>Logout</button>
      ) : (
        <Link href="/login">Log in with eID</Link>
      )}
      <ThemeToggle />
      <AuthChip />
    </nav>
  );
}
