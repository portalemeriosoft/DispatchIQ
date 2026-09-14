import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { api, clearToken, getToken, setToken } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(() => getToken())
  const [user, setUser] = useState(null)
  const [booting, setBooting] = useState(() => Boolean(getToken()))

  useEffect(() => {
    if (!token) {
      setUser(null)
      setBooting(false)
      return
    }

    let cancelled = false
    setBooting(true)
    api('/user')
      .then((data) => {
        if (!cancelled) {
          setUser({
            id: data.id,
            name: data.name,
            email: data.email,
            role: data.role,
            agent_code: data.agent_code,
            agent_label: data.agent_label,
          })
        }
      })
      .catch(() => {
        if (!cancelled) {
          clearToken()
          setTokenState(null)
          setUser(null)
        }
      })
      .finally(() => {
        if (!cancelled) setBooting(false)
      })

    return () => {
      cancelled = true
    }
  }, [token])

  const value = useMemo(
    () => ({
      token,
      user,
      booting,
      async login(email, password) {
        const data = await api('/auth/login', {
          method: 'POST',
          body: { email, password },
        })
        setToken(data.token)
        setTokenState(data.token)
        setUser(data.user)
        return data.user
      },
      logout() {
        clearToken()
        setTokenState(null)
        setUser(null)
      },
    }),
    [token, user, booting],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
