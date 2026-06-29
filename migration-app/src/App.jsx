import { Navigate, Route, Routes } from 'react-router-dom'
import DashboardPage from '@/pages/Dashboard'
import LoginPage from '@/pages/Login'
import ReportsPage from '@/pages/Reports'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/reports" element={<ReportsPage />} />
      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  )
}
