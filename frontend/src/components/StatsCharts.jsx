import { useEffect, useState } from 'react'

import { useCountUp } from '../hooks/useCountUp.js'

const OUTCOME_LABELS = {
  Completed: 'Completed',
  AwaitingReview: 'Awaiting review',
  Failed: 'Failed',
}

const OUTCOME_COLORS = {
  Completed: '#166534',
  AwaitingReview: '#92400e',
  Failed: '#b91c1c',
}

const ITERATION_LABELS = {
  1: '1 iteration',
  2: '2 iterations',
  3: '3 iterations',
  other: '3+ / failed early',
}

const CATEGORY_LABELS = {
  financial: 'Financial',
  legal: 'Legal',
  medical: 'Medical',
  general: 'General',
  uncategorized: 'Uncategorized',
}

function ChartRow({ label, count, total, color }) {
  const [countTarget, setCountTarget] = useState(0)
  const displayedCount = Math.round(useCountUp(countTarget))
  const width = total === 0 ? 0 : (count / total) * 100

  useEffect(() => {
    setCountTarget(count)
  }, [count])

  return (
    <div className="stats-chart-row">
      <div className="stats-chart-label">{label}</div>
      <div className="stats-chart-track" aria-hidden="true">
        <div className="stats-chart-bar" style={{ width: `${width}%`, backgroundColor: color }} />
      </div>
      <div className="stats-chart-count">{displayedCount}</div>
    </div>
  )
}

function BreakdownChart({ title, breakdown, labels, colors, defaultColor = '#2563eb' }) {
  const rows = Array.isArray(breakdown)
    ? breakdown.map((entry) => {
        const key = String(entry.status ?? entry.iterations ?? entry.category)
        return {
          key,
          label: labels[key] ?? key,
          count: Number.isFinite(entry.count) ? entry.count : 0,
          color: colors?.[key] ?? defaultColor,
        }
      })
    : []
  const total = rows.reduce((sum, row) => sum + row.count, 0)

  return (
    <section className="stats-chart" aria-label={title}>
      <h2>{title}</h2>
      {total === 0 ? (
        <div className="stats-chart-empty">No data yet</div>
      ) : (
        <div className="stats-chart-list">
          {rows.map((row) => (
            <ChartRow key={row.key} {...row} total={total} />
          ))}
        </div>
      )}
    </section>
  )
}

export default function StatsCharts() {
  const [stats, setStats] = useState(null)

  useEffect(() => {
    let isCurrent = true

    fetch('http://localhost:5001/api/jobs/stats')
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Stats request failed with ${response.status}`)
        }

        return response.json()
      })
      .then((nextStats) => {
        if (isCurrent) {
          setStats(nextStats)
        }
      })
      .catch(() => {
        if (isCurrent) {
          setStats(null)
        }
      })

    return () => {
      isCurrent = false
    }
  }, [])

  return (
    <section className="stats-charts-card" aria-label="Job statistics">
      <div className="section-heading">
        <span>Job statistics</span>
      </div>
      <div className="stats-charts-grid">
        <BreakdownChart
          title="Outcomes"
          breakdown={stats?.outcomeBreakdown}
          labels={OUTCOME_LABELS}
          colors={OUTCOME_COLORS}
        />
        <BreakdownChart
          title="Iterations"
          breakdown={stats?.iterationBreakdown}
          labels={ITERATION_LABELS}
        />
        <BreakdownChart
          title="Categories"
          breakdown={stats?.categoryBreakdown}
          labels={CATEGORY_LABELS}
        />
      </div>
    </section>
  )
}
