import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useAuth } from '@/context/AuthContext'
import { useTenant } from '@/context/TenantContext'

export default function DashboardPage() {
  const navigate = useNavigate()
  const { logout, user } = useAuth()
  const { company, roleLabel, tenantId, tenantResolved, coa } = useTenant()

  async function handleLogout() {
    await logout()
    navigate('/', { replace: true })
  }

  const companyName = company.name || 'Aura Unity ERP'
  const companySubtitle = company.sub || ''

  return (
    <main className="container">
      <div className="page-header">
        <div>
          <h1 className="au-title au-title--page">{companyName}</h1>
          {companySubtitle && <p className="au-text" style={{ marginTop: 4 }}>{companySubtitle}</p>}
        </div>
        <Button variant="ghost" onClick={handleLogout}>Logout</Button>
      </div>

      {/* Session info */}
      <Card subtitle="Active session">
        <dl className="au-stack" style={{ gap: 8 }}>
          <div className="au-row">
            <dt className="au-text" style={{ minWidth: 100, fontWeight: 500 }}>User:</dt>
            <dd className="au-text" style={{ margin: 0 }}>{user?.email || '—'}</dd>
          </div>
          <div className="au-row">
            <dt className="au-text" style={{ minWidth: 100, fontWeight: 500 }}>Role:</dt>
            <dd className="au-text" style={{ margin: 0 }}>{roleLabel || '—'}</dd>
          </div>
          <div className="au-row">
            <dt className="au-text" style={{ minWidth: 100, fontWeight: 500 }}>Tenant ID:</dt>
            <dd className="au-text" style={{ margin: 0, wordBreak: 'break-all' }}>
              {tenantResolved ? (tenantId || 'No tenant assigned') : 'Resolving…'}
            </dd>
          </div>
        </dl>
      </Card>

      {/* Company info */}
      {(company.address || company.phone) && (
        <Card subtitle="Company information" style={{ marginTop: 16 }}>
          <dl className="au-stack" style={{ gap: 8 }}>
            {company.phone && (
              <div className="au-row">
                <dt className="au-text" style={{ minWidth: 100, fontWeight: 500 }}>Phone:</dt>
                <dd className="au-text" style={{ margin: 0 }}>{company.phone}</dd>
              </div>
            )}
            {company.address && (
              <div className="au-row">
                <dt className="au-text" style={{ minWidth: 100, fontWeight: 500 }}>Address:</dt>
                <dd className="au-text" style={{ margin: 0 }}>{company.address}</dd>
              </div>
            )}
          </dl>
        </Card>
      )}

      {/* Quick stats */}
      <div className="au-row" style={{ marginTop: 16, gap: 12 }}>
        <Card subtitle="Chart of Accounts">
          <p className="au-title" style={{ marginBottom: 0, fontSize: '2rem' }}>{coa.length}</p>
          <p className="au-text">accounts loaded</p>
        </Card>
      </div>

      <div className="au-row" style={{ marginTop: 16 }}>
        <Button onClick={() => navigate('/reports')}>View Chart of Accounts</Button>
      </div>
    </main>
  )
}
