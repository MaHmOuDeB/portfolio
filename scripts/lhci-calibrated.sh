#!/usr/bin/env bash
# Lighthouse CI on the self-hosted runner, calibrated to GitHub's hosted runner (the lhci job in
# .github/workflows/ci.yml; tests/unit/lhci-calibrated.test.ts).
#
# Lighthouse simulates the throttled CPU by multiplying each main-thread task it measured by
# cpuSlowdownMultiplier, so the multiplier is 4 (Lighthouse's default) x this machine's benchmark
# index / the hosted runner's: GitHub's 35 hosted runs (7 CI runs, 2026-11-10) had a median of 2309,
# the capped lhci job container measured 837.5 (median of 5), and 4 x 837.5 / 2309 = 1.45, so 1.5.
# That only holds while the machine is as fast as when it was measured, so after collecting, the
# median benchmark index of the runs must lie within +/-20% of 837.5 (670-1005,
# scripts/lhci-benchmark-guard.ts). Outside, it collects once more; still outside, it fails as
# "machine too busy to measure", never as a budget failure. The runs, URL and budgets are
# lighthouserc.json's, unchanged. Chromium runs as root in the job container, hence --no-sandbox.
set -euo pipefail

MULTIPLIER=1.5
summary="${GITHUB_STEP_SUMMARY:-/dev/null}"
guard() { node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/lhci-benchmark-guard.ts .lighthouseci; }
collect() {
  rm -rf .lighthouseci
  npx --no-install lhci collect --settings.chromeFlags=--no-sandbox --settings.throttling.cpuSlowdownMultiplier="$MULTIPLIER"
}

if [ -z "${CHROME_PATH:-}" ]; then
  export CHROME_PATH="$(node -e "console.log(require('playwright-core').chromium.executablePath())")"
fi

collect
if ! bi="$(guard)"; then
  echo "lhci: benchmark index ${bi} is outside 670-1005; collecting again in ${LHCI_RETRY_PAUSE:-60} s"
  sleep "${LHCI_RETRY_PAUSE:-60}"
  collect
  if ! bi="$(guard)"; then
    npx --no-install lhci upload
    msg="machine too busy to measure (benchmark index ${bi}, expected 670-1005)"
    echo "$msg" >> "$summary"
    echo "::error::${msg}"
    exit 1
  fi
fi
echo "lhci: benchmark index ${bi} (calibrated band 670-1005, multiplier ${MULTIPLIER})" | tee -a "$summary"
npx --no-install lhci upload
npx --no-install lhci assert
