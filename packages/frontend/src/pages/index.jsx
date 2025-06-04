import ThemeToggle from '../components/ThemeToggle';

export default function Home() {
  return (
    <main style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100vh', gap:'1rem' }}>
      <ThemeToggle />
      <a href="http://localhost:8000/auth/initiate">Log in with eID</a>
    </main>
  )
}
