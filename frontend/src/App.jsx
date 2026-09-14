import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import AppLayout from './layout/AppLayout'
import AnalyticsPage from './pages/AnalyticsPage'
import ContactsPage from './pages/ContactsPage'
import DispatcherPage from './pages/DispatcherPage'
import LiveChatPage from './pages/LiveChatPage'
import LoginPage from './pages/LoginPage'
import LogsPage from './pages/LogsPage'
import SettingsPage from './pages/SettingsPage'
import TeamPage from './pages/TeamPage'

function Protected({ children }) {
  const { token, booting } = useAuth()
  if (booting) return <div className="login-page muted">Loading…</div>
  if (!token) return <Navigate to="/login" replace />
  return children
}

function AdminOnly({ children }) {
  const { user, booting } = useAuth()
  if (booting) return <div className="login-page muted">Loading…</div>
  if (user?.role !== 'admin') return <Navigate to="/inbox" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <Protected>
            <AppLayout />
          </Protected>
        }
      >
        <Route index element={<Navigate to="/inbox" replace />} />
        <Route path="inbox" element={<LiveChatPage />} />
        <Route path="contacts" element={<ContactsPage />} />
        <Route path="dispatcher" element={<DispatcherPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="logs" element={<LogsPage />} />
        <Route
          path="settings"
          element={
            <AdminOnly>
              <SettingsPage />
            </AdminOnly>
          }
        />
        <Route
          path="team"
          element={
            <AdminOnly>
              <TeamPage />
            </AdminOnly>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
