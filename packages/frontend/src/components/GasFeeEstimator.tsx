import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then(res => res.json())

export default function GasFeeEstimator() {
  const { data } = useSWR<{p95: number}>('/api/gas', fetcher, { refreshInterval: 15000 })

  return (
    <span>{data ? `~${data.p95} gwei` : '...'}</span>
  )
}
