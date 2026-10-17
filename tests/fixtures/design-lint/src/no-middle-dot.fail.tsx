export function Fail() {
  return (
    <div>
      <p>Data · 2026</p> {/* expect */}
      <p>Berlin &middot; Germany</p> {/* expect */}
      <p title="A &#183; B">x</p> {/* expect */}
      <p>{'A &#xb7; B'}</p> {/* expect */}
    </div>
  );
}
