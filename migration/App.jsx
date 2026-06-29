window.App = function App() {
  const Routes = ReactRouterDOM.Routes;
  const Route = ReactRouterDOM.Route;
  const Navigate = ReactRouterDOM.Navigate;

  return (
    <Routes>
      <Route path="/" element={<window.Pages.LoginPage />} />
      <Route path="/dashboard" element={<window.Pages.DashboardPage />} />
      <Route path="/reports" element={<window.Pages.ReportsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};
