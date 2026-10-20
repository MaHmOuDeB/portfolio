export function Pass() {
  return (
    <div>
      <svg viewBox="0 0 10 10">
        <rect fill="currentColor" stroke="none" width="10" height="10" />
        <circle fill="transparent" stroke="inherit" r="5" />
        <line stroke="var(--color-line)" />
        <stop stopColor="var(--color-series-1)" />
        <rect fill="url(#fade)" />
      </svg>
      <p style={{ color: 'var(--color-ink)', backgroundColor: 'transparent' }}>Tokens</p>
      <p style={{ border: '1px solid var(--color-line)', width: 4, height: `${h}px` }}>Border</p>
      <p style={{ left: 'tan', width: 'red' }}>Only colour properties are read</p>
      <p className="text-red-500">Class names belong to the compiled CSS pass</p>
    </div>
  );
}
