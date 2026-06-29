import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useNavigate } from 'react-router-dom'

export default function DashboardPage() {
  const navigate = useNavigate()

  return (
    <main className="container">
      <div className="page-header">
        <h1 className="au-title au-title--page">Dashboard</h1>
        <Button variant="ghost" onClick={() => navigate('/')}>Logout</Button>
      </div>

      <Card subtitle="Separated dashboard page rendered through the Vite + React Router app.">
        <p className="au-text">This is the new routed dashboard shell for the migration.</p>
      </Card>
    </main>
  )
}
