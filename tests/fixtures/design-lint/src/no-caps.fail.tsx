export function Fail() {
  return (
    <div>
      <p style={{ textTransform: 'uppercase' }}>Loud</p> {/* expect */}
      <p style={{ width: 4, textTransform: "UPPERCASE" }}>Loud</p> {/* expect */}
      <p style={{ 'text-transform': 'uppercase' }}>Loud</p> {/* expect */}
    </div>
  );
}
