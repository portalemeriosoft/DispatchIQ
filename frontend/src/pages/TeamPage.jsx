import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'

function firstError(err) {
  if (err?.status === 403) return 'Only admins can manage team accounts.'
  const errors = err?.data?.errors
  if (errors) return Object.values(errors).flat()[0]
  return err?.data?.message || err?.message || 'Something went wrong'
}

function formatDate(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

function agentLabel(member) {
  if (member?.agent_label) return member.agent_label
  if (member?.agent_code != null && member.agent_code !== '') {
    return String(member.agent_code).padStart(2, '0')
  }
  return '—'
}

const EMPTY_FORM = {
  name: '',
  email: '',
  password: '',
  role: 'agent',
}

export default function TeamPage() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [showPassword, setShowPassword] = useState(false)

  const isAdmin = currentUser?.role === 'admin'
  const isEdit = Boolean(editingUser)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api('/users')
      setUsers(Array.isArray(data) ? data : data.data || [])
    } catch (err) {
      setError(firstError(err))
      setUsers([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  function closeModal({ force = false } = {}) {
    if (saving && !force) return
    setModalOpen(false)
    setEditingUser(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setShowPassword(false)
  }

  function openAdd() {
    setEditingUser(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setShowPassword(false)
    setModalOpen(true)
  }

  function openEdit(member) {
    setEditingUser(member)
    setForm({
      name: member.name || '',
      email: member.email || '',
      password: '',
      role: member.role || 'agent',
    })
    setFormError('')
    setShowPassword(false)
    setModalOpen(true)
  }

  async function onSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setFormError('')
    setMessage('')
    try {
      if (isEdit) {
        const body = {
          name: form.name.trim(),
          role: form.role,
        }
        if (form.password.trim()) {
          body.password = form.password
        }
        await api(`/users/${editingUser.id}`, {
          method: 'PUT',
          body,
        })
        setMessage('Team member updated.')
      } else {
        await api('/users', {
          method: 'POST',
          body: {
            name: form.name.trim(),
            email: form.email.trim(),
            password: form.password,
            role: form.role,
          },
        })
        setMessage('Team member added.')
      }
      closeModal({ force: true })
      await loadUsers()
    } catch (err) {
      setFormError(firstError(err))
    } finally {
      setSaving(false)
    }
  }

  async function removeUser(member) {
    if (!window.confirm(`Remove ${member.name} (${member.email}) from the team?`)) return
    setBusyId(member.id)
    setError('')
    setMessage('')
    try {
      await api(`/users/${member.id}`, { method: 'DELETE' })
      setMessage('User removed.')
      await loadUsers()
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
          <h1>Team Accounts</h1>
          <p className="muted">
            Manage admin and agent users who can access DispatchIQ. Staff ID is permanent and auto-assigned.
          </p>
        </div>
        {isAdmin ? (
          <button type="button" className="btn primary" onClick={openAdd}>
            + Add Team Member
          </button>
        ) : null}
      </div>

      {!isAdmin && !loading ? (
        <div className="alert error">Only admins can manage team accounts.</div>
      ) : null}
      {message ? <div className="alert success">{message}</div> : null}
      {error ? <div className="alert error">{error}</div> : null}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Staff ID</th>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Joined</th>
              <th className="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6}>
                  <span className="loading-state">Loading team…</span>
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="td-empty">
                  <div className="empty-state">
                    <span className="empty-icon profile" aria-hidden="true" />
                    <strong>No team members found</strong>
                    <span>Invite an agent to collaborate on live chats and campaigns.</span>
                  </div>
                </td>
              </tr>
            ) : (
              users.map((member) => (
                <tr key={member.id}>
                  <td>
                    <span className="mono staff-id">{agentLabel(member)}</span>
                  </td>
                  <td>
                    {member.name}
                    {currentUser?.id === member.id ? <span className="muted small"> (you)</span> : null}
                  </td>
                  <td>{member.email}</td>
                  <td>
                    <span className={`badge role-${member.role}`}>
                      {String(member.role || '').toUpperCase()}
                    </span>
                  </td>
                  <td>{formatDate(member.created_at)}</td>
                  <td className="col-actions">
                    {isAdmin && !member.is_master ? (
                      <div className="row-actions">
                        <button
                          type="button"
                          className="icon-btn"
                          disabled={busyId === member.id}
                          onClick={() => openEdit(member)}
                        >
                          Edit
                        </button>
                        {currentUser?.id !== member.id ? (
                          <button
                            type="button"
                            className="icon-btn danger"
                            disabled={busyId === member.id}
                            onClick={() => removeUser(member)}
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <span className="muted" title={member.is_master ? 'Master admin cannot be edited' : undefined}>
                        —
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={closeModal}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{isEdit ? 'Edit Team Member' : 'Add Team Member'}</h2>
              <button type="button" className="icon-btn" onClick={closeModal}>
                ✕
              </button>
            </div>
            {formError ? <div className="alert error">{formError}</div> : null}
            <form className="modal-form" onSubmit={onSubmit}>
              <label>
                Full Name
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  required={!isEdit}
                  disabled={isEdit}
                  readOnly={isEdit}
                />
                {isEdit ? <span className="help">Email cannot be changed.</span> : null}
              </label>
              <label>
                {isEdit ? 'New Password (optional)' : 'Temporary Password'}
                <div className="password-field-wrap">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    minLength={isEdit ? undefined : 8}
                    required={!isEdit}
                    placeholder={isEdit ? 'Leave blank to keep current password' : ''}
                  />
                  <button
                    type="button"
                    className="password-eye"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                        <path d="M3 3l18 18" />
                        <path d="M10.6 10.6a2 2 0 002.8 2.8" />
                        <path d="M9.9 5.1A9.8 9.8 0 0112 5c5 0 9.3 3.1 11 7.5a11.5 11.5 0 01-4.1 4.9" />
                        <path d="M6.1 6.1A11.5 11.5 0 001 12.5C2.7 16.9 7 20 12 20c1.4 0 2.7-.2 3.9-.7" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                        <path d="M1 12.5C2.7 8.1 7 5 12 5s9.3 3.1 11 7.5c-1.7 4.4-6 7.5-11 7.5S2.7 16.9 1 12.5z" />
                        <circle cx="12" cy="12.5" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
                <span className="help">
                  {isEdit
                    ? 'Leave blank to keep the current password. Minimum 8 characters if changing.'
                    : 'Minimum 8 characters. Share securely with the new teammate.'}
                </span>
              </label>
              <label>
                Role
                <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
                  <option value="agent">Agent</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              <div className="modal-actions">
                <button type="button" className="btn" disabled={saving} onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="btn primary" disabled={saving}>
                  {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
