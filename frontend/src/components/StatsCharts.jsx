import { useEffect, useId, useState } from 'react'

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
const VOLUME_CHART_WIDTH = 640
const VOLUME_CHART_HEIGHT = 220
const VOLUME_CHART_PADDING = { top: 16, right: 16, bottom: 48, left: 34 }

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

function formatDateLabel(date) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(
    new Date(`${date}T00:00:00`),
  )
}

function catmullRomToBezierPath(points) {
  if (points.length === 0) return ''

  let path = `M ${points[0].x} ${points[0].y}`

  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(0, index - 1)]
    const p1 = points[index]
    const p2 = points[index + 1]
    const p3 = points[Math.min(points.length - 1, index + 2)]
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6

    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`
  }

  return path
}

function DailyVolumeChart({ dailyVolume }) {
  const gradientId = `daily-volume-gradient-${useId().replaceAll(':', '')}`
  const [hoveredIndex, setHoveredIndex] = useState(null)
  const points = Array.isArray(dailyVolume)
    ? dailyVolume.map((entry) => ({
        date: entry.date,
        count: Number.isFinite(entry.count) ? entry.count : 0,
      }))
    : []

  const maxCount = points.length > 0 ? Math.max(...points.map((point) => point.count)) : 0

  if (points.length < 2 || maxCount === 0) {
    return (
      <section className="stats-chart stats-daily-volume-chart" aria-label="Daily job volume">
        <h2>Daily job volume</h2>
        <div className="stats-chart-empty">Not enough data yet</div>
      </section>
    )
  }

  const plotWidth = VOLUME_CHART_WIDTH - VOLUME_CHART_PADDING.left - VOLUME_CHART_PADDING.right
  const plotHeight = VOLUME_CHART_HEIGHT - VOLUME_CHART_PADDING.top - VOLUME_CHART_PADDING.bottom
  const baseline = VOLUME_CHART_HEIGHT - VOLUME_CHART_PADDING.bottom
  const coordinates = points.map((point, index) => ({
    ...point,
    x: VOLUME_CHART_PADDING.left + (index / (points.length - 1)) * plotWidth,
    y: baseline - (point.count / maxCount) * plotHeight,
  }))
  const linePath = catmullRomToBezierPath(coordinates)
  const areaPath = `${linePath} L ${coordinates.at(-1).x} ${baseline} L ${coordinates[0].x} ${baseline} Z`
  const gridLines = Array.from({ length: 4 }, (_, index) => {
    const value = (maxCount * index) / 3
    return {
      value: Math.round(value),
      y: baseline - (value / maxCount) * plotHeight,
    }
  }).reverse()
  const hoveredPoint = hoveredIndex === null ? null : coordinates[hoveredIndex]

  function handleMouseMove(event) {
    const bounds = event.currentTarget.getBoundingClientRect()
    const pointerX = ((event.clientX - bounds.left) / bounds.width) * VOLUME_CHART_WIDTH
    const nearestIndex = coordinates.reduce(
      (nearest, point, index) =>
        Math.abs(point.x - pointerX) < Math.abs(coordinates[nearest].x - pointerX) ? index : nearest,
      0,
    )

    setHoveredIndex(nearestIndex)
  }

  return (
    <section className="stats-chart stats-daily-volume-chart" aria-label="Daily job volume">
      <h2>Daily job volume</h2>
      <svg
        className="stats-volume-chart"
        viewBox={`0 0 ${VOLUME_CHART_WIDTH} ${VOLUME_CHART_HEIGHT}`}
        role="img"
        aria-label={`Daily job volume, from ${points[0].date} to ${points.at(-1).date}`}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredIndex(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {gridLines.map((line) => (
          <g key={line.y}>
            <line
              className="stats-volume-gridline"
              x1={VOLUME_CHART_PADDING.left}
              x2={VOLUME_CHART_WIDTH - VOLUME_CHART_PADDING.right}
              y1={line.y}
              y2={line.y}
            />
            <text className="stats-volume-y-label" x={VOLUME_CHART_PADDING.left - 8} y={line.y + 4} textAnchor="end">
              {line.value}
            </text>
          </g>
        ))}
        <line
          className="stats-volume-axis"
          x1={VOLUME_CHART_PADDING.left}
          x2={VOLUME_CHART_WIDTH - VOLUME_CHART_PADDING.right}
          y1={baseline}
          y2={baseline}
        />
        <path className="stats-volume-area" d={areaPath} fill={`url(#${gradientId})`} />
        <path className="stats-volume-line" d={linePath} />
        {coordinates.map((point) => (
          <g key={point.date}>
            <circle className="stats-volume-point" cx={point.x} cy={point.y} r="3.5" />
            <text
              className="stats-volume-x-label"
              x={point.x}
              y={baseline + 18}
              textAnchor="end"
              transform={`rotate(-35 ${point.x} ${baseline + 18})`}
            >
              {formatDateLabel(point.date)}
            </text>
          </g>
        ))}
        {hoveredPoint && (
          <g className="stats-volume-hover" pointerEvents="none">
            <line
              className="stats-volume-guide"
              x1={hoveredPoint.x}
              x2={hoveredPoint.x}
              y1={VOLUME_CHART_PADDING.top}
              y2={baseline}
            />
            <circle className="stats-volume-hover-point" cx={hoveredPoint.x} cy={hoveredPoint.y} r="6" />
            <g
              className="stats-volume-tooltip"
              transform={`translate(${Math.min(hoveredPoint.x + 10, VOLUME_CHART_WIDTH - 118)} ${Math.max(hoveredPoint.y - 44, VOLUME_CHART_PADDING.top)})`}
            >
              <rect width="108" height="36" rx="6" />
              <text className="stats-volume-tooltip-date" x="8" y="14">
                {hoveredPoint.date}
              </text>
              <text className="stats-volume-tooltip-count" x="8" y="28">
                {hoveredPoint.count} jobs
              </text>
            </g>
          </g>
        )}
      </svg>
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
      <DailyVolumeChart dailyVolume={stats?.dailyVolume} />
      <div className="stats-charts-grid">
        <DonutChart
          title="Outcomes"
          breakdown={stats?.outcomeBreakdown}
          labels={OUTCOME_LABELS}
          colors={OUTCOME_COLORS}
        />
        <DonutChart
          title="Categories"
          breakdown={stats?.categoryBreakdown}
          labels={CATEGORY_LABELS}
          colors={CATEGORY_COLORS}
        />
        <BreakdownChart
          title="Iterations"
          breakdown={stats?.iterationBreakdown}
          labels={ITERATION_LABELS}
        />
      </div>
    </section>
  )
}
