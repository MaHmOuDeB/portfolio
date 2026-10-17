export function Fail() {
  return (
    <div>
      <p>from ~20 → ~3 min</p> {/* expect */}
      <a href="/work">See the work &rarr;</a> {/* expect */}
      <a href="/lab" aria-label="Lab &#8594;">Lab</a> {/* expect */}
      <button>{'Next →'}</button> {/* expect */}
      <p>{`Next &#x2192;`}</p> {/* expect */}
    </div>
  );
}
export const label = 'Continue →'; // expect
