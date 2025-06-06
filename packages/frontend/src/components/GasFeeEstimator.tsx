import useSWR from 'swr'
import { apiUrl } from '../lib/api'

const fetcher = (url: string) => fetch(url).then(res => res.json())

export default function GasFeeEstimator() {
  const { data } = useSWR<{p95: number}>(apiUrl('/api/gas'), fetcher, { refreshInterval: 15000 })

  return (
    <span>{data ? `~${data.p95} gwei` : '...'}</span>
  )
}
