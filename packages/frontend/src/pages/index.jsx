import ThemeToggle from '../components/ThemeToggle';
import GasFeeEstimator from '../components/GasFeeEstimator';
import NavBar from '../components/NavBar';

export default function Home() {
  return (
    <>
      <NavBar />
      <main style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'80vh', gap:'1rem' }}>
        <ThemeToggle />
        <a href="/solana">View Solana Chart</a>
        <div>Gas: <GasFeeEstimator /></div>
      </main>
    </>
  )
}
