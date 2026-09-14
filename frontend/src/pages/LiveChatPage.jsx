import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'

const POLL_MS = 4000

function firstError(err) {
  const errors = err?.data?.errors
  if (errors) return Object.values(errors).flat()[0]
  return err?.message || 'Something went wrong'
}

function formatTime(value) {
  if (!value) return ''
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

function formatBubbleTime(value) {
  if (!value) return ''
  try {
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return value
  }
}

function formatBubbleDate(value) {
  if (!value) return ''
  try {
    return new Date(value).toLocaleDateString([], {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return value
  }
}

function MessageTick({ delivered }) {
  if (delivered) {
    return (
      <svg
        className="msg-tick delivered"
        viewBox="0 0 22 16"
        width="18"
        height="13"
        aria-label="Delivered"
      >
        <path
          d="M1.6 8.2 4.8 11.4 11.2 4.6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M7.4 8.2 10.6 11.4 17 4.6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }

  return (
    <svg
      className="msg-tick sent"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-label="Sent"
    >
      <path
        d="M3.2 8.2 6.4 11.4 12.8 4.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function previewBody(body) {
  if (!body) return 'No messages yet'
  return body.length > 60 ? `${body.slice(0, 60)}…` : body
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

export default function LiveChatPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = searchParams.get('contact') ? Number(searchParams.get('contact')) : null

  const [conversations, setConversations] = useState([])
  const [listSearch, setListSearch] = useState('')
  const [debouncedListSearch, setDebouncedListSearch] = useState('')
  const [messages, setMessages] = useState([])
  const [quickReplies, setQuickReplies] = useState([])
  const [composer, setComposer] = useState('')
  const [loadingList, setLoadingList] = useState(true)
  const [loadingThread, setLoadingThread] = useState(false)
  const [sending, setSending] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [error, setError] = useState('')
  const [profileNotice, setProfileNotice] = useState('')
  const [live, setLive] = useState(true)
  const [showQuickModal, setShowQuickModal] = useState(false)
  const [quickForm, setQuickForm] = useState({ shortcut: '', body: '' })
  const [quickError, setQuickError] = useState('')
  const [savingQuick, setSavingQuick] = useState(false)
  const [deleteQuickTarget, setDeleteQuickTarget] = useState(null)
  const [deletingQuick, setDeletingQuick] = useState(false)

  const [profile, setProfile] = useState({
    name: '',
    phone_number: '',
    email: '',
    lead_status: 'lead',
    tags: '',
    internal_notes: '',
  })

  const threadEndRef = useRef(null)
  const messageFeedRef = useRef(null)
  const stickToBottomRef = useRef(true)
  const pinBottomOnceRef = useRef(false)
  const profileSyncedFor = useRef(null)
  const selectedContact = useMemo(
    () => conversations.find((c) => c.id === selectedId) || null,
    [conversations, selectedId],
  )

  function isNearBottom(el) {
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < 96
  }

  function scrollFeedToBottom() {
    const el = messageFeedRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }

  function onFeedScroll() {
    // Ignore while we are forcing the first pin-to-bottom after open.
    if (pinBottomOnceRef.current) return
    stickToBottomRef.current = isNearBottom(messageFeedRef.current)
  }

  const loadConversations = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoadingList(true)
    try {
      const params = new URLSearchParams({ inbox: '1', per_page: '50' })
      if (debouncedListSearch.trim()) params.set('search', debouncedListSearch.trim())
      const data = await api(`/contacts?${params}`)
      setConversations(data.data || [])
      setLive(true)
    } catch (err) {
      setLive(false)
      if (!silent) setError(firstError(err))
    } finally {
      if (!silent) setLoadingList(false)
    }
  }, [debouncedListSearch])

  const loadMessages = useCallback(async (contactId, { silent = false } = {}) => {
    if (!contactId) {
      setMessages([])
      return
    }
    if (!silent) setLoadingThread(true)
    try {
      const data = await api(`/contacts/${contactId}/messages?per_page=100`)
      const next = data.data || []
      setMessages((prev) => {
        if (
          prev.length === next.length &&
          prev.every(
            (m, i) =>
              m.id === next[i]?.id &&
              m.status === next[i]?.status &&
              m.body === next[i]?.body &&
              m.direction === next[i]?.direction,
          )
        ) {
          return prev
        }
        return next
      })
      setLive(true)
    } catch (err) {
      setLive(false)
      if (!silent) setError(firstError(err))
    } finally {
      if (!silent) setLoadingThread(false)
    }
  }, [])

  const loadQuickReplies = useCallback(async () => {
    try {
      const data = await api('/quick-replies')
      setQuickReplies(Array.isArray(data) ? data : data.data || [])
    } catch {
      // non-blocking
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedListSearch(listSearch), 300)
    return () => clearTimeout(t)
  }, [listSearch])

  useEffect(() => {
    loadConversations()
    loadQuickReplies()
  }, [loadConversations, loadQuickReplies])

  // Initial / contact-switch: always land on latest messages (bottom).
  useEffect(() => {
    if (!selectedId) {
      setMessages([])
      return
    }
    stickToBottomRef.current = true
    pinBottomOnceRef.current = true
    setMessages([])
    loadMessages(selectedId)
  }, [selectedId, loadMessages])

  // Sync CRM form once per selected contact (when list data is available).
  useEffect(() => {
    if (!selectedId) {
      profileSyncedFor.current = null
      return
    }
    if (profileSyncedFor.current === selectedId) return
    const contact = conversations.find((c) => c.id === selectedId)
    if (!contact) return
    profileSyncedFor.current = selectedId
    setProfile({
      name: contact.name || '',
      phone_number: contact.phone_number || '',
      email: contact.email || '',
      lead_status: contact.lead_status || 'lead',
      tags: tagsToString(contact.tags),
      internal_notes: contact.internal_notes || '',
    })
  }, [selectedId, conversations])

  useEffect(() => {
    const id = setInterval(() => {
      loadConversations({ silent: true })
      if (selectedId) loadMessages(selectedId, { silent: true })
    }, POLL_MS)
    return () => clearInterval(id)
  }, [loadConversations, loadMessages, selectedId])

  // Pin to latest on first open; later only if user is already near bottom.
  useEffect(() => {
    if (loadingThread) return
    if (!pinBottomOnceRef.current && !stickToBottomRef.current) return

    let cancelled = false
    const run = () => {
      if (cancelled) return
      scrollFeedToBottom()
      if (pinBottomOnceRef.current) {
        pinBottomOnceRef.current = false
        stickToBottomRef.current = true
      }
    }

    const raf = requestAnimationFrame(() => requestAnimationFrame(run))
    const t = window.setTimeout(run, 50)
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      window.clearTimeout(t)
    }
  }, [messages, loadingThread, selectedId])

  function selectContact(id) {
    stickToBottomRef.current = true
    pinBottomOnceRef.current = true
    setSearchParams({ contact: String(id) })
    setError('')
    setProfileNotice('')
  }

  async function sendMessage(e) {
    e?.preventDefault()
    if (!selectedId || !composer.trim() || sending) return
    setSending(true)
    setError('')
    try {
      const msg = await api(`/contacts/${selectedId}/messages`, {
        method: 'POST',
        body: { body: composer.trim() },
      })
      setComposer('')
      stickToBottomRef.current = true
      setMessages((prev) => [...prev, msg])
      await loadConversations({ silent: true })
    } catch (err) {
      setError(firstError(err))
    } finally {
      setSending(false)
    }
  }

  function applyQuickReply(reply) {
    setComposer(reply.body)
  }

  async function saveProfile(e) {
    e.preventDefault()
    if (!selectedId) return
    setSavingProfile(true)
    setProfileNotice('')
    setError('')
    try {
      const updated = await api(`/contacts/${selectedId}`, {
        method: 'PUT',
        body: {
          name: profile.name.trim(),
          phone_number: profile.phone_number.trim(),
          email: profile.email.trim() || null,
          lead_status: profile.lead_status,
          tags: tagsToArray(profile.tags),
          internal_notes: profile.internal_notes.trim() || null,
          assigned_to: selectedContact?.assigned_to ?? null,
        },
      })
      setProfileNotice('CRM profile saved.')
      setConversations((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)))
    } catch (err) {
      setError(firstError(err))
    } finally {
      setSavingProfile(false)
    }
  }

  async function createQuickReply(e) {
    e.preventDefault()
    setSavingQuick(true)
    setQuickError('')
    try {
      const created = await api('/quick-replies', {
        method: 'POST',
        body: {
          shortcut: quickForm.shortcut.trim().replace(/^\//, ''),
          body: quickForm.body.trim(),
        },
      })
      setQuickReplies((prev) => [...prev, created].sort((a, b) => a.shortcut.localeCompare(b.shortcut)))
      setShowQuickModal(false)
      setQuickForm({ shortcut: '', body: '' })
    } catch (err) {
      setQuickError(firstError(err))
    } finally {
      setSavingQuick(false)
    }
  }

  async function confirmDeleteQuickReply() {
    if (!deleteQuickTarget) return
    setDeletingQuick(true)
    setError('')
    try {
      await api(`/quick-replies/${deleteQuickTarget.id}`, { method: 'DELETE' })
      setQuickReplies((prev) => prev.filter((q) => q.id !== deleteQuickTarget.id))
      setDeleteQuickTarget(null)
    } catch (err) {
      setError(firstError(err))
      setDeleteQuickTarget(null)
    } finally {
      setDeletingQuick(false)
    }
  }

  return (
    <div className="page inbox-page">
      <div className="page-header">
        <h1>Live Chat Inbox</h1>
        <p className="muted">2-way SMS conversations with live polling and CRM profile editing.</p>
      </div>

      {error ? <div className="alert error">{error}</div> : null}

      <div className="inbox-grid">
        <section className="inbox-pane list-pane">
          <div className="pane-header">
            <strong>Live Inbox</strong>
            <button type="button" className="btn ghost" onClick={() => loadConversations()} title="Refresh">
              Refresh
            </button>
          </div>
          <input
            className="search-input"
            type="search"
            placeholder="Search contact, number..."
            value={listSearch}
            onChange={(e) => setListSearch(e.target.value)}
          />
          <div className="conversation-list">
            {loadingList ? (
              <p className="loading-state pad">Loading conversations…</p>
            ) : conversations.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon list" aria-hidden="true" />
                <strong>No conversations yet</strong>
                <span>Add a contact in CRM, then open Live Chat from their row.</span>
                <button type="button" className="btn primary" onClick={() => navigate('/contacts')}>
                  Go to CRM Contacts
                </button>
              </div>
            ) : (
              conversations.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`conversation-item ${selectedId === c.id ? 'active' : ''}`}
                  onClick={() => selectContact(c.id)}
                >
                  <div className="conversation-top">
                    <strong>{c.name}</strong>
                    <span className={`badge status-${c.lead_status}`}>
                      {c.lead_status === 'customer' ? 'CUSTOMER' : 'LEAD'}
                    </span>
                  </div>
                  <div className="muted mono small">{c.phone_number}</div>
                  <div className="preview">{previewBody(c.latest_message?.body)}</div>
                  <div className="muted small">{formatTime(c.latest_message?.created_at)}</div>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="inbox-pane thread-pane">
            {!selectedContact ? (
            <div className="empty-thread">
              <div className="empty-state">
                <span className="empty-icon chat" aria-hidden="true" />
                <strong>Select a conversation</strong>
                <span>Choose a contact from the inbox to view the thread and CRM profile.</span>
              </div>
            </div>
          ) : (
            <>
              <div className="thread-header">
                <div>
                  <strong>{selectedContact.name}</strong>
                  <div className="muted mono small">{selectedContact.phone_number}</div>
                  <div className="muted small">
                    Assigned: {selectedContact.assignee?.name || user?.name || 'Unassigned'}
                  </div>
                </div>
                <span className={`live-badge ${live ? 'on' : 'off'}`}>
                  {live ? '2-Way Live' : 'Reconnecting…'}
                </span>
              </div>

              <div className="message-feed" ref={messageFeedRef} onScroll={onFeedScroll}>
                {loadingThread ? (
                  <p className="loading-state pad">Loading messages…</p>
                ) : messages.length === 0 ? (
                  <div className="empty-state">
                    <span className="empty-icon chat" aria-hidden="true" />
                    <strong>No messages yet</strong>
                    <span>Send the first SMS below to start this thread.</span>
                  </div>
                ) : (
                  messages.map((m) => {
                    const isOutbound = m.direction === 'outbound'
                    const tipName = isOutbound
                      ? m.sender?.name || user?.name || 'Agent'
                      : selectedContact?.name || 'Customer'

                    return (
                      <div key={m.id} className={`bubble-row ${m.direction}`}>
                        <div className="bubble-stack">
                          <div className={`bubble ${m.direction}`}>{m.body}</div>
                          <div className={`bubble-meta ${m.direction}`}>
                            {isOutbound ? (
                              <MessageTick
                                delivered={['delivered', 'read'].includes(String(m.status || '').toLowerCase())}
                              />
                            ) : null}
                            <span className="bubble-time">
                              {formatBubbleTime(m.created_at)}
                              <span className="bubble-tip" role="tooltip">
                                <span className="bubble-tip-name">{tipName}</span>
                                <span className="bubble-tip-date">{formatBubbleDate(m.created_at)}</span>
                              </span>
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
                <div ref={threadEndRef} />
              </div>

              <div className="quick-row">
                {quickReplies.map((qr) => (
                  <div key={qr.id} className="quick-chip-wrap">
                    <button type="button" className="quick-chip" onClick={() => applyQuickReply(qr)}>
                      /{qr.shortcut}
                    </button>
                    <button
                      type="button"
                      className="quick-chip-remove"
                      title={`Remove /${qr.shortcut}`}
                      aria-label={`Remove /${qr.shortcut}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteQuickTarget(qr)
                      }}
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                        <path
                          d="M2 2l6 6M8 2L2 8"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.4"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  </div>
                ))}
                <button type="button" className="quick-chip add" onClick={() => setShowQuickModal(true)}>
                  + Quick Reply
                </button>
              </div>

              <form className="composer" onSubmit={sendMessage}>
                <input
                  type="text"
                  placeholder="Type live message response to customer..."
                  value={composer}
                  onChange={(e) => setComposer(e.target.value)}
                />
                <button type="submit" className="btn primary" disabled={sending || !composer.trim()}>
                  {sending ? 'Sending…' : 'Send'}
                </button>
              </form>
            </>
          )}
        </section>

        <section className="inbox-pane profile-pane">
          <div className="pane-header">
            <strong>CRM Customer Profile</strong>
          </div>
          {!selectedContact ? (
            <div className="empty-state">
              <span className="empty-icon profile" aria-hidden="true" />
              <strong>No contact selected</strong>
              <span>Select a conversation to edit CRM fields inline.</span>
            </div>
          ) : (
            <form className="profile-form" onSubmit={saveProfile}>
              {profileNotice ? <div className="alert success">{profileNotice}</div> : null}
              <label>
                Customer Name
                <input value={profile.name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} required />
              </label>
              <label>
                Phone Number
                <input
                  value={profile.phone_number}
                  onChange={(e) => setProfile((p) => ({ ...p, phone_number: e.target.value }))}
                  required
                />
              </label>
              <label>
                Email Address
                <input
                  type="email"
                  value={profile.email}
                  onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
                />
              </label>
              <label>
                Lead Status
                <select
                  value={profile.lead_status}
                  onChange={(e) => setProfile((p) => ({ ...p, lead_status: e.target.value }))}
                >
                  <option value="lead">Lead</option>
                  <option value="customer">Customer</option>
                </select>
              </label>
              <label>
                CRM Tags
                <input
                  value={profile.tags}
                  onChange={(e) => setProfile((p) => ({ ...p, tags: e.target.value }))}
                  placeholder="VIP, Hot Lead"
                />
              </label>
              <label>
                Internal Team Notes
                <textarea
                  rows={5}
                  value={profile.internal_notes}
                  onChange={(e) => setProfile((p) => ({ ...p, internal_notes: e.target.value }))}
                />
              </label>
              <button type="submit" className="btn primary" disabled={savingProfile}>
                {savingProfile ? 'Saving…' : 'Save CRM Profile'}
              </button>
            </form>
          )}
        </section>
      </div>

      {showQuickModal ? (
        <div className="modal-backdrop" role="presentation" onClick={() => !savingQuick && setShowQuickModal(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Quick Reply</h2>
              <button type="button" className="icon-btn" onClick={() => !savingQuick && setShowQuickModal(false)}>
                ✕
              </button>
            </div>
            {quickError ? <div className="alert error">{quickError}</div> : null}
            <form className="modal-form" onSubmit={createQuickReply}>
              <label>
                Shortcut
                <input
                  value={quickForm.shortcut}
                  onChange={(e) => setQuickForm((f) => ({ ...f, shortcut: e.target.value }))}
                  placeholder="thanks"
                  required
                />
                <span className="help">Shown as /shortcut in the composer row</span>
              </label>
              <label>
                Message Body
                <textarea
                  rows={4}
                  value={quickForm.body}
                  onChange={(e) => setQuickForm((f) => ({ ...f, body: e.target.value }))}
                  required
                />
              </label>
              <div className="modal-actions">
                <button type="button" className="btn" disabled={savingQuick} onClick={() => setShowQuickModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn primary" disabled={savingQuick}>
                  {savingQuick ? 'Saving…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deleteQuickTarget ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => !deletingQuick && setDeleteQuickTarget(null)}
        >
          <div className="modal modal-sm" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Remove Quick Reply</h2>
              <button
                type="button"
                className="icon-btn"
                disabled={deletingQuick}
                onClick={() => setDeleteQuickTarget(null)}
              >
                ✕
              </button>
            </div>
            <p className="muted" style={{ margin: '0 0 1rem' }}>
              Remove <strong>/{deleteQuickTarget.shortcut}</strong>? This cannot be undone.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn"
                disabled={deletingQuick}
                onClick={() => setDeleteQuickTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn danger-btn"
                disabled={deletingQuick}
                onClick={confirmDeleteQuickReply}
              >
                {deletingQuick ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
