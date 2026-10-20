export function Fail() {
  return (
    <div>
      <p style={{ fontFamily: 'ui-monospace, monospace' }}>Mono</p> {/* expect */}
      <p style={{ fontFamily: "'SF Mono', Menlo, monospace" }}>Mono</p> {/* expect */}
      <p style={{ fontFamily: 'Consolas' }}>Mono</p> {/* expect */}
      <p style={{ 'font-family': 'var(--font-code)' }}>Mono</p> {/* expect */}
    </div>
  );
}
