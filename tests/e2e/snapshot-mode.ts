// How Playwright treats visual baselines. Pure, so a unit test can pin it.
//
// - The `update-baselines` PR label (UPDATE_BASELINES=1) regenerates every baseline.
// - In CI a missing baseline FAILS ('none'): with a retry, 'missing' would fail once, write the
//   file and pass on the retry, so a PR without baselines would go green.
// - Locally a missing baseline is written ('missing'); visual tests are skipped locally anyway.
export function updateSnapshotsMode(env: Readonly<Record<string, string | undefined>>): 'all' | 'none' | 'missing' {
  if (env.UPDATE_BASELINES === '1') return 'all';
  return env.CI ? 'none' : 'missing';
}
