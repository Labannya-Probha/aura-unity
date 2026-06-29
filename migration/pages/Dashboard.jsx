window.Pages = window.Pages || {};

window.Pages.DashboardPage = function DashboardPage() {
  const navigate = ReactRouterDOM.useNavigate();

  return (
    <main className="container">
      <div className="page-header">
        <h1 className="au-title" style={{ marginBottom: 0 }}>Dashboard</h1>
        <window.UI.Button variant="ghost" onClick={() => navigate('/')}>Logout</window.UI.Button>
      </div>

      <window.UI.Card subtitle="Separated page component with route-level rendering.">
        <p className="au-text">This is the new routed dashboard shell for the migration.</p>
      </window.UI.Card>
    </main>
  );
};
