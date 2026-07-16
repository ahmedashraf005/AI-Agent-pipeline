import { useCountUp } from '../hooks/useCountUp.js'

export default function MetricsRow({ jobsToday, cacheHitRate, avgLatency }) {
  const displayedJobsToday = Math.round(useCountUp(jobsToday))
  const displayedCacheHitRate = Math.round(useCountUp(cacheHitRate))
  const metrics = [
    { label: 'Jobs today', value: displayedJobsToday },
    { label: 'Cache hit rate', value: `${displayedCacheHitRate}%` },
    { label: 'Avg latency', value: avgLatency === null ? '—' : `${avgLatency.toFixed(1)}s` },
  ]

  return (
    <section className="metrics-row" aria-label="Session metrics">
      {metrics.map((metric) => (
        <div className="metric-card" key={metric.label}>
          <div className="metric-label">{metric.label}</div>
          <div className="metric-value">{metric.value}</div>
        </div>
      ))}
    </section>
  )
}
