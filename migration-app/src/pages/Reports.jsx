import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useTenant } from '@/context/TenantContext'
import { getTenantPath } from '@/lib/tenant'

const GROUP_ORDER = ['Asset', 'Liability', 'Equity', 'Income', 'Expense']

export default function ReportsPage() {
  const navigate = useNavigate()
  const { coa, company, tenantSlug } = useTenant()

  // Group accounts by account_group for a structured view
  const groups = {}
  coa.forEach((account) => {
    const g = account.account_group || 'Other'
    if (!groups[g]) groups[g] = []
    groups[g].push(account)
  })

  const orderedGroups = [
    ...GROUP_ORDER.filter((g) => groups[g]),
    ...Object.keys(groups).filter((g) => !GROUP_ORDER.includes(g)),
  ]

  return (
    <main className="container">
      <div className="page-header">
        <h1 className="au-title au-title--page">Chart of Accounts</h1>
        <div className="au-row">
          <Button variant="ghost" onClick={() => navigate(getTenantPath(tenantSlug, '/dashboard'))}>Dashboard</Button>
        </div>
      </div>

      {company.name && (
        <p className="au-text" style={{ marginBottom: 16 }}>{company.name}</p>
      )}

      {coa.length === 0 ? (
        <Card subtitle="No accounts found for this organisation.">
          <p className="au-text">
            Chart of accounts will appear here once accounts are added via the main ERP.
          </p>
        </Card>
      ) : (
        orderedGroups.map((group) => (
          <div key={group} style={{ marginBottom: 24 }}>
            <h2 className="au-title" style={{ fontSize: '1rem', marginBottom: 8 }}>{group}</h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)' }}>
                    <th style={thStyle}>Code</th>
                    <th style={thStyle}>Account Name</th>
                    <th style={thStyle}>Type</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Opening Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {groups[group].map((a) => (
                    <tr key={a.account_code} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={tdStyle}><strong>{a.account_code}</strong></td>
                      <td style={tdStyle}>{a.account_name}</td>
                      <td style={tdStyle}>{a.account_type || 'Ledger'}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        {Number(a.opening_balance || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </main>
  )
}

const thStyle = {
  padding: '8px 12px',
  textAlign: 'left',
  fontWeight: 600,
  color: 'var(--muted)',
}

const tdStyle = {
  padding: '8px 12px',
}
