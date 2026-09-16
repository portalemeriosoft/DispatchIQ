import { useCallback, useEffect, useState } from 'react'
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

function firstError(err) {
  const errors = err?.data?.errors
  if (errors) return Object.values(errors).flat()[0]
  return err?.message || 'Something went wrong'
}

const EMPTY_ACCOUNT = {
  label: '',
  account_sid: '',
  auth_token: '',
  phone_number: '',
  friendly_name: '',
  agent_ids: [],
}

export default function SettingsPage() {
  const { refreshCarrier, refreshAssignedNumbers } = useOutletContext() || {}
  const [provider, setProvider] = useState('twilio')
  const [defaultCountryCode, setDefaultCountryCode] = useState('+61')
  const [accounts, setAccounts] = useState([])
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingGeneral, setSavingGeneral] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const [showAddAccount, setShowAddAccount] = useState(false)
  const [accountForm, setAccountForm] = useState(EMPTY_ACCOUNT)
  const [savingAccount, setSavingAccount] = useState(false)
  const [accountError, setAccountError] = useState('')

  const [addNumberFor, setAddNumberFor] = useState(null)
  const [numberForm, setNumberForm] = useState({ phone_number: '', friendly_name: '', agent_ids: [] })
  const [savingNumber, setSavingNumber] = useState(false)
  const [numberError, setNumberError] = useState('')

  const [editNicknameFor, setEditNicknameFor] = useState(null)
  const [nicknameDraft, setNicknameDraft] = useState('')
  const [nicknameError, setNicknameError] = useState('')
  const [savingNickname, setSavingNickname] = useState(false)

  const [busyKey, setBusyKey] = useState(null)

  const loadInventory = useCallback(async () => {
    const data = await api('/twilio/accounts')
    setAccounts(data.accounts || [])
    setAgents(data.agents || [])
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [settings, inventory] = await Promise.all([
          api('/settings'),
          api('/twilio/accounts'),
        ])
        if (cancelled) return
        setProvider(settings.provider || 'twilio')
        setDefaultCountryCode(settings.default_country_code || '+61')
        setAccounts(inventory.accounts || [])
        setAgents(inventory.agents || [])
      } catch (err) {
        if (!cancelled) setError(firstError(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function saveGeneral(e) {
    e.preventDefault()
    setSavingGeneral(true)
    setMessage('')
    setError('')
    try {
      const data = await api('/settings', {
        method: 'PUT',
        body: { provider, default_country_code: defaultCountryCode },
      })
      setMessage(data.message || 'Settings saved.')
      if (refreshCarrier && data.settings) {
        const p = (data.settings.provider || 'twilio').toUpperCase()
        const region = data.settings.default_country_code || ''
        refreshCarrier({
          label: `Carrier: ${p}${region ? ` ${region}` : ''}`,
          region,
        })
      }
    } catch (err) {
      setError(firstError(err))
    } finally {
      setSavingGeneral(false)
    }
  }

  async function createAccount(e) {
    e.preventDefault()
    setSavingAccount(true)
    setAccountError('')
    setMessage('')
    try {
      const data = await api('/twilio/accounts', {
        method: 'POST',
        body: accountForm,
      })
      setMessage(data.message || 'Account added.')
      setShowAddAccount(false)
      setAccountForm(EMPTY_ACCOUNT)
      await loadInventory()
      refreshAssignedNumbers?.()
    } catch (err) {
      setAccountError(firstError(err))
    } finally {
      setSavingAccount(false)
    }
  }

  async function createNumber(e) {
    e.preventDefault()
    if (!addNumberFor) return
    setSavingNumber(true)
    setNumberError('')
    setMessage('')
    try {
      const data = await api(`/twilio/accounts/${addNumberFor}/numbers`, {
        method: 'POST',
        body: numberForm,
      })
      setMessage(data.message || 'Number added.')
      setAddNumberFor(null)
      setNumberForm({ phone_number: '', friendly_name: '', agent_ids: [] })
      await loadInventory()
      refreshAssignedNumbers?.()
    } catch (err) {
      setNumberError(firstError(err))
    } finally {
      setSavingNumber(false)
    }
  }

  async function saveNumberAgents(number, agentIds) {
    setBusyKey(`agents-${number.id}`)
    setError('')
    setMessage('')
    try {
      await api(`/twilio/numbers/${number.id}`, {
        method: 'PUT',
        body: { agent_ids: agentIds },
      })
      setMessage(`Assignments updated for ${number.friendly_name || number.phone_number}.`)
      await loadInventory()
      refreshAssignedNumbers?.()
    } catch (err) {
      setError(firstError(err))
    } finally {
      setBusyKey(null)
    }
  }

  async function saveFriendlyName(e) {
    e?.preventDefault()
    if (!editNicknameFor) return
    setSavingNickname(true)
    setNicknameError('')
    setError('')
    try {
      const next = nicknameDraft.trim() || editNicknameFor.phone_number
      await api(`/twilio/numbers/${editNicknameFor.id}`, {
        method: 'PUT',
        body: { friendly_name: next },
      })
      setMessage(`Nickname updated for ${editNicknameFor.phone_number}.`)
      setEditNicknameFor(null)
      setNicknameDraft('')
      await loadInventory()
    } catch (err) {
      setNicknameError(firstError(err))
    } finally {
      setSavingNickname(false)
    }
  }

  function openNicknameModal(number) {
    setEditNicknameFor(number)
    setNicknameDraft(number.friendly_name || '')
    setNicknameError('')
  }

  function closeNicknameModal() {
    if (savingNickname) return
    setEditNicknameFor(null)
    setNicknameDraft('')
    setNicknameError('')
  }

  async function reconfigureWebhook(number) {
    setBusyKey(`hook-${number.id}`)
    setError('')
    setMessage('')
    try {
      const data = await api(`/twilio/numbers/${number.id}`, {
        method: 'PUT',
        body: { reconfigure_webhook: true },
      })
      setMessage(data.webhook_configured ? 'Webhook reconfigured.' : 'Webhook skipped (APP_URL not public).')
      await loadInventory()
    } catch (err) {
      setError(firstError(err))
    } finally {
      setBusyKey(null)
    }
  }

  async function removeNumber(number) {
    if (!window.confirm(`Remove ${number.phone_number}?`)) return
    setBusyKey(`del-n-${number.id}`)
    setError('')
    try {
      await api(`/twilio/numbers/${number.id}`, { method: 'DELETE' })
      setMessage('Number removed.')
      await loadInventory()
      refreshAssignedNumbers?.()
    } catch (err) {
      setError(firstError(err))
    } finally {
      setBusyKey(null)
    }
  }

  async function removeAccount(account) {
    if (!window.confirm(`Remove account "${account.label}" and all its numbers?`)) return
    setBusyKey(`del-a-${account.id}`)
    setError('')
    try {
      await api(`/twilio/accounts/${account.id}`, { method: 'DELETE' })
      setMessage('Account removed.')
      await loadInventory()
      refreshAssignedNumbers?.()
    } catch (err) {
      setError(firstError(err))
    } finally {
      setBusyKey(null)
    }
  }

  function toggleAgentId(list, id) {
    const n = Number(id)
    return list.includes(n) ? list.filter((x) => x !== n) : [...list, n]
  }

  if (loading) return <p className="loading-state">Loading settings…</p>

  return (
    <div className="page">
      <div className="page-header">
        <h1>Dynamic Settings</h1>
        <p className="muted">
          Manage multiple Twilio accounts and numbers. Assign numbers to agents (many-to-many). Only admins can change
          assignments.
        </p>
      </div>

      {message ? <div className="alert success">{message}</div> : null}
      {error ? <div className="alert error">{error}</div> : null}

      <form className="settings-form" onSubmit={saveGeneral}>
        <h2 className="settings-section-title settings-section-title-in-form">General</h2>
        <label>
          SMS Provider
          <select value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="twilio">Twilio Telephony Platform</option>
          </select>
        </label>
        <label>
          Default Country Region Prefix
          <select value={defaultCountryCode} onChange={(e) => setDefaultCountryCode(e.target.value)} required>
            {COUNTRY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <span className="help">Auto-appended to local numbers missing international code.</span>
        </label>
        <button className="btn primary" type="submit" disabled={savingGeneral}>
          {savingGeneral ? 'Saving…' : 'Save General Settings'}
        </button>
      </form>

      <div className="settings-numbers-block">
        <div className="settings-numbers-head">
          <div>
            <h2 className="settings-section-title">Twilio Accounts &amp; Numbers</h2>
            <p className="muted small">Each number can be assigned to multiple agents. Admins see all lines.</p>
          </div>
          <button type="button" className="btn primary" onClick={() => setShowAddAccount(true)}>
            + Add Account + Number
          </button>
        </div>

        {accounts.length === 0 ? (
          <div className="twilio-empty">
            <strong>No Twilio numbers configured</strong>
            <span className="muted">Add an account SID, auth token, and sender number to start sending SMS.</span>
          </div>
        ) : (
          accounts.map((account) => (
            <article key={account.id} className="twilio-account-card">
              <div className="twilio-account-head">
                <div className="twilio-account-title">
                  <strong>{account.label || `Account #${account.id}`}</strong>
                  <span className="muted mono small">{account.account_sid || 'SID configured'}</span>
                </div>
                <div className="twilio-account-actions">
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => {
                      setAddNumberFor(account.id)
                      setNumberForm({ phone_number: '', friendly_name: '', agent_ids: [] })
                      setNumberError('')
                    }}
                  >
                    + Number
                  </button>
                  <button
                    type="button"
                    className="btn danger-btn"
                    disabled={busyKey === `del-a-${account.id}`}
                    onClick={() => removeAccount(account)}
                  >
                    Remove Account
                  </button>
                </div>
              </div>

              {(account.numbers || []).length === 0 ? (
                <p className="muted twilio-empty-numbers">No numbers on this account yet.</p>
              ) : (
                <div className="twilio-number-list">
                  {(account.numbers || []).map((number) => {
                    const selectedIds = (number.agents || []).map((a) => a.id)
                    const nickname = (number.friendly_name || '').trim()
                    const showNickname = nickname && nickname !== number.phone_number
                    return (
                      <div key={number.id} className="twilio-number-row">
                        <div className="twilio-number-top">
                          <div className="twilio-number-identity">
                            <span className="line-badge">
                              {showNickname ? nickname : number.phone_number}
                            </span>
                            {showNickname ? (
                              <span className="mono small muted">{number.phone_number}</span>
                            ) : null}
                            <span
                              className={`webhook-pill ${number.webhook_configured_at ? 'ok' : 'warn'}`}
                            >
                              {number.webhook_configured_at ? 'Webhook OK' : 'Webhook not set'}
                            </span>
                          </div>
                          <div className="twilio-number-actions">
                            <button
                              type="button"
                              className="btn ghost"
                              onClick={() => openNicknameModal(number)}
                            >
                              Edit Nickname
                            </button>
                            <button
                              type="button"
                              className="btn ghost"
                              disabled={busyKey === `hook-${number.id}`}
                              onClick={() => reconfigureWebhook(number)}
                            >
                              {busyKey === `hook-${number.id}` ? 'Updating…' : 'Reconfigure Webhook'}
                            </button>
                            <button
                              type="button"
                              className="btn danger-btn"
                              disabled={busyKey === `del-n-${number.id}`}
                              onClick={() => removeNumber(number)}
                            >
                              Remove
                            </button>
                          </div>
                        </div>

                        <div className="agent-assign">
                          <span className="twilio-field-label">Assigned agents</span>
                          {agents.length === 0 ? (
                            <p className="muted small twilio-hint">
                              No agent accounts yet. Create agents under Team Accounts, then assign them here.
                            </p>
                          ) : (
                            <div className="agent-checkboxes">
                              {agents.map((agent) => (
                                <label key={agent.id} className="check-chip">
                                  <input
                                    type="checkbox"
                                    checked={selectedIds.includes(agent.id)}
                                    disabled={busyKey === `agents-${number.id}`}
                                    onChange={() =>
                                      saveNumberAgents(number, toggleAgentId(selectedIds, agent.id))
                                    }
                                  />
                                  <span>{agent.name}</span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </article>
          ))
        )}
      </div>

      {showAddAccount ? (
        <div className="modal-backdrop" role="presentation" onClick={() => !savingAccount && setShowAddAccount(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Twilio Account + Number</h2>
              <button type="button" className="icon-btn" onClick={() => !savingAccount && setShowAddAccount(false)}>
                ✕
              </button>
            </div>
            {accountError ? <div className="alert error">{accountError}</div> : null}
            <form className="modal-form" onSubmit={createAccount}>
              <label>
                Account Label
                <input
                  value={accountForm.label}
                  onChange={(e) => setAccountForm((f) => ({ ...f, label: e.target.value }))}
                  placeholder="Primary / AU Sales"
                />
              </label>
              <label>
                Account SID
                <input
                  value={accountForm.account_sid}
                  onChange={(e) => setAccountForm((f) => ({ ...f, account_sid: e.target.value }))}
                  required
                  autoComplete="off"
                />
              </label>
              <label>
                Auth Token
                <input
                  type="password"
                  value={accountForm.auth_token}
                  onChange={(e) => setAccountForm((f) => ({ ...f, auth_token: e.target.value }))}
                  required
                  autoComplete="off"
                />
              </label>
              <label>
                First Sender Number (E.164)
                <input
                  value={accountForm.phone_number}
                  onChange={(e) => setAccountForm((f) => ({ ...f, phone_number: e.target.value }))}
                  placeholder="+61412345678"
                  required
                />
              </label>
              <label>
                Nickname (optional)
                <input
                  value={accountForm.friendly_name}
                  onChange={(e) => setAccountForm((f) => ({ ...f, friendly_name: e.target.value }))}
                  placeholder="AU Main Line"
                />
              </label>
              {agents.length > 0 ? (
                <div className="agent-assign">
                  <div className="muted small">Assign agents (optional)</div>
                  <div className="agent-checkboxes">
                    {agents.map((agent) => (
                      <label key={agent.id} className="check-chip">
                        <input
                          type="checkbox"
                          checked={accountForm.agent_ids.includes(agent.id)}
                          onChange={() =>
                            setAccountForm((f) => ({
                              ...f,
                              agent_ids: toggleAgentId(f.agent_ids, agent.id),
                            }))
                          }
                        />
                        {agent.name}
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="modal-actions">
                <button type="button" className="btn" disabled={savingAccount} onClick={() => setShowAddAccount(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn primary" disabled={savingAccount}>
                  {savingAccount ? 'Validating…' : 'Add Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {addNumberFor ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => !savingNumber && setAddNumberFor(null)}
        >
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Number to Account</h2>
              <button type="button" className="icon-btn" onClick={() => !savingNumber && setAddNumberFor(null)}>
                ✕
              </button>
            </div>
            {numberError ? <div className="alert error">{numberError}</div> : null}
            <form className="modal-form" onSubmit={createNumber}>
              <label>
                Phone Number (E.164)
                <input
                  value={numberForm.phone_number}
                  onChange={(e) => setNumberForm((f) => ({ ...f, phone_number: e.target.value }))}
                  placeholder="+61412345678"
                  required
                />
              </label>
              <label>
                Nickname (optional)
                <input
                  value={numberForm.friendly_name}
                  onChange={(e) => setNumberForm((f) => ({ ...f, friendly_name: e.target.value }))}
                />
              </label>
              {agents.length > 0 ? (
                <div className="agent-assign">
                  <div className="muted small">Assign agents</div>
                  <div className="agent-checkboxes">
                    {agents.map((agent) => (
                      <label key={agent.id} className="check-chip">
                        <input
                          type="checkbox"
                          checked={numberForm.agent_ids.includes(agent.id)}
                          onChange={() =>
                            setNumberForm((f) => ({
                              ...f,
                              agent_ids: toggleAgentId(f.agent_ids, agent.id),
                            }))
                          }
                        />
                        {agent.name}
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="modal-actions">
                <button type="button" className="btn" disabled={savingNumber} onClick={() => setAddNumberFor(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn primary" disabled={savingNumber}>
                  {savingNumber ? 'Validating…' : 'Add Number'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {editNicknameFor ? (
        <div className="modal-backdrop" role="presentation" onClick={closeNicknameModal}>
          <div className="modal modal-sm" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Nickname</h2>
              <button type="button" className="icon-btn" disabled={savingNickname} onClick={closeNicknameModal}>
                ✕
              </button>
            </div>
            {nicknameError ? <div className="alert error">{nicknameError}</div> : null}
            <form className="modal-form" onSubmit={saveFriendlyName}>
              <p className="muted small" style={{ margin: 0 }}>
                Number: <span className="mono">{editNicknameFor.phone_number}</span>
              </p>
              <label>
                Nickname
                <input
                  value={nicknameDraft}
                  onChange={(e) => setNicknameDraft(e.target.value)}
                  placeholder={editNicknameFor.phone_number}
                  autoFocus
                />
                <span className="help">Shown in Live Chat badges and send-from selectors. Leave blank to use the phone number.</span>
              </label>
              <div className="modal-actions">
                <button type="button" className="btn" disabled={savingNickname} onClick={closeNicknameModal}>
                  Cancel
                </button>
                <button type="submit" className="btn primary" disabled={savingNickname}>
                  {savingNickname ? 'Saving…' : 'Save Nickname'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
