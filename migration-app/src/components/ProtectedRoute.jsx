import { Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getTenantPath } from '../lib/tenant'

export default function ProtectedRoute({ children }) {
  const { tenantSlug } = useParams()
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <main className="container">
        <p className="au-text">Loading…</p>
      </main>
    )
  }

  if (!session) {
    return <Navigate replace to={getTenantPath(tenantSlug, '/login')} />
  }

  return children
}
