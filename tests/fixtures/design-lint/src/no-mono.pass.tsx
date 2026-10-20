export function Pass() {
  return (
    <div>
      <p style={{ fontFamily: 'var(--font-sans)' }}>Sans</p>
      <p style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>Sans</p>
      <code style={{ fontFamily: 'ui-monospace, monospace' }}>code is where monospace belongs</code>
      <pre style={{ fontFamily: 'Menlo' }}>so is pre</pre>
    </div>
  );
}
