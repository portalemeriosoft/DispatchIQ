import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

function QuoteIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="login-quote-icon"
      aria-hidden="true"
    >
      <path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z" />
      <path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z" />
    </svg>
  )
}

export default function LoginPage() {
  const { login, token, booting } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (booting) {
    return (
      <div className="login-page login-page--split">
        <div className="login-loading">
          <div className="loading-state">Loading session…</div>
        </div>
      </div>
    )
  }

  if (token) return <Navigate to="/inbox" replace />

  async function onSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await login(email, password)
      navigate('/inbox')
    } catch (err) {
      setError(err.data?.errors?.email?.[0] || err.message || 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-page login-page--split">
      <aside className="login-brand">
        <div className="login-brand-top">
          <img src="/favicon.svg" alt="" className="login-brand-icon" width="28" height="28" />
          <span className="login-brand-name">
            Dispatch<span>IQ</span>
          </span>
        </div>

        <div className="login-brand-body">
          <h1 className="login-brand-headline">
            Run live SMS ops with clarity — before the next campaign goes out.
          </h1>
          <blockquote className="login-brand-quote">
            <QuoteIcon />
            <p>The single biggest problem in communication is the illusion that it has taken place.</p>
            <cite>— George Bernard Shaw</cite>
          </blockquote>
        </div>

        <div className="login-brand-footer">
          <span>LIVE SMS DISPATCH</span>
        </div>
      </aside>

      <section className="login-panel">
        <div className="login-panel-inner">
          <form className="login-form" onSubmit={onSubmit}>
            <div className="login-form-header">
              <h2 className="login-form-title">Welcome back!</h2>
              <p className="login-form-sub">
                Sign in to access your inbox, contacts, campaigns, and delivery logs.
              </p>
            </div>

            {error ? <div className="alert error">{error}</div> : null}

            <label className="login-field">
              <span>Email</span>
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
              />
            </label>

            <label className="login-field">
              <span>Password</span>
              <div className="login-password-wrap">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="login-eye"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <path d="M3 3l18 18" />
                      <path d="M10.6 10.6a2 2 0 002.8 2.8" />
                      <path d="M9.9 5.1A9.8 9.8 0 0112 5c5 0 9.3 3.1 11 7.5a11.5 11.5 0 01-4.1 4.9" />
                      <path d="M6.1 6.1A11.5 11.5 0 001 12.5C2.7 16.9 7 20 12 20c1.4 0 2.7-.2 3.9-.7" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <path d="M1 12.5C2.7 8.1 7 5 12 5s9.3 3.1 11 7.5c-1.7 4.4-6 7.5-11 7.5S2.7 16.9 1 12.5z" />
                      <circle cx="12" cy="12.5" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </label>

            <button className="btn primary login-submit" type="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>

            <p className="login-invite-note">Invite-only access — ask an admin for a team account.</p>
          </form>
        </div>
      </section>
    </div>
  )
}
