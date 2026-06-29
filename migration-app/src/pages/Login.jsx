import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'

export default function LoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  function onSubmit(event) {
    event.preventDefault()
    if (!username.trim() || !password) return
    navigate('/dashboard')
  }

  return (
    <main className="container">
      <Card title="Login" subtitle="Build-tool based Login.jsx route for migration work">
        <form className="au-stack" onSubmit={onSubmit}>
          <label className="au-label">
            Username
            <Input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="superuser" />
          </label>

          <label className="au-label">
            Password
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
            />
          </label>

          <div className="au-row">
            <Button type="submit">Login</Button>
            <Button type="button" variant="ghost" onClick={() => navigate('/reports')}>
              Go to Reports
            </Button>
          </div>
        </form>
      </Card>
    </main>
  )
}
