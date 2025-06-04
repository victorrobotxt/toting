import Link from 'next/link';
import { useAuth } from '../lib/AuthProvider';

export default function NavBar() {
  const { isLoggedIn, logout } = useAuth();
  return (
    <nav style={{display:'flex',gap:'1rem',padding:'1rem'}}>
      <Link href="/">Home</Link>
      {isLoggedIn && <Link href="/dashboard">Dashboard</Link>}
      {isLoggedIn ? (
        <button onClick={logout}>Logout</button>
      ) : (
        <a href="http://localhost:8000/auth/initiate">Log in with eID</a>
      )}
    </nav>
  );
}
