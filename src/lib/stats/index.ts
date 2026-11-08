/**
 * Public API of the statistics library. Dependency-free, deterministic and safe to import from
 * the browser, the server and build scripts. Every public runtime name is re-exported explicitly
 * (no `export *`), so internals such as the argument guards and the OBF table stay private.
 */
export { normalCdf, normalPdf, normalQuantile } from './normal';
export { binomial, sfc32, type Rng } from './rng';
export {
  newcombeDiff,
  srmTest,
  wilson,
  zTestTwoProportions,
  type Counts,
  type Interval,
} from './proportions';
export {
  SAMPLE_SIZE_FORMULA,
  cohensH,
  detectableEffect,
  detectableEffectCs,
  durationWeeks,
  sampleSizePerArm,
  type MdeType,
  type PlanInput,
} from './power';
export { retrodesign, type RetrodesignInput, type RetrodesignResult } from './retrodesign';
export { mixtureCs, mixtureRatio, obfBoundary, obfConstant, optimalTau2 } from './sequential';
export { simulatePeeking, type PeekInput, type PeekMethod, type PeekResult } from './peeking';
