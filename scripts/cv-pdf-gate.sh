#!/usr/bin/env bash
# The actual-PDF check of the web CV, in its reserved, checker-only mode (the CV PDF check job in
# .github/workflows/ci.yml).
#
#   bash scripts/cv-pdf-gate.sh
#
# Every run writes to the job summary, and prints to the log, what it looked at: the checked-out
# commit (git rev-parse HEAD) and its tree (git rev-parse HEAD^{tree}), the pull request's head and
# base when CI passes them (PR_HEAD_SHA, PR_BASE_SHA), and the SHA-256 of the CV checker, its claim
# manifest and the PDF, or "absent" for each file that is not in the tree.
#
# With no PDF in the tree it passes and says the actual-PDF check did not run. The check of a real
# PDF is not active yet: it arrives together with the PDF, and then needs the checker and the
# TRUTH_DENYLIST secret, which the workflow already gives to this step alone. Until then a PDF in
# the tree fails here, so it can never ship unchecked. This script never reads the deny-list.
set -euo pipefail

checker=scripts/check-web-cv.py
manifest=scripts/cv/claim-layout.json
pdf=public/cv.pdf
summary="${GITHUB_STEP_SUMMARY:?GITHUB_STEP_SUMMARY is not set}"

sha256_or_absent() {
  if [ -f "$1" ]; then
    sha256sum -- "$1" | cut -d' ' -f1
  else
    echo absent
  fi
}

head="$(git rev-parse HEAD)"
tree="$(git rev-parse 'HEAD^{tree}')"

{
  echo "## CV PDF check"
  echo
  echo "- HEAD (git rev-parse HEAD): ${head}"
  echo "- Tree (git rev-parse HEAD^{tree}): ${tree}"
  if [ -n "${PR_HEAD_SHA:-}" ]; then echo "- Pull request head: ${PR_HEAD_SHA}"; fi
  if [ -n "${PR_BASE_SHA:-}" ]; then echo "- Pull request base: ${PR_BASE_SHA}"; fi
  echo "- SHA-256 of ${checker}: $(sha256_or_absent "$checker")"
  echo "- SHA-256 of ${manifest}: $(sha256_or_absent "$manifest")"
  echo "- SHA-256 of ${pdf}: $(sha256_or_absent "$pdf")"
} | tee -a "$summary"

if [ -e "$pdf" ]; then
  echo "::error::${pdf} is in the tree but the actual-PDF check is not active; the PDF must arrive together with that check." >&2
  exit 1
fi

echo "- Mode: checker-only (no PDF in the tree); the actual-PDF check did not run" | tee -a "$summary"
