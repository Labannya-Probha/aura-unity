window.UI = window.UI || {};

window.UI.Button = function Button({ type = 'button', variant = 'default', children, ...props }) {
  const className = variant === 'ghost' ? 'au-btn au-btn--ghost' : 'au-btn';
  return (
    <button type={type} className={className} {...props}>
      {children}
    </button>
  );
};

window.UI.Card = function Card({ title, subtitle, children }) {
  return (
    <section className="au-card">
      {title ? <h1 className="au-title">{title}</h1> : null}
      {subtitle ? <p className="au-text" style={{ marginBottom: '16px' }}>{subtitle}</p> : null}
      {children}
    </section>
  );
};

window.UI.Input = function Input(props) {
  return <input className="au-input" {...props} />;
};
