import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { api } from '../api/client'

const THROTTLE_OPTIONS = [
  { value: 500, label: 'Slow Speed (500ms delay per msg)' },
  { value: 100, label: 'Normal Speed (100ms delay per msg - Recommended)' },
  { value: 50, label: 'Fast Speed (50ms delay per msg)' },
]

const SAMPLE_CSV = `phone_number,name
+61412345678,Jane Example
0412987654,Local AU Number
+923001234567,Tariq Mahmood
`

function firstError(err) {
  const errors = err?.data?.errors
  if (errors) return Object.values(errors).flat()[0]
  return err?.message || 'Something went wrong'
}

function splitRecipients(text) {
  return String(text || '')
    .split(/[\s,;]+/)
    .map((v) => v.trim())
    .filter(Boolean)
}

function parseCsvText(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length === 0) return []

  const first = lines[0].toLowerCase()
  const hasHeader = first.includes('phone')
  const rows = hasHeader ? lines.slice(1) : lines

  return rows
    .map((line) => {
      const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
      return cols[0] || ''
    })
    .filter(Boolean)
}

export default function DispatcherPage() {
  const {
    availableNumbers: contextNumbers = [],
    requiresNumberSelector: contextRequiresSelector = false,
    defaultTwilioNumberId = null,
  } = useOutletContext() || {}

  const [tab, setTab] = useState('paste')
  const [name, setName] = useState('')
  const [body, setBody] = useState('')
  const [throttle, setThrottle] = useState(100)
  const [scheduledAt, setScheduledAt] = useState('')
  const [pasteNumbers, setPasteNumbers] = useState('')
  const [singleNumber, setSingleNumber] = useState('')
  const [csvRecipients, setCsvRecipients] = useState([])
  const [csvFileName, setCsvFileName] = useState('')
  const [defaultPrefix, setDefaultPrefix] = useState('+61')
  const [selectedNumberId, setSelectedNumberId] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const availableNumbers = contextNumbers
  const requiresNumberSelector = contextRequiresSelector || availableNumbers.length > 1

  useEffect(() => {
    api('/settings')
      .then((s) => setDefaultPrefix(s.default_country_code || '+61'))
      .catch((err) => setError(firstError(err)))
  }, [])

  useEffect(() => {
    setSelectedNumberId((prev) => {
      if (prev && availableNumbers.some((n) => String(n.id) === String(prev))) return prev
      const fallback = defaultTwilioNumberId || availableNumbers[0]?.id
      return fallback ? String(fallback) : ''
    })
  }, [availableNumbers, defaultTwilioNumberId])

  const recipientCount = useMemo(() => {
    if (tab === 'paste') return splitRecipients(pasteNumbers).length
    if (tab === 'csv') return csvRecipients.length
    return singleNumber.trim() ? 1 : 0
  }, [tab, pasteNumbers, csvRecipients, singleNumber])

  function downloadSampleCsv() {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'dispatchiq-sample-recipients.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function onCsvSelected(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvFileName(file.name)
    const reader = new FileReader()
    reader.onload = () => {
      setCsvRecipients(parseCsvText(String(reader.result || '')))
    }
    reader.readAsText(file)
  }

  async function onSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setMessage('')
    setError('')

    let recipients = []
    if (tab === 'paste') recipients = splitRecipients(pasteNumbers)
    if (tab === 'csv') recipients = csvRecipients
    if (tab === 'single') recipients = singleNumber.trim() ? [singleNumber.trim()] : []

    if (!body.trim()) {
      setError('Message body is required.')
      setBusy(false)
      return
    }
    if (recipients.length === 0) {
      setError('Add at least one recipient.')
      setBusy(false)
      return
    }
    if (requiresNumberSelector && !selectedNumberId) {
      setError('Select which Twilio number to send from.')
      setBusy(false)
      return
    }
    if (availableNumbers.length === 0) {
      setError('No Twilio numbers available. Ask an admin to assign a number.')
      setBusy(false)
      return
    }

    const payload = {
      mode: tab,
      name: name.trim() || null,
      body: body.trim(),
      recipients,
      throttle_delay_ms: tab === 'single' ? 0 : Number(throttle),
      scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      twilio_number_id: Number(selectedNumberId || availableNumbers[0]?.id),
    }

    try {
      const data = await api('/campaigns', { method: 'POST', body: payload })
      setMessage(
        `${data.message} Normalized recipients: ${data.recipients_normalized}. Campaign #${data.campaign?.id} (${data.campaign?.status}).`,
      )
      if (tab === 'paste') setPasteNumbers('')
      if (tab === 'csv') {
        setCsvRecipients([])
        setCsvFileName('')
      }
      if (tab === 'single') setSingleNumber('')
      setName('')
      setScheduledAt('')
    } catch (err) {
      setError(firstError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>SMS Dispatcher Engine</h1>
        <p className="muted">Single SMS & CSV bulk campaign rate-limited queue dispatcher.</p>
      </div>

      {message ? <div className="alert success">{message}</div> : null}
      {error ? <div className="alert error">{error}</div> : null}

      <div className="dispatcher-tabs">
        <button type="button" className={tab === 'paste' ? 'active' : ''} onClick={() => setTab('paste')}>
          1. Paste Multiple Numbers (Bulk)
        </button>
        <button type="button" className={tab === 'csv' ? 'active' : ''} onClick={() => setTab('csv')}>
          2. CSV File Upload (Bulk)
        </button>
        <button type="button" className={tab === 'single' ? 'active' : ''} onClick={() => setTab('single')}>
          3. Single SMS Dispatch
        </button>
        <button type="button" className="btn ghost sample-btn" onClick={downloadSampleCsv}>
          Download Sample CSV Template
        </button>
      </div>

      <form className="dispatcher-form" onSubmit={onSubmit}>
        <label>
          Campaign Name (Optional)
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Weekly Promo Flash Sale #1"
          />
        </label>

        {tab !== 'single' ? (
          <label>
            Queue Throttle Speed Delay
            <select value={throttle} onChange={(e) => setThrottle(Number(e.target.value))}>
              {THROTTLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label>
          Message Body
          <textarea
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write the SMS message to dispatch..."
            required
          />
        </label>

        {requiresNumberSelector ? (
          <label>
            Send From Number
            <select
              value={selectedNumberId}
              onChange={(e) => setSelectedNumberId(e.target.value)}
              required
            >
              {availableNumbers.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label || n.friendly_name || n.phone_number}
                </option>
              ))}
            </select>
            <span className="help">Choose which of your Twilio lines this campaign sends from.</span>
          </label>
        ) : availableNumbers.length === 1 ? (
          <p className="muted">
            Sending from <span className="line-badge">{availableNumbers[0].label || availableNumbers[0].phone_number}</span>
          </p>
        ) : null}

        <label>
          Schedule Send At (Optional)
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
        </label>

        {tab === 'paste' ? (
          <label>
            Recipient Phone Numbers
            <textarea
              rows={8}
              value={pasteNumbers}
              onChange={(e) => setPasteNumbers(e.target.value)}
              placeholder={'+61412345678\n0412987654\n+923001234567'}
              required
            />
            <div className="recipient-meta">
              <span className="count-pill">Recipients Count: {recipientCount}</span>
              <span className="help">
                Auto-formats missing country prefixes to default region {defaultPrefix}.
              </span>
            </div>
          </label>
        ) : null}

        {tab === 'csv' ? (
          <div className="csv-block">
            <label>
              Upload CSV
              <input type="file" accept=".csv,text/csv" onChange={onCsvSelected} />
            </label>
            {csvFileName ? <p className="muted">Selected: {csvFileName}</p> : null}
            <div className="recipient-meta">
              <span className="count-pill">Recipients Count: {recipientCount}</span>
              <span className="help">
                CSV should include a phone_number column. Local numbers use default region {defaultPrefix}.
              </span>
            </div>
            {csvRecipients.length > 0 ? (
              <pre className="csv-preview">{csvRecipients.slice(0, 8).join('\n')}{csvRecipients.length > 8 ? '\n…' : ''}</pre>
            ) : null}
          </div>
        ) : null}

        {tab === 'single' ? (
          <label>
            Recipient Phone Number
            <input
              value={singleNumber}
              onChange={(e) => setSingleNumber(e.target.value)}
              placeholder="+61412345678 or 0412345678"
              required
            />
            <div className="recipient-meta">
              <span className="count-pill">Recipients Count: {recipientCount}</span>
              <span className="help">Missing country code → default region {defaultPrefix}.</span>
            </div>
          </label>
        ) : null}

        <button type="submit" className="btn primary" disabled={busy || recipientCount === 0}>
          {busy ? 'Queueing…' : scheduledAt ? 'Schedule Campaign' : 'Queue Campaign Dispatch'}
        </button>
      </form>
    </div>
  )
}
