window.Pages = window.Pages || {};

window.Pages.ReportsPage = function ReportsPage() {
  const navigate = ReactRouterDOM.useNavigate();

  return (
    <main className="container">
      <div className="page-header">
        <h1 className="au-title" style={{ marginBottom: 0 }}>Reports</h1>
        <window.UI.Button variant="ghost" onClick={() => navigate('/')}>Back to Login</window.UI.Button>
      </div>

      <window.UI.Card subtitle="Separate reports page for route splitting.">
        <p className="au-text">Use this page to migrate reports module next.</p>
      </window.UI.Card>
    </main>
  );
};
