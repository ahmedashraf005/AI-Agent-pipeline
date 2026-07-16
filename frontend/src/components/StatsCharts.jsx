import { useEffect, useState } from 'react'

import { useCountUp } from '../hooks/useCountUp.js'

const OUTCOME_LABELS = {
  Completed: 'Completed',
  AwaitingReview: 'Awaiting review',
  Failed: 'Failed',
}

const OUTCOME_COLORS = {
  Completed: { color: '#166534', opacity: 1 },
  AwaitingReview: { color: '#92400e', opacity: 1 },
  Failed: { color: '#b91c1c', opacity: 1 },
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

const CATEGORY_COLORS = {
  financial: { color: 'var(--accent)', opacity: 1 },
  legal: { color: 'var(--accent)', opacity: 0.8 },
  medical: { color: 'var(--accent)', opacity: 0.62 },
  general: { color: 'var(--accent)', opacity: 0.44 },
  uncategorized: { color: 'var(--accent)', opacity: 0.26 },
}

const DONUT_SIZE = 128
const DONUT_CENTER = DONUT_SIZE / 2
const DONUT_RADIUS = 52
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS

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

function DonutChart({ title, breakdown, labels, colors }) {
  const rows = Array.isArray(breakdown)
    ? breakdown.map((entry) => {
        const key = String(entry.status ?? entry.category)
        const color = colors[key] ?? { color: 'var(--accent)', opacity: 1 }

        return {
          key,
          label: labels[key] ?? key,
          count: Number.isFinite(entry.count) ? entry.count : 0,
          color: color.color,
          opacity: color.opacity,
        }
      })
    : []
  const total = rows.reduce((sum, row) => sum + row.count, 0)
  const displayedTotal = Math.round(useCountUp(total))
  const gap = total === 0 ? 0 : 2
  const usableCircumference = Math.max(0, DONUT_CIRCUMFERENCE - gap * rows.length)
  let offset = 0
  const segments = rows.map((row) => {
    const length = total === 0 ? 0 : (row.count / total) * usableCircumference
    const segment = { ...row, length, offset }
    offset += length + gap
    return segment
  })

  return (
    <section className="stats-chart" aria-label={title}>
      <h2>{title}</h2>
      <div className="stats-donut-layout">
        <svg
          className="stats-donut"
          viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`}
          role="img"
          aria-label={total === 0 ? `${title}: no data yet` : `${title}: ${total}`}
        >
          <circle
            className="stats-donut-ring"
            cx={DONUT_CENTER}
            cy={DONUT_CENTER}
            r={DONUT_RADIUS}
          />
          {segments.map(
            (segment) =>
              segment.length > 0 && (
                <circle
                  key={segment.key}
                  className="stats-donut-segment"
                  cx={DONUT_CENTER}
                  cy={DONUT_CENTER}
                  r={DONUT_RADIUS}
                  stroke={segment.color}
                  strokeOpacity={segment.opacity}
                  strokeDasharray={`${segment.length} ${DONUT_CIRCUMFERENCE - segment.length}`}
                  strokeDashoffset={-segment.offset}
                />
              ),
          )}
          <text className="stats-donut-total" x={DONUT_CENTER} y={DONUT_CENTER} textAnchor="middle">
            {total === 0 ? 'No data yet' : displayedTotal}
          </text>
        </svg>
        <div className="stats-donut-legend">
          {rows.map((row) => (
            <div className="stats-donut-legend-row" key={row.key}>
              <span
                className="stats-donut-swatch"
                style={{ backgroundColor: row.color, opacity: row.opacity }}
                aria-hidden="true"
              />
              <span className="stats-chart-label">{row.label}</span>
              <span className="stats-chart-count">{row.count}</span>
            </div>
          ))}
        </div>
      </div>
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
        <DonutChart
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
        <DonutChart
          title="Categories"
          breakdown={stats?.categoryBreakdown}
          labels={CATEGORY_LABELS}
          colors={CATEGORY_COLORS}
        />
      </div>
    </section>
  )
}
