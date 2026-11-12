#!/usr/bin/env bash
# Renders the web CV with a private renderer and installs it only after every check passed.
#
#   scripts/cv-sync.sh --renderer ABS --input ABS --output PDF --input-sha256 HEX \
#     --synthetic-docx ABS --synthetic-present ABS --original-renderer ABS --evidence ABS \
#     [--manifest PATH] [--records PATH] [--claims-out ABS] [--lint-only]
#
# --renderer           the private renderer with a --web mode (python3 RENDERER DOCX PDF --web); it
#                      prints its renderer-relative asset files when called with --declare-assets
# --input              the reviewed DOCX to render; its SHA-256 must be --input-sha256
# --output             where the PDF is installed; its metadata goes beside it as <name>.meta.json
# --synthetic-docx     a synthetic DOCX with sensitive test content (a phone number, an address,
#                      residence wording, a link, metadata and page footers)
# --synthetic-present  lines that must survive the web render of the synthetic DOCX
# --original-renderer  the renderer the private one was copied from; non-web output must match it
# --evidence           a private JSON file for the run's evidence: tool versions, hashes, results,
#                      never document text; it must lie outside this repository
# --manifest, --records, --claims-out and --lint-only are passed to scripts/check-web-cv.py for the
# candidate PDF. TRUTH_DENYLIST must be set, as for the checker.
#
# Order: validate every path (exit 2 on usage, 1 on an unreadable file, nothing rendered); copy the
# DOCX and check its hash; snapshot the renderer with its declared assets and hash them; accept the
# snapshot on the synthetic DOCX (the web output passes the checker's text, metadata and link
# checks and keeps the innocuous lines; the non-web output equals the original renderer's and still
# fails those checks); rehash the renderer and its assets; render the DOCX copy with the same
# snapshot; check the candidate; rehash again; only then install the PDF and its metadata.
set -euo pipefail

NAME=cv-sync
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
CHECKER="$HERE/check-web-cv.py"

usage() {
  echo "usage: scripts/$NAME.sh --renderer ABS --input ABS --output PDF --input-sha256 HEX --synthetic-docx ABS" \
    "--synthetic-present ABS --original-renderer ABS --evidence ABS [--manifest PATH] [--records PATH]" \
    "[--claims-out ABS] [--lint-only]" >&2
  exit 2
}
die() {
  echo "$NAME: FAIL $*" >&2
  exit 1
}

renderer='' input='' output='' input_sha='' synthetic='' present='' original='' evidence=''
check_args=()
while [ $# -gt 0 ]; do
  case "$1" in
    --renderer | --input | --output | --input-sha256 | --synthetic-docx | --synthetic-present | \
      --original-renderer | --evidence | --manifest | --records | --claims-out)
      [ $# -ge 2 ] || usage
      case "$1" in
        --renderer) renderer="$2" ;;
        --input) input="$2" ;;
        --output) output="$2" ;;
        --input-sha256) input_sha="$2" ;;
        --synthetic-docx) synthetic="$2" ;;
        --synthetic-present) present="$2" ;;
        --original-renderer) original="$2" ;;
        --evidence) evidence="$2" ;;
        *) check_args+=("$1" "$2") ;;
      esac
      shift 2
      ;;
    --lint-only) check_args+=("$1"); shift ;;
    *) usage ;;
  esac
done

for v in renderer input output input_sha synthetic present original evidence; do
  [ -n "${!v}" ] || usage
done
for v in renderer input synthetic present original evidence; do
  case "${!v}" in /*) ;; *) usage ;; esac
done
[[ "$input_sha" =~ ^[0-9a-f]{64}$ ]] || usage

for pair in "--renderer:$renderer" "--input:$input" "--synthetic-docx:$synthetic" \
  "--synthetic-present:$present" "--original-renderer:$original"; do
  opt="${pair%%:*}" path="${pair#*:}"
  [ -f "$path" ] && [ -r "$path" ] && [ ! -L "$path" ] || die "$opt is not a readable regular file"
done
out_dir="$(cd "$(dirname "$output")" 2>/dev/null && pwd)" || die "--output names a folder that does not exist"
output="$out_dir/$(basename "$output")"
case "$output" in *.pdf) ;; *) die "--output must end in .pdf" ;; esac
meta="${output%.pdf}.meta.json"
case "$evidence/" in "$ROOT"/*) die "--evidence must lie outside this repository" ;; esac
[ -d "$(dirname "$evidence")" ] || die "--evidence names a folder that does not exist"
for tool in python3 pdftotext pdfinfo; do
  command -v "$tool" >/dev/null 2>&1 || die "$tool not found"
done

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# Evidence: written on every exit after this point, pass or fail, never with document text. The
# snapshot is two parallel lists (bash 3.2 has no associative arrays): file names and their SHA-256.
result=fail reason='' candidate_sha='' rendered_at=''
snap_names=()
snap_hashes=()
sha() { python3 -I -c 'import hashlib,sys; print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest())' "$1"; }
write_evidence() {
  local i snap=''
  for ((i = 0; i < ${#snap_names[@]}; i++)); do snap+="${snap_names[$i]}"$'\t'"${snap_hashes[$i]}"$'\n'; done
  EV_RESULT="$result" EV_REASON="$reason" EV_SNAPSHOT="$snap" EV_INPUT="$(sha "$work/input.docx" 2>/dev/null || true)" \
    EV_SYNTHETIC="$(sha "$synthetic")" EV_CHECKER="$(sha "$CHECKER")" EV_CANDIDATE="$candidate_sha" \
    EV_RENDERED="$rendered_at" python3 -I - "$evidence" <<'PY'
import json, os, subprocess, sys
def version(cmd):
    try:
        r = subprocess.run(cmd, capture_output=True, text=True)
        return (r.stdout + r.stderr).strip().splitlines()[0]
    except Exception:
        return "unavailable"
e = os.environ
snapshot = {}
for line in e["EV_SNAPSHOT"].splitlines():
    name, digest = line.split("\t")
    snapshot[name] = digest
data = {
    "result": e["EV_RESULT"],
    "reason": e["EV_REASON"],
    "tools": {"python3": version(["python3", "--version"]), "pdftotext": version(["pdftotext", "-v"]),
              "pdfinfo": version(["pdfinfo", "-v"])},
    "snapshot": snapshot,
    "inputSha256": e["EV_INPUT"],
    "syntheticSha256": e["EV_SYNTHETIC"],
    "checkerSha256": e["EV_CHECKER"],
    "candidatePdfSha256": e["EV_CANDIDATE"],
    "renderedAt": e["EV_RENDERED"],
}
with open(sys.argv[1], "w") as f:
    f.write(json.dumps(data, indent=1) + "\n")
PY
}
fail_ev() {
  reason="$1"
  write_evidence
  die "$1"
}

# 1. The reviewed input, copied once; everything after reads the copy.
cp "$input" "$work/input.docx"
[ "$(sha "$work/input.docx")" = "$input_sha" ] || fail_ev "--input is not the reviewed input (SHA-256 differs)"

# 2. The renderer's declared assets, then a snapshot that keeps their renderer-relative layout.
assets="$(python3 -I "$renderer" --declare-assets 2>/dev/null)" || fail_ev "the renderer does not declare its assets"
rdir="$(dirname "$renderer")"
mkdir "$work/snap"
cp "$renderer" "$work/snap/$(basename "$renderer")"
snap_names+=("$(basename "$renderer")")
snap_hashes+=("$(sha "$renderer")")
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  case "$rel" in /* | *..*) fail_ev "the renderer declares an asset outside its folder" ;; esac
  [ -f "$rdir/$rel" ] && [ ! -L "$rdir/$rel" ] || fail_ev "a declared asset is not a regular file"
  mkdir -p "$work/snap/$(dirname "$rel")"
  cp "$rdir/$rel" "$work/snap/$rel"
  snap_names+=("$rel")
  snap_hashes+=("$(sha "$rdir/$rel")")
done <<<"$assets"
snap="$work/snap/$(basename "$renderer")"

same_hashes() {
  local i n orig
  for ((i = 0; i < ${#snap_names[@]}; i++)); do
    n="${snap_names[$i]}"
    orig="$rdir/$n"
    [ "$i" -eq 0 ] && orig="$renderer"
    [ -f "$orig" ] && [ "$(sha "$orig")" = "${snap_hashes[$i]}" ] && [ "$(sha "$work/snap/$n")" = "${snap_hashes[$i]}" ] || return 1
  done
}
same_hashes || fail_ev "the renderer snapshot does not match its source"

text_of() { pdftotext -layout "$1" - 2>/dev/null; }
render() { # snapshot-or-renderer docx pdf [--web]
  python3 -I "$@" >/dev/null 2>&1
}

# 3. Synthetic acceptance of the snapshot.
cp "$synthetic" "$work/synthetic.docx"
render "$snap" "$work/synthetic.docx" "$work/synthetic-web.pdf" --web ||
  fail_ev "synthetic acceptance failed: the renderer exited with an error in web mode"
[ -s "$work/synthetic-web.pdf" ] || fail_ev "synthetic acceptance failed: no web PDF"
python3 -I "$CHECKER" "$work/synthetic-web.pdf" --lint-only >/dev/null 2>&1 ||
  fail_ev "synthetic acceptance failed: the web output fails the checker's text, metadata or link checks"
web_text="$(text_of "$work/synthetic-web.pdf")" || fail_ev "synthetic acceptance failed: pdftotext"
while IFS= read -r line; do
  [ -n "$line" ] || continue
  python3 -I -c 'import re,sys; c=lambda s: re.sub(r"\s+"," ",s).strip(); sys.exit(0 if c(sys.argv[1]) in c(sys.stdin.read()) else 1)' "$line" <<<"$web_text" ||
    fail_ev "synthetic acceptance failed: an innocuous line is missing from the web output"
done <"$present"
render "$snap" "$work/synthetic.docx" "$work/synthetic-nonweb.pdf" ||
  fail_ev "synthetic acceptance failed: the renderer exited with an error in non-web mode"
render "$original" "$work/synthetic.docx" "$work/synthetic-original.pdf" ||
  fail_ev "synthetic acceptance failed: the original renderer exited with an error"
[ "$(text_of "$work/synthetic-nonweb.pdf")" = "$(text_of "$work/synthetic-original.pdf")" ] ||
  fail_ev "synthetic acceptance failed: the non-web output differs from the original renderer"
if python3 -I "$CHECKER" "$work/synthetic-nonweb.pdf" --lint-only >/dev/null 2>&1; then
  fail_ev "synthetic acceptance failed: the synthetic input does not exercise the web mode"
fi

# 4. Nothing may change between acceptance and the real render.
same_hashes || fail_ev "the renderer or an asset changed after acceptance"
[ "$(sha "$work/input.docx")" = "$input_sha" ] || fail_ev "--input changed after acceptance"

# 5. The real render, with the accepted snapshot, then the candidate check.
render "$snap" "$work/input.docx" "$work/candidate.pdf" --web || fail_ev "the renderer exited with an error on the input"
[ -s "$work/candidate.pdf" ] || fail_ev "the renderer wrote no PDF for the input"
candidate_sha="$(sha "$work/candidate.pdf")"
python3 -I "$CHECKER" "$work/candidate.pdf" --expect-sha256 "$candidate_sha" ${check_args[@]+"${check_args[@]}"} >/dev/null ||
  fail_ev "the candidate PDF failed the checker"
same_hashes || fail_ev "the renderer or an asset changed after acceptance"

# 6. Install: the PDF, then its metadata, each by an atomic rename; then confirm the bytes.
rendered_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cp "$work/candidate.pdf" "$output.tmp.$$"
mv "$output.tmp.$$" "$output"
printf '{\n "sha256": "%s",\n "renderedAt": "%s",\n "web": true\n}\n' "$candidate_sha" "$rendered_at" >"$meta.tmp.$$"
mv "$meta.tmp.$$" "$meta"
[ "$(sha "$output")" = "$candidate_sha" ] || fail_ev "the installed PDF is not the checked candidate"
result=pass
write_evidence
echo "$NAME: installed the checked PDF (sha256 $candidate_sha) and its metadata"
