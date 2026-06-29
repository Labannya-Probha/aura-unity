export function Card({ children, subtitle, title }) {
  return (
    <section className="au-card">
      {title ? <h1 className="au-title">{title}</h1> : null}
      {subtitle ? <p className="au-text au-text--spaced">{subtitle}</p> : null}
      {children}
    </section>
  )
}
