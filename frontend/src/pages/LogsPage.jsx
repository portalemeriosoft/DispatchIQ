import { useCallback, useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'

function firstError(err) {
  const errors = err?.data?.errors
  if (errors) return Object.values(errors).flat()[0]
  return err?.message || 'Something went wrong'
}

function formatTime(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

function previewBody(body) {
  if (!body) return '—'
  return body.length > 80 ? `${body.slice(0, 80)}…` : body
}

function statusMeta(log) {
  if (log.is_blacklisted || log.carrier_status === 'blacklisted') {
    return { label: 'Locked / Blacklisted', className: 'status-locked' }
  }

  const status = String(log.carrier_status || '').toLowerCase()

  if (status === 'delivered') {
    return { label: 'Delivered (Normal)', className: 'status-delivered' }
  }

  if (['queued', 'accepted', 'sending', 'sent', 'scheduled', 'pending'].includes(status)) {
    return { label: 'Sent / Pending', className: 'status-pending' }
  }

  if (['failed', 'undelivered', 'canceled', 'cancelled'].includes(status) || log.error_code) {
    return { label: 'Invalid / Landline', className: 'status-failed' }
  }

  if (status === 'unlocked') {
    return { label: 'Unlocked', className: 'status-pending' }
  }

  return { label: log.carrier_status || 'Unknown', className: 'status-pending' }
}

function diagnosticText(log) {
  if (log.is_blacklisted || log.carrier_status === 'blacklisted') {
    return log.error_code
      ? `Err #${log.error_code} Locked / Blacklisted`
      : 'Locked / Blacklisted'
  }
  if (log.error_code) {
    return `Err #${log.error_code} Carrier Error`
  }
  if (!log.carrier_status || ['delivered', 'sent', 'queued'].includes(String(log.carrier_status).toLowerCase())) {
    return 'None (OK)'
  }
  return String(log.carrier_status)
}

export default function LogsPage() {
  const { user } = useAuth()
  const { availableNumbers: contextNumbers = [] } = useOutletContext() || {}
  const isAdmin = user?.role === 'admin'
  const [logs, setLogs] = useState([])
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 })
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [status, setStatus] = useState('')
  const [numberFilter, setNumberFilter] = useState('')
  const availableNumbers = contextNumbers
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [confirmAction, setConfirmAction] = useState(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, status, numberFilter])

  const loadLogs = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ page: String(page), per_page: '25' })
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (status) params.set('status', status)
      if (numberFilter) params.set('twilio_number_id', numberFilter)
      const data = await api(`/logs?${params}`)
      setLogs(data.data || [])
      setMeta({
        current_page: data.current_page || 1,
        last_page: data.last_page || 1,
        total: data.total || 0,
      })
    } catch (err) {
      setError(firstError(err))
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [page, debouncedSearch, status, numberFilter])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  async function confirmModal() {
    if (!confirmAction) return
    setConfirming(true)
    setError('')
    try {
      if (confirmAction.type === 'clear') {
        await api('/logs', { method: 'DELETE' })
      } else if (confirmAction.type === 'delete' && confirmAction.log) {
        setBusyId(confirmAction.log.id)
        await api(`/logs/${confirmAction.log.id}`, { method: 'DELETE' })
      }
      setConfirmAction(null)
      await loadLogs()
    } catch (err) {
      setError(firstError(err))
    } finally {
      setConfirming(false)
      setBusyId(null)
    }
  }

  async function toggleBlacklist(log) {
    const locked = log.is_blacklisted || log.carrier_status === 'blacklisted'
    setBusyId(log.id)
    setError('')
    try {
      await api(`/logs/${log.id}/${locked ? 'unblacklist' : 'blacklist'}`, { method: 'POST' })
      await loadLogs()
    } catch (err) {
      setError(firstError(err))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="page">
      <div className="page-header row">
        <div>
          <h1>Master Delivery Logs</h1>
          <p className="muted">
            {isAdmin
              ? 'Audit recipient status, carrier diagnostics, blacklist lock, and log management.'
              : 'Delivery logs for Twilio numbers assigned to you.'}
          </p>
        </div>
      </div>

      <div className="toolbar">
        <input
          className="search-input"
          type="search"
          placeholder="Search by phone number, message body, or message ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="filter-select"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="STATUS FILTER"
        >
          <option value="">All Statuses</option>
          <option value="delivered">Delivered</option>
          <option value="sent_pending">Sent / Pending</option>
          <option value="failed_invalid">Failed / Invalid</option>
          <option value="blacklisted">Locked / Blacklisted</option>
        </select>
        {availableNumbers.length > 0 ? (
          <select
            className="filter-select"
            value={numberFilter}
            onChange={(e) => setNumberFilter(e.target.value)}
            aria-label="NUMBER FILTER"
          >
            <option value="">All Numbers</option>
            {availableNumbers.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label || n.friendly_name || n.phone_number}
              </option>
            ))}
          </select>
        ) : null}
        <button type="button" className="btn ghost" onClick={loadLogs} title="Refresh">
          Refresh
        </button>
        <span className="count-pill">Total Records: {meta.total}</span>
        {isAdmin ? (
          <button type="button" className="btn danger-btn" onClick={() => setConfirmAction({ type: 'clear' })}>
            Clear All Logs
          </button>
        ) : null}
      </div>

      {error ? <div className="alert error">{error}</div> : null}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Our Number</th>
              <th>Recipient Number</th>
              <th>Message Preview</th>
              <th>Carrier Status</th>
              <th>Error Code &amp; Diagnostic</th>
              <th>Timestamp</th>
              <th className="col-actions">Blacklist</th>
              <th className="col-actions">Delete</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8}>
                  <span className="loading-state">Loading logs…</span>
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={8} className="td-empty">
                  <div className="empty-state">
                    <span className="empty-icon list" aria-hidden="true" />
                    <strong>No delivery logs yet</strong>
                    <span>Outbound SMS from Live Chat or Dispatcher will show up here.</span>
                  </div>
                </td>
              </tr>
            ) : (
              logs.map((log) => {
                const metaStatus = statusMeta(log)
                const locked = log.is_blacklisted || log.carrier_status === 'blacklisted'
                const line =
                  log.twilio_number?.friendly_name ||
                  log.twilio_number?.phone_number ||
                  '—'
                return (
                  <tr key={log.id}>
                    <td>
                      <span className="line-badge compact">{line}</span>
                    </td>
                    <td className="mono">{log.recipient_number}</td>
                    <td>{previewBody(log.message_body)}</td>
                    <td>
                      <span className={`badge ${metaStatus.className}`}>{metaStatus.label}</span>
                    </td>
                    <td className="muted">{diagnosticText(log)}</td>
                    <td>{formatTime(log.created_at)}</td>
                    <td className="col-actions">
                      <button
                        type="button"
                        className={`btn ${locked ? 'unlock-btn' : 'lock-btn'}`}
                        disabled={busyId === log.id}
                        onClick={() => toggleBlacklist(log)}
                      >
                        {locked ? 'Unlock' : 'Lock'}
                      </button>
                    </td>
                    <td className="col-actions">
                      <button
                        type="button"
                        className="icon-btn danger"
                        disabled={busyId === log.id}
                        onClick={() => setConfirmAction({ type: 'delete', log })}
                        title="Delete"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <span className="muted">
          Showing Page {meta.current_page} of {meta.last_page} ({meta.total} total)
        </span>
        <div className="pagination-controls">
          <button
            type="button"
            className="btn ghost"
            disabled={meta.current_page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ←
          </button>
          <button
            type="button"
            className="btn ghost"
            disabled={meta.current_page >= meta.last_page || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            →
          </button>
        </div>
      </div>

      {confirmAction ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => !confirming && setConfirmAction(null)}
        >
          <div className="modal modal-sm" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{confirmAction.type === 'clear' ? 'Clear All Logs' : 'Delete Log'}</h2>
              <button
                type="button"
                className="icon-btn"
                disabled={confirming}
                onClick={() => setConfirmAction(null)}
              >
                ✕
              </button>
            </div>
            <p className="muted" style={{ margin: '0 0 1rem' }}>
              {confirmAction.type === 'clear' ? (
                <>Clear <strong>ALL</strong> delivery logs? This cannot be undone.</>
              ) : (
                <>
                  Delete log for{' '}
                  <strong className="mono">{confirmAction.log?.recipient_number}</strong>? This cannot be
                  undone.
                </>
              )}
            </p>
            <div className="modal-actions">
              <button type="button" className="btn" disabled={confirming} onClick={() => setConfirmAction(null)}>
                Cancel
              </button>
              <button type="button" className="btn danger-btn" disabled={confirming} onClick={confirmModal}>
                {confirming
                  ? confirmAction.type === 'clear'
                    ? 'Clearing…'
                    : 'Deleting…'
                  : confirmAction.type === 'clear'
                    ? 'Clear All'
                    : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
