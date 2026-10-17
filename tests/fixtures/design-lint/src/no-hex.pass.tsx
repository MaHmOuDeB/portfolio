// Comments are never seen: #fff, PR #456.
export function Pass() {
  return (
    <section className="bg-bg text-ink" style={{ color: 'var(--color-ink)' }}>
      <p>Merged in PR #123, see <a href="#add">the add step</a>.</p>
      <p>A dash &#8212; written as an entity.</p>
      <svg viewBox="0 0 10 10">
        <rect fill="url(#fade)" stroke="var(--color-line)" width="10" height="10" />
      </svg>
      <code className="code-block">color: #fff;</code>
    </section>
  );
}
