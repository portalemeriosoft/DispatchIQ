import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { api } from '../api/client'

const COUNTRY_OPTIONS = [
  { value: '+61', label: 'AU Australia (+61)' },
  { value: '+1', label: 'US / CA (+1)' },
  { value: '+44', label: 'UK (+44)' },
  { value: '+92', label: 'PK Pakistan (+92)' },
  { value: '+966', label: 'SA Saudi Arabia (+966)' },
  { value: '+971', label: 'AE UAE (+971)' },
]

export default function SettingsPage() {
  const { refreshCarrier } = useOutletContext() || {}
  const [form, setForm] = useState({
    provider: 'twilio',
    twilio_account_sid: '',
    twilio_auth_token: '',
    sender_number: '',
    default_country_code: '+61',
  })
  const [showSid, setShowSid] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    api('/settings')
      .then((data) => {
        if (cancelled) return
        setForm({
          provider: data.provider || 'twilio',
          twilio_account_sid: data.twilio_account_sid || '',
          twilio_auth_token: data.twilio_auth_token || '',
          sender_number: data.sender_number || '',
          default_country_code: data.default_country_code || '+61',
        })
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load settings')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function onSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const data = await api('/settings', {
        method: 'PUT',
        body: form,
      })
      setMessage(data.message || 'Settings saved.')
      if (data.settings) {
        setForm({
          provider: data.settings.provider || 'twilio',
          twilio_account_sid: data.settings.twilio_account_sid || '',
          twilio_auth_token: data.settings.twilio_auth_token || '',
          sender_number: data.settings.sender_number || '',
          default_country_code: data.settings.default_country_code || '+61',
        })
        if (refreshCarrier) {
          const provider = (data.settings.provider || 'twilio').toUpperCase()
          const region = data.settings.default_country_code || ''
          refreshCarrier({
            label: `Carrier: ${provider}${region ? ` ${region}` : ''}`,
            region,
          })
        }
      }
    } catch (err) {
      const errors = err.data?.errors
      if (errors) {
        const first = Object.values(errors).flat()[0]
        setError(first || err.message)
      } else {
        setError(err.message || 'Save failed')
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="loading-state">Loading settings…</p>

  return (
    <div className="page">
      <div className="page-header">
        <h1>Dynamic Settings</h1>
        <p className="muted">
          Carrier credentials are stored encrypted and applied per API request. Saving validates the number with Twilio and sets the SMS webhook.
        </p>
      </div>

      {message ? <div className="alert success">{message}</div> : null}
      {error ? <div className="alert error">{error}</div> : null}

      <form className="settings-form" onSubmit={onSubmit}>
        <label>
          SMS Provider
          <select value={form.provider} onChange={(e) => updateField('provider', e.target.value)}>
            <option value="twilio">Twilio Telephony Platform</option>
          </select>
        </label>

        <label>
          Account SID / API Key / Service Plan ID
          <div className="secret-field">
            <input
              type={showSid ? 'text' : 'password'}
              value={form.twilio_account_sid}
              onChange={(e) => updateField('twilio_account_sid', e.target.value)}
              autoComplete="off"
              required
            />
            <button type="button" className="btn ghost" onClick={() => setShowSid((v) => !v)}>
              {showSid ? 'Hide' : 'Show'}
            </button>
          </div>
        </label>

        <label>
          Auth Token / Secret Key
          <div className="secret-field">
            <input
              type={showToken ? 'text' : 'password'}
              value={form.twilio_auth_token}
              onChange={(e) => updateField('twilio_auth_token', e.target.value)}
              autoComplete="off"
              placeholder="Leave masked value to keep existing token"
            />
            <button type="button" className="btn ghost" onClick={() => setShowToken((v) => !v)}>
              {showToken ? 'Hide' : 'Show'}
            </button>
          </div>
        </label>

        <label>
          Active Sender Phone Number / Dedicated ID
          <input
            type="text"
            value={form.sender_number}
            onChange={(e) => updateField('sender_number', e.target.value)}
            placeholder="+61412345678"
            required
          />
          <span className="help">Must include international E.164 country prefix (+61, +92, +1, +966).</span>
        </label>

        <label>
          Default Country Region Prefix
          <select
            value={form.default_country_code}
            onChange={(e) => updateField('default_country_code', e.target.value)}
            required
          >
            {COUNTRY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <span className="help">Auto-appended to local numbers missing international code.</span>
        </label>

        <button className="btn primary" type="submit" disabled={saving}>
          {saving ? 'Validating with Twilio…' : 'Save Settings'}
        </button>
      </form>
    </div>
  )
}
