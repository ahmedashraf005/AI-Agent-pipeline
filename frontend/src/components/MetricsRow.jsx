export default function MetricsRow({ jobsToday, cacheHitRate, avgLatency }) {
  const metrics = [
    { label: 'Jobs today', value: jobsToday },
    { label: 'Cache hit rate', value: `${cacheHitRate}%` },
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
