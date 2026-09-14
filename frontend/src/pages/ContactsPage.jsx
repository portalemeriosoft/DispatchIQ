import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'

const EMPTY_FORM = {
  name: '',
  phone_number: '',
  email: '',
  lead_status: 'lead',
  tags: '',
  internal_notes: '',
}

function tagsToString(tags) {
  if (!tags) return ''
  if (Array.isArray(tags)) return tags.join(', ')
  return String(tags)
}

function tagsToArray(value) {
  return String(value || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

function firstError(err) {
  const errors = err?.data?.errors
  if (errors) return Object.values(errors).flat()[0]
  return err?.message || 'Something went wrong'
}

export default function ContactsPage() {
  const navigate = useNavigate()
  const [contacts, setContacts] = useState([])
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 })
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [leadStatus, setLeadStatus] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, leadStatus])

  const loadContacts = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ page: String(page), per_page: '10' })
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (leadStatus) params.set('lead_status', leadStatus)

      const data = await api(`/contacts?${params.toString()}`)
      setContacts(data.data || [])
      setMeta({
        current_page: data.current_page || 1,
        last_page: data.last_page || 1,
        total: data.total || 0,
      })
    } catch (err) {
      setError(firstError(err))
      setContacts([])
    } finally {
      setLoading(false)
    }
  }, [page, debouncedSearch, leadStatus])

  useEffect(() => {
    loadContacts()
  }, [loadContacts])

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setModalOpen(true)
  }

  function openEdit(contact) {
    setEditing(contact)
    setForm({
      name: contact.name || '',
      phone_number: contact.phone_number || '',
      email: contact.email || '',
      lead_status: contact.lead_status || 'lead',
      tags: tagsToString(contact.tags),
      internal_notes: contact.internal_notes || '',
    })
    setFormError('')
    setModalOpen(true)
  }

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function onSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setFormError('')
    const payload = {
      name: form.name.trim(),
      phone_number: form.phone_number.trim(),
      email: form.email.trim() || null,
      lead_status: form.lead_status,
      tags: tagsToArray(form.tags),
      internal_notes: form.internal_notes.trim() || null,
    }

    try {
      if (editing) {
        await api(`/contacts/${editing.id}`, { method: 'PUT', body: payload })
      } else {
        await api('/contacts', { method: 'POST', body: payload })
      }
      setModalOpen(false)
      await loadContacts()
    } catch (err) {
      setFormError(firstError(err))
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(contact) {
    if (!window.confirm(`Delete contact "${contact.name}"?`)) return
    try {
      await api(`/contacts/${contact.id}`, { method: 'DELETE' })
      await loadContacts()
    } catch (err) {
      setError(firstError(err))
    }
  }

  return (
    <div className="page">
      <div className="page-header row">
        <div>
          <h1>CRM Customer Directory</h1>
          <p className="muted">
            Manage client contact records, lead statuses, CRM tags, and launch 2-Way Live Chat.
          </p>
        </div>
        <button type="button" className="btn primary" onClick={openCreate}>
          + Add New Contact
        </button>
      </div>

      <div className="toolbar">
        <input
          className="search-input"
          type="search"
          placeholder="Search by contact name, phone, email, or tag..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="filter-select"
          value={leadStatus}
          onChange={(e) => setLeadStatus(e.target.value)}
          aria-label="STATUS"
        >
          <option value="">All Lead Statuses</option>
          <option value="lead">Lead</option>
          <option value="customer">Customer</option>
        </select>
        <button type="button" className="btn ghost" onClick={loadContacts} title="Refresh">
          Refresh
        </button>
      </div>

      {error ? <div className="alert error">{error}</div> : null}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Customer Name</th>
              <th>Phone Number</th>
              <th>Email</th>
              <th>Lead Status</th>
              <th>CRM Tags</th>
              <th className="col-actions">Live Chat</th>
              <th className="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7}>
                  <span className="loading-state">Loading contacts…</span>
                </td>
              </tr>
            ) : contacts.length === 0 ? (
              <tr>
                <td colSpan={7} className="td-empty">
                  <div className="empty-state">
                    <span className="empty-icon list" aria-hidden="true" />
                    <strong>No contacts found</strong>
                    <span>Add a contact or adjust your search filters.</span>
                  </div>
                </td>
              </tr>
            ) : (
              contacts.map((contact) => (
                <tr key={contact.id}>
                  <td>{contact.name}</td>
                  <td className="mono">{contact.phone_number}</td>
                  <td>{contact.email || '—'}</td>
                  <td>
                    <span className={`badge status-${contact.lead_status}`}>
                      {contact.lead_status === 'customer' ? 'CUSTOMER' : 'LEAD'}
                    </span>
                  </td>
                  <td>
                    <div className="tag-list">
                      {(contact.tags || []).length === 0
                        ? '—'
                        : contact.tags.map((tag) => (
                            <span key={tag} className="tag-pill">
                              #{tag}
                            </span>
                          ))}
                    </div>
                  </td>
                  <td className="col-actions">
                    <button
                      type="button"
                      className="btn chat-btn"
                      onClick={() => navigate(`/inbox?contact=${contact.id}`)}
                    >
                      Open Chat
                    </button>
                  </td>
                  <td className="col-actions">
                    <div className="row-actions">
                      <button type="button" className="icon-btn" onClick={() => openEdit(contact)} title="Edit">
                        Edit
                      </button>
                      <button type="button" className="icon-btn danger" onClick={() => onDelete(contact)} title="Delete">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
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

      {modalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => !saving && setModalOpen(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="contact-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2 id="contact-modal-title">{editing ? 'Edit Contact' : 'Add New Contact'}</h2>
              <button type="button" className="icon-btn" onClick={() => !saving && setModalOpen(false)}>
                ✕
              </button>
            </div>
            {formError ? <div className="alert error">{formError}</div> : null}
            <form className="modal-form" onSubmit={onSubmit}>
              <label>
                Customer Name
                <input value={form.name} onChange={(e) => updateField('name', e.target.value)} required />
              </label>
              <label>
                Phone Number (E.164)
                <input
                  value={form.phone_number}
                  onChange={(e) => updateField('phone_number', e.target.value)}
                  placeholder="+923001234567"
                  required
                />
              </label>
              <label>
                Email Address
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  placeholder="name@example.com"
                />
              </label>
              <label>
                Lead Status
                <select value={form.lead_status} onChange={(e) => updateField('lead_status', e.target.value)}>
                  <option value="lead">Lead</option>
                  <option value="customer">Customer</option>
                </select>
              </label>
              <label>
                CRM Tags
                <input
                  value={form.tags}
                  onChange={(e) => updateField('tags', e.target.value)}
                  placeholder="VIP, Hot Lead, USA"
                />
                <span className="help">Comma-separated values</span>
              </label>
              <label>
                Internal Team Notes
                <textarea
                  rows={3}
                  value={form.internal_notes}
                  onChange={(e) => updateField('internal_notes', e.target.value)}
                />
              </label>
              <div className="modal-actions">
                <button type="button" className="btn" disabled={saving} onClick={() => setModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn primary" disabled={saving}>
                  {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
