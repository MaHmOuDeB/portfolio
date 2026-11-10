"""Proves that this machine can turn a PDF into text the way the CV checks do.

    python3 scripts/pdf-extraction-proof.py <pdf> "<expected text>"

Runs `pdftotext -layout` on the PDF and requires its text, without blank lines and surrounding
spaces, to be exactly the expected line. Exits 1 when pdftotext is missing, fails or extracts
anything else, and 2 on wrong usage. CI runs it on tests/fixtures/pdf/synthetic.pdf before the
unit tests, so a runner without python3 or poppler-utils fails there, not later.
"""

import subprocess
import sys

NAME = "pdf-extraction-proof"


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(f'usage: python3 scripts/{NAME}.py <pdf> "<expected text>"', file=sys.stderr)
        return 2
    pdf, expected = argv[1], argv[2]
    try:
        result = subprocess.run(
            ["pdftotext", "-layout", pdf, "-"],
            capture_output=True,
            text=True,
            check=False,
            timeout=60,
        )
    except FileNotFoundError:
        print(f"{NAME}: pdftotext not found (install poppler-utils)", file=sys.stderr)
        return 1
    if result.returncode != 0:
        print(f"{NAME}: pdftotext failed with exit code {result.returncode}", file=sys.stderr)
        return 1
    lines = [line.strip() for line in result.stdout.replace("\f", "\n").splitlines() if line.strip()]
    if lines != [expected]:
        print(f"{NAME}: unexpected text {lines!r}, expected [{expected!r}]", file=sys.stderr)
        return 1
    print(f'{NAME}: extracted "{expected}"')
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
