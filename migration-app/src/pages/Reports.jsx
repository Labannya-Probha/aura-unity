import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useNavigate } from 'react-router-dom'

export default function ReportsPage() {
  const navigate = useNavigate()

  return (
    <main className="container">
      <div className="page-header">
        <h1 className="au-title au-title--page">Reports</h1>
        <Button variant="ghost" onClick={() => navigate('/')}>Back to Login</Button>
      </div>

      <Card subtitle="Separate reports page for route splitting.">
        <p className="au-text">Use this page to migrate reports module next.</p>
      </Card>
    </main>
  )
}
