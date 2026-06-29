import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children }) {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <main className="container">
        <p className="au-text">Loading…</p>
      </main>
    )
  }

  if (!session) {
    return <Navigate replace to="/" />
  }

  return children
}
