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
export const outbound = 'GitHub ↗'; // expect
export const long = 'Before ⟶ after'; // expect
export const heavy = 'Next ➔'; // expect
export const curved = 'Next ➜'; // expect
export const angle = 'Work › Lab'; // expect
export const double = 'A &rArr; B'; // expect
export const back = '&larr; Back'; // expect
export const numeric = 'Next &#8599;'; // expect
