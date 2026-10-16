"""Compares a freshly generated reference file with the committed one.

Usage: uv run --locked check_reference.py COMMITTED FRESH

Exit 0 when the two files agree, 1 when they differ (every difference is printed), 2 on bad usage.
The comparison is numeric, not byte-for-byte, so a last-digit difference from another platform's
math library does not fail CI while a real change in a reference value does:

- the key sets of every object and the lengths of every array must match;
- strings, booleans, null and integers must match exactly (an integer never equals a float);
- floats must agree within 1e-9 relative, or 1e-12 absolute for values near zero.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path
from typing import Any

REL_TOL = 1e-9
ABS_TOL = 1e-12
MAX_REPORTED = 20


def compare(a: Any, b: Any, path: str, problems: list[str]) -> None:
    if isinstance(a, bool) or isinstance(b, bool) or a is None or b is None:
        if type(a) is not type(b) or a != b:
            problems.append(f"{path}: {a!r} != {b!r}")
    elif isinstance(a, dict) and isinstance(b, dict):
        for key in sorted(set(a) | set(b)):
            if key not in a:
                problems.append(f"{path}.{key}: missing from the committed file")
            elif key not in b:
                problems.append(f"{path}.{key}: missing from the fresh file")
            else:
                compare(a[key], b[key], f"{path}.{key}", problems)
    elif isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            problems.append(f"{path}: array length {len(a)} != {len(b)}")
        else:
            for i, (x, y) in enumerate(zip(a, b)):
                compare(x, y, f"{path}[{i}]", problems)
    elif isinstance(a, int) and isinstance(b, int):
        if a != b:
            problems.append(f"{path}: {a} != {b}")
    elif isinstance(a, float) and isinstance(b, float):
        if not math.isclose(a, b, rel_tol=REL_TOL, abs_tol=ABS_TOL):
            problems.append(f"{path}: {a!r} != {b!r}")
    elif isinstance(a, str) and isinstance(b, str):
        if a != b:
            problems.append(f"{path}: {a!r} != {b!r}")
    else:
        problems.append(f"{path}: type {type(a).__name__} != {type(b).__name__} ({a!r} vs {b!r})")


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__, file=sys.stderr)
        return 2
    committed = json.loads(Path(argv[1]).read_text(encoding="utf-8"))
    fresh = json.loads(Path(argv[2]).read_text(encoding="utf-8"))
    problems: list[str] = []
    compare(committed, fresh, "$", problems)
    if problems:
        for line in problems[:MAX_REPORTED]:
            print(line)
        if len(problems) > MAX_REPORTED:
            print(f"... and {len(problems) - MAX_REPORTED} more")
        print(f"reference data differs: {len(problems)} difference(s)")
        return 1
    print("reference data matches")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
