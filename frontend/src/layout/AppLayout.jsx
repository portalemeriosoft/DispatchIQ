import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'

const allNavItems = [
  { to: '/inbox', label: 'Live Chat Inbox', live: true },
  { to: '/contacts', label: 'CRM Contacts' },
  { to: '/dispatcher', label: 'SMS Dispatcher' },
  { to: '/analytics', label: 'Analytics Dashboard' },
  { to: '/logs', label: 'Master Logs' },
  { to: '/settings', label: 'Dynamic Settings', adminOnly: true },
  { to: '/team', label: 'Team Accounts', adminOnly: true },
]

const ADMIN_SETUP_PATHS = ['/settings', '/team']

function numberLabel(n) {
  const name = (n.friendly_name || n.label || '').trim()
  if (name && name !== n.phone_number) return name
  return n.phone_number
}

export default function AppLayout() {
  const { logout, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [carrier, setCarrier] = useState({ label: 'Carrier: —', region: '' })
  const isAdmin = user?.role === 'admin'
  const [numbersChecked, setNumbersChecked] = useState(false)
  const [availableNumbers, setAvailableNumbers] = useState([])

  const navItems = useMemo(
    () => allNavItems.filter((item) => !item.adminOnly || isAdmin),
    [isAdmin],
  )

  const roleLabel = isAdmin ? 'Admin' : 'Agent'
  const roleClass = isAdmin ? 'role-admin' : 'role-agent'
  const hasAssignedNumbers = availableNumbers.length > 0
  const allowAdminSetup = isAdmin && ADMIN_SETUP_PATHS.includes(location.pathname)
  const blockedNoNumbers = numbersChecked && availableNumbers.length === 0 && !allowAdminSetup

  const loadAvailableNumbers = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setNumbersChecked(false)
    try {
      const data = await api('/twilio/numbers/available')
      setAvailableNumbers(data.numbers || [])
    } catch {
      setAvailableNumbers([])
    } finally {
      setNumbersChecked(true)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    api('/settings')
      .then((settings) => {
        if (cancelled) return
        const provider = (settings.provider || 'twilio').toUpperCase()
        const region = settings.default_country_code || ''
        setCarrier({
          label: `Carrier: ${provider}${region ? ` ${region}` : ''}`,
          region,
        })
      })
      .catch(() => {
        if (!cancelled) setCarrier({ label: 'Carrier: —', region: '' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    loadAvailableNumbers()
  }, [loadAvailableNumbers, user?.id, user?.role])

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') {
        loadAvailableNumbers({ silent: true })
      }
    }
    window.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      window.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [loadAvailableNumbers])

  const outletContext = useMemo(
    () => ({
      refreshCarrier: setCarrier,
      hasAssignedNumbers,
      availableNumbers,
      requiresNumberSelector: availableNumbers.length > 1,
      defaultTwilioNumberId: availableNumbers.length === 1 ? availableNumbers[0]?.id : null,
      refreshAssignedNumbers: () => loadAvailableNumbers({ silent: true }),
    }),
    [hasAssignedNumbers, availableNumbers, loadAvailableNumbers],
  )

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <img src="/favicon.svg" alt="" width="36" height="36" />
          </div>
          <strong>DispatchIQ</strong>
          <span>Enterprise Telephony</span>
        </div>
        <nav className="nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              {item.label}
              {item.live ? <span className="nav-live">LIVE</span> : null}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          {!isAdmin && numbersChecked && availableNumbers.length > 0 ? (
            <div className="assigned-lines">
              <div className="assigned-lines-label">My numbers</div>
              <ul className="assigned-lines-list">
                {availableNumbers.map((n) => (
                  <li key={n.id} title={n.phone_number}>
                    <span className="line-badge compact">{numberLabel(n)}</span>
                    <span className="mono small muted assigned-line-phone">{n.phone_number}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="user-chip">
            <div className="user-avatar" aria-hidden="true">
              {(user?.name || 'A').trim().charAt(0).toUpperCase()}
            </div>
            <div className="user-chip-meta">
              <div className="user-chip-name-row">
                <div className="user-chip-name">{user?.name || 'Signed in'}</div>
                <span className={`badge ${roleClass}`}>{roleLabel}</span>
              </div>
              <div className="user-chip-email" title={user?.email || ''}>
                {user?.email || '—'}
              </div>
            </div>
            <button
              type="button"
              className="user-logout"
              title="Log out"
              aria-label="Log out"
              onClick={() => {
                logout()
                navigate('/login')
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="carrier-pill">{carrier.label}</div>
          {!blockedNoNumbers ? (
            <div className="topbar-actions">
              <button type="button" className="btn primary" onClick={() => navigate('/inbox')}>
                + Live Chat
              </button>
              <button type="button" className="btn" onClick={() => navigate('/dispatcher')}>
                + Bulk Campaign
              </button>
            </div>
          ) : null}
        </header>
        <main className="content">
          {!numbersChecked ? (
            <p className="loading-state">Loading account…</p>
          ) : blockedNoNumbers ? (
            <div className="page">
              <div className="empty-state no-number-state">
                <span className="empty-icon list" aria-hidden="true" />
                <strong>{isAdmin ? 'No Twilio numbers configured' : 'No Twilio number assigned'}</strong>
                <span>
                  {isAdmin
                    ? 'Add at least one Twilio account and sender number in Dynamic Settings before sending SMS or viewing live traffic.'
                    : 'Your agent account has no sender number yet. Ask an admin to assign at least one number to you in Dynamic Settings. Until then you cannot view chats, contacts, logs, or send SMS.'}
                </span>
                <div className="no-number-actions">
                  {isAdmin ? (
                    <button type="button" className="btn primary" onClick={() => navigate('/settings')}>
                      Go to Dynamic Settings
                    </button>
                  ) : null}
                  <button type="button" className="btn ghost" onClick={() => loadAvailableNumbers()}>
                    Refresh
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <Outlet context={outletContext} />
          )}
        </main>
      </div>
    </div>
  )
}
