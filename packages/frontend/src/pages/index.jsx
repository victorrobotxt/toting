import ThemeToggle from '../components/ThemeToggle';
import GasFeeEstimator from '../components/GasFeeEstimator';
import NavBar from '../components/NavBar';
import PushSubscribe from '../components/PushSubscribe';
import Link from 'next/link';

export default function Home() {
  return (
    <>
      <NavBar />
      <main style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'80vh', gap:'1rem' }}>
        <ThemeToggle />
        <PushSubscribe />
        <Link href="/solana">View Solana Chart</Link>
        <div>Gas: <GasFeeEstimator /></div>
      </main>
    </>
  )
}
