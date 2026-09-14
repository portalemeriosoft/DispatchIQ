import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
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

export default function AppLayout() {
  const { logout, user } = useAuth()
  const navigate = useNavigate()
  const [carrier, setCarrier] = useState({ label: 'Carrier: —', region: '' })

  const navItems = useMemo(
    () => allNavItems.filter((item) => !item.adminOnly || user?.role === 'admin'),
    [user?.role],
  )

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
          <div className="user-block">
            <div>{user?.name || 'Signed in'}</div>
            <div className="muted">{user?.email}</div>
            {user?.agent_label || user?.agent_code != null ? (
              <div className="muted mono small">
                ID {user.agent_label || String(user.agent_code).padStart(2, '0')}
              </div>
            ) : null}
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                logout()
                navigate('/login')
              }}
            >
              Log out
            </button>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="carrier-pill">{carrier.label}</div>
          <div className="topbar-actions">
            <button type="button" className="btn primary" onClick={() => navigate('/inbox')}>
              + Live Chat
            </button>
            <button type="button" className="btn" onClick={() => navigate('/dispatcher')}>
              + Bulk Campaign
            </button>
          </div>
        </header>
        <main className="content">
          <Outlet context={{ refreshCarrier: setCarrier }} />
        </main>
      </div>
    </div>
  )
}
