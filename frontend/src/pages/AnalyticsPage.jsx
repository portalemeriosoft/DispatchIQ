import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'

const PIE_COLORS = {
  delivered: '#22c55e',
  sent_pending: '#2962ff',
  spam_filtered: '#f59e0b',
  failed_invalid: '#ef4444',
  locked_opted_out: '#9ca3af',
}

const PIE_LABELS = {
  delivered: 'Delivered',
  sent_pending: 'Sent / Pending',
  spam_filtered: 'Spam Filtered',
  failed_invalid: 'Failed / Invalid',
  locked_opted_out: 'Locked / Opted-Out',
}

function firstError(err) {
  return err?.message || 'Failed to load analytics'
}

export default function AnalyticsPage() {
  const { user } = useAuth()
  const isAgent = user?.role !== 'admin'
  const [summary, setSummary] = useState(null)
  const [trend, setTrend] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [summaryData, trendData] = await Promise.all([
        api('/analytics/summary'),
        api('/analytics/trend?days=14'),
      ])
      setSummary(summaryData)
      setTrend(trendData.trend || [])
    } catch (err) {
      setError(firstError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const pieData = useMemo(() => {
    if (!summary?.ratio) return []
    return Object.entries(summary.ratio)
      .map(([key, value]) => ({
        key,
        name: PIE_LABELS[key] || key,
        value: Number(value) || 0,
      }))
      .filter((d) => d.value > 0)
  }, [summary])

  const cards = [
    {
      key: 'total_sent',
      label: 'Total Sent',
      sub: 'All campaign messages',
      value: summary?.total_sent ?? 0,
    },
    {
      key: 'delivered',
      label: 'Delivered (Normal)',
      sub: 'Confirmed carrier delivery',
      value: summary?.delivered ?? 0,
    },
    {
      key: 'spam_filtered',
      label: 'Spam Filtered',
      sub: 'Carrier error 30007',
      value: summary?.spam_filtered ?? 0,
    },
    {
      key: 'failed_invalid',
      label: 'Failed / Invalid',
      sub: 'Landline / error 21614',
      value: summary?.failed_invalid ?? 0,
    },
    {
      key: 'locked_opted_out',
      label: 'Locked / Opted-Out',
      sub: `Blacklist total: ${summary?.locked_opted_out ?? 0}`,
      value: summary?.locked_opted_out ?? 0,
    },
  ]

  return (
    <div className="page">
      <div className="page-header row">
        <div>
          <h1>Delivery Analytics Dashboard</h1>
          <p className="muted">
            {isAgent
              ? 'Your SMS dispatch performance — only campaigns and messages you sent.'
              : 'Real-time SMS dispatch performance and carrier error diagnostics.'}
          </p>
        </div>
        <button type="button" className="btn" onClick={loadData} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh Data'}
        </button>
      </div>

      {error ? <div className="alert error">{error}</div> : null}

      <div className="analytics-cards">
        {cards.map((card) => (
          <article key={card.key} className="analytics-card">
            <div className="muted small">{card.label}</div>
            <div className="analytics-value">{loading && !summary ? '—' : card.value}</div>
            <div className="muted small">{card.sub}</div>
          </article>
        ))}
      </div>

      <div className="analytics-charts">
        <section className="chart-panel">
          <div className="pane-header">
            <strong>Carrier Status Ratio</strong>
            <span className="muted small">Distribution</span>
          </div>
          <div className="chart-body">
            {pieData.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon chart" aria-hidden="true" />
                <strong>No delivery data yet</strong>
                <span>Send a campaign or live message to populate this chart.</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={95}
                    paddingAngle={2}
                  >
                    {pieData.map((entry) => (
                      <Cell key={entry.key} fill={PIE_COLORS[entry.key] || '#2f80ed'} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className="chart-panel">
          <div className="pane-header">
            <strong>Daily Delivery Volume & Status Trend</strong>
            <span className="muted small">Historical Timeline</span>
          </div>
          <div className="chart-body">
            {trend.every((d) => d.total === 0) ? (
              <div className="empty-state">
                <span className="empty-icon chart" aria-hidden="true" />
                <strong>No trend data</strong>
                <span>Volume over the last 14 days will appear here.</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.16)" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v) => String(v).slice(5)}
                    stroke="#94a3b8"
                    fontSize={12}
                  />
                  <YAxis allowDecimals={false} stroke="#94a3b8" fontSize={12} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="delivered" stackId="a" fill={PIE_COLORS.delivered} name="Delivered" />
                  <Bar dataKey="pending" stackId="a" fill={PIE_COLORS.sent_pending} name="Pending" />
                  <Bar dataKey="spam" stackId="a" fill={PIE_COLORS.spam_filtered} name="Spam" />
                  <Bar dataKey="failed" stackId="a" fill={PIE_COLORS.failed_invalid} name="Failed" />
                  <Bar dataKey="locked" stackId="a" fill={PIE_COLORS.locked_opted_out} name="Locked" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
