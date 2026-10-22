export function Fail() {
  return (
    <div>
      <p style={{ boxShadow: '0 1px 4px var(--color-ink)' }}>Card</p> {/* expect */}
      <p style={{ width: 10, textShadow: '1px 1px 2px black' }}>Text</p> {/* expect */}
      <p style={{ filter: 'drop-shadow(0 2px 2px var(--color-ink))' }}>Filter</p> {/* expect */}
      <p style={{ 'box-shadow': shadow }}>Variable</p> {/* expect */}
      <p style={{ boxShadow: `0 1px ${blur}px var(--color-ink)` }}>Template</p> {/* expect */}
    </div>
  );
}
