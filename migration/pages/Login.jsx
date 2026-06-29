window.Pages = window.Pages || {};

window.Pages.LoginPage = function LoginPage() {
  const navigate = ReactRouterDOM.useNavigate();
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');

  function onSubmit(event) {
    event.preventDefault();
    if (!username.trim() || !password) return;
    navigate('/dashboard');
  }

  return (
    <main className="container">
      <window.UI.Card
        title="Login"
        subtitle="Initial Login.jsx route for migration work"
      >
        <form className="au-stack" onSubmit={onSubmit}>
          <label className="au-label">
            Username
            <window.UI.Input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="superuser"
            />
          </label>

          <label className="au-label">
            Password
            <window.UI.Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
            />
          </label>

          <div className="au-row">
            <window.UI.Button type="submit">Login</window.UI.Button>
            <window.UI.Button type="button" variant="ghost" onClick={() => navigate('/reports')}>
              Go to Reports
            </window.UI.Button>
          </div>
        </form>
      </window.UI.Card>
    </main>
  );
};
