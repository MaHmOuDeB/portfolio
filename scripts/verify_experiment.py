#!/usr/bin/env python3
"""Check the live experiment's published results yourself.

    python3 scripts/verify_experiment.py data.json
    python3 scripts/verify_experiment.py data.json --reference stats-ref/reference.json
    python3 scripts/verify_experiment.py data.json --json

`data.json` is the file the site publishes at /experiment/data.json (schema `experiment-data/1`).
The script recomputes, from the published counts alone, what the pre-registration
(docs/experiment/prereg.md) says the site computes: the mixing variances, the split check, the
confidence-sequence intervals over the cumulative daily looks, the decision or the A/A rule, the
intention-to-treat rates and the detectable effect. It uses the Python standard library only, makes
no network request and imports nothing from the site, so it is an independent second implementation
of the published formulas.

What it cannot do, and says so per check:
- A count from 1 to 4 is published as "<5". Where a check depends on such a cell, the script tries
  every value the cell may hold (1 to 4, and never less than an earlier look's running total). The
  check passes only when every allowed value gives the published result, fails when none does, and
  is indeterminate otherwise. It never prints the values it tries and never uses a published
  interval to narrow them down: hidden counts are not recovered.
- While the data are blinded, no outcome is published, so no interval can be recomputed.
- A look the analysis stopped at for a data fault, and any look after a decision, is not published.

`--reference` first recomputes the frozen reference values in stats-ref/reference.json (generated
with scipy and statsmodels) that the formulas here can reproduce, so a reader can see the
implementation agrees with them before trusting it.

Exit status: 0 when nothing disagrees (some checks may be indeterminate, each with its reason);
1 when a recomputed value disagrees with the published one (beyond 1e-8) or a published rule is
broken; 2 when the file cannot be read or is not valid `experiment-data/1` (including any
non-finite number).
"""
from __future__ import annotations

import argparse
import json
import math
import re
import sys
from datetime import date, datetime, timedelta
from itertools import product
from statistics import NormalDist

VERIFIER = "experiment-verifier/1"
SCHEMA = "experiment-data/1"
SMALL = "<5"
SMALL_VALUES = (1, 2, 3, 4)
TOLERANCE = 1e-8
# The most combinations of "<5" values a check tries before it gives up as indeterminate.
MAX_COMPLETIONS = 20000
MAX_COUNT = 2**50
# At the planned end, counting stops; the last day is read a minute after the end.
END_MARGIN = timedelta(seconds=60)

LIVE_PHASES = ("before-data", "calibration", "aa-failed", "ab", "inconclusive", "ship-b", "stop-for-harm", "srm-suppressed")
REJECT_REASONS = ("bot", "internal", "self", "forced", "not_entry", "rate_limited", "ceiling")
OUTCOME_KEYS = ("engaged", "card", "secondary")
EXPOSURE_KEYS = ("entry", "inview")

SMALL_REASON = 'every allowed value of the "<5" cells'
SOME_REASON = 'the allowed values of the "<5" cells give different results, so it cannot be recomputed exactly'
NONE_REASON = 'no allowed value of the "<5" cells gives the published value'


class Invalid(Exception):
    """The payload is not valid published data."""


# ---------------------------------------------------------------------------------------------
# Statistics: the pre-registered formulas, written out from the pre-registration.
# ---------------------------------------------------------------------------------------------


def mixture_ratio(alpha: float) -> float:
    """r* = tau^2 / V that makes the mixture interval narrowest: the root of r = -2 ln(alpha) + ln(1 + r).

    g(r) = r - c - ln(1 + r) is negative at r = c and positive at r = 2c + 2, and increasing between,
    so bisection to the last representable bracket finds the root.
    """
    c = -2.0 * math.log(alpha)
    lo, hi = c, 2.0 * c + 2.0
    for _ in range(4000):
        mid = (lo + hi) / 2.0
        if mid <= lo or mid >= hi:
            break
        if mid - c - math.log1p(mid) < 0:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2.0


def optimal_tau2(baseline: float, n_cap: float, alpha: float) -> float:
    """The mixing variance tuned to be narrowest at n_cap views per group at the baseline rate."""
    return mixture_ratio(alpha) * 2.0 * baseline * (1.0 - baseline) / n_cap


def mixture_interval(xa: int, na: int, xb: int, nb: int, tau2: float, alpha: float) -> tuple:
    """The normal-mixture confidence sequence for pB - pA: (estimate, lower, upper).

    Each group's variance uses the floored rate p = (x + 0.5) / (n + 1); the half-width is
    sqrt(V (V + tau2) / tau2 * (2 ln(1 / alpha) + ln((V + tau2) / V))).
    """

    def variance(x: int, n: int) -> float:
        return ((x + 0.5) / (n + 1)) * ((n - x + 0.5) / (n + 1)) / n

    v = variance(xa, na) + variance(xb, nb)
    ratio = tau2 / v
    log_term = math.log1p(ratio) if math.isfinite(ratio) else math.log(tau2) - math.log(v)
    half = math.sqrt(v * (1.0 + v / tau2) * (-2.0 * math.log(alpha) + log_term))
    estimate = xb / nb - xa / na
    return (estimate, estimate - half, estimate + half)


def split_check(na: int, nb: int) -> tuple:
    """Chi-square against a 50/50 split with one degree of freedom: (chi2, p)."""
    total = na + nb
    chi2 = (na - nb) ** 2 / total
    return chi2, math.erfc(math.sqrt(chi2 / 2.0))


def detectable_effect(n: float, baseline: float, tau2: float, alpha: float, power: float):
    """The smallest rise d over the baseline that the interval at n per group excludes 0 with the
    given power, at one look: the first d in (0, 1 - baseline] with d - halfwidth(V) - z(power) sqrt(V) >= 0,
    V = (b (1 - b) + p2 (1 - p2)) / n. None when no such d exists.
    """
    z = NormalDist().inv_cdf(power)
    c = -2.0 * math.log(alpha)

    def f(d: float) -> float:
        p2 = baseline + d
        v = (baseline * (1.0 - baseline) + p2 * (1.0 - p2)) / n
        ratio = tau2 / v
        log_term = math.log1p(ratio) if math.isfinite(ratio) else math.log(tau2) - math.log(v)
        return d - math.sqrt(v * (1.0 + v / tau2) * (c + log_term)) - z * math.sqrt(v)

    top = 1.0 - baseline
    steps = 10000
    previous = 0.0
    for i in range(1, steps + 1):
        d = top * i / steps
        if f(d) >= 0:
            lo, hi = previous, d
            for _ in range(4000):
                mid = (lo + hi) / 2.0
                if mid <= lo or mid >= hi:
                    break
                if f(mid) >= 0:
                    hi = mid
                else:
                    lo = mid
            return hi
        previous = d
    return None


def close(a: float, b: float) -> bool:
    return abs(a - b) <= TOLERANCE


# ---------------------------------------------------------------------------------------------
# Reading and validating the file.
# ---------------------------------------------------------------------------------------------


def load_json(path: str):
    def constant(name: str):
        raise Invalid(f"non-finite number {name}")

    def number(text: str) -> float:
        value = float(text)
        if not math.isfinite(value):
            raise Invalid(f"non-finite number {text}")
        return value

    try:
        with open(path, encoding="utf-8") as f:
            text = f.read()
    except OSError as e:
        raise Invalid(f"cannot read the file: {e.strerror}") from None
    try:
        return json.loads(text, parse_constant=constant, parse_float=number)
    except json.JSONDecodeError as e:
        raise Invalid(f"not valid JSON: {e.msg} at line {e.lineno}") from None


def is_number(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def is_count(v) -> bool:
    return isinstance(v, int) and not isinstance(v, bool) and 0 <= v <= MAX_COUNT


def is_cell(v) -> bool:
    return v == SMALL or is_count(v)


DAY = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def is_day(v) -> bool:
    if not isinstance(v, str) or not DAY.match(v):
        return False
    try:
        date.fromisoformat(v)
    except ValueError:
        return False
    return True


def instant(v):
    """An ISO date-time with an offset, or None."""
    if not isinstance(v, str):
        return None
    text = v[:-1] + "+00:00" if v.endswith("Z") else v
    try:
        t = datetime.fromisoformat(text)
    except ValueError:
        return None
    return t if t.tzinfo is not None else None


class Validator:
    def __init__(self) -> None:
        self.errors: list = []

    def err(self, path: str, message: str) -> None:
        self.errors.append(f"{path}: {message}")

    def obj(self, v, path: str, keys) -> bool:
        if not isinstance(v, dict):
            self.err(path, "must be an object")
            return False
        ok = True
        for k in keys:
            if k not in v:
                self.err(path, f"missing {k}")
                ok = False
        return ok

    def number(self, v, path: str, lo=None, hi=None, open_lo=False, open_hi=False) -> None:
        if not is_number(v):
            self.err(path, "must be a finite number")
            return
        if lo is not None and (v <= lo if open_lo else v < lo):
            self.err(path, "out of range")
        if hi is not None and (v >= hi if open_hi else v > hi):
            self.err(path, "out of range")

    def count(self, v, path: str, minimum: int = 0) -> None:
        if not is_count(v) or v < minimum:
            self.err(path, f"must be a whole number of at least {minimum}")

    def cell(self, v, path: str) -> None:
        if not is_cell(v):
            self.err(path, 'must be a whole number or "<5"')

    def one_of(self, v, path: str, values) -> None:
        if v not in values:
            self.err(path, f"must be one of {', '.join('null' if x is None else str(x) for x in values)}")

    def day(self, v, path: str, nullable: bool = False) -> None:
        if v is None and nullable:
            return
        if not is_day(v):
            self.err(path, "must be a YYYY-MM-DD day")

    def when(self, v, path: str, nullable: bool = False) -> None:
        if v is None and nullable:
            return
        if instant(v) is None:
            self.err(path, "must be an ISO date-time with an offset")

    def counts(self, v, path: str) -> None:
        if not self.obj(v, path, EXPOSURE_KEYS):
            return
        for k, x in v.items():
            if k not in EXPOSURE_KEYS + OUTCOME_KEYS:
                self.err(f"{path}.{k}", "is not a published count")
            else:
                self.cell(x, f"{path}.{k}")

    def look(self, v, path: str) -> None:
        if not self.obj(v, path, ("day", "a", "b")):
            return
        self.day(v["day"], f"{path}.day")
        self.counts(v["a"], f"{path}.a")
        self.counts(v["b"], f"{path}.b")

    def interval(self, v, path: str) -> None:
        if v is None:
            return
        if not self.obj(v, path, ("estimate", "lower", "upper")):
            return
        for k in ("estimate", "lower", "upper"):
            self.number(v[k], f"{path}.{k}")
        if is_number(v["lower"]) and is_number(v["upper"]) and not v["lower"] < v["upper"]:
            self.err(path, "lower must be below upper")


def validate(d) -> list:
    """Every way the payload departs from the published schema, as a list of messages."""
    V = Validator()
    top = (
        "schema namespace configPhase status prereg readAt source unavailable notes config blinded funnel srm looks current "
        "primary guardrail finalDescriptive decision decidedOn frozenAt plannedEnd plannedEndKind bandConflictOn "
        "inconsistentOn held ceilingDays calibration detectable"
    ).split()
    if not V.obj(d, "$", ()):
        return V.errors
    if d.get("schema") != SCHEMA:
        V.err("$.schema", f"must be {SCHEMA}")
        return V.errors
    if not V.obj(d, "$", top):
        return V.errors
    if not isinstance(d["namespace"], str):
        V.err("$.namespace", "must be a string")
    V.one_of(d["configPhase"], "$.configPhase", ("calibration", "ab"))
    V.one_of(d["status"], "$.status", LIVE_PHASES)
    if V.obj(d["prereg"], "$.prereg", ("version", "tag", "commit", "configSha256")):
        p = d["prereg"]
        for k in ("version", "tag"):
            if not isinstance(p[k], str):
                V.err(f"$.prereg.{k}", "must be a string")
        if p["commit"] is not None and not isinstance(p["commit"], str):
            V.err("$.prereg.commit", "must be a string or null")
        if not (isinstance(p["configSha256"], str) and re.fullmatch(r"[0-9a-f]{64}", p["configSha256"])):
            V.err("$.prereg.configSha256", "must be 64 lowercase hex digits")
    V.when(d["readAt"], "$.readAt")
    V.one_of(d["source"], "$.source", ("store", "local", "fixture", "unavailable"))
    V.one_of(d["unavailable"], "$.unavailable", (None, "not-started", "unreadable"))
    if not (isinstance(d["notes"], list) and all(isinstance(n, str) for n in d["notes"])):
        V.err("$.notes", "must be a list of strings")

    c = d["config"]
    keys = "alpha power srmFlagP minPerGroup capPerArm entryCapPerArm ab calibration guardrail cardsInView dailyEntryCeiling planningBaselines TAU2".split()
    if V.obj(c, "$.config", keys):
        for k in ("alpha", "power", "srmFlagP"):
            V.number(c[k], f"$.config.{k}", 0, 1, True, True)
        for k in ("minPerGroup", "capPerArm", "entryCapPerArm", "dailyEntryCeiling"):
            V.count(c[k], f"$.config.{k}", 1)
        if V.obj(c["ab"], "$.config.ab", ("capMonths",)):
            V.count(c["ab"]["capMonths"], "$.config.ab.capMonths", 1)
        if V.obj(c["calibration"], "$.config.calibration", ("minDays", "minAnalysedViews")):
            V.count(c["calibration"]["minDays"], "$.config.calibration.minDays", 1)
            V.count(c["calibration"]["minAnalysedViews"], "$.config.calibration.minAnalysedViews", 1)
        if V.obj(c["guardrail"], "$.config.guardrail", ("quickExitSeconds", "marginPp")):
            V.number(c["guardrail"]["quickExitSeconds"], "$.config.guardrail.quickExitSeconds", 0)
            V.number(c["guardrail"]["marginPp"], "$.config.guardrail.marginPp", 0, 100, True)
        if V.obj(c["planningBaselines"], "$.config.planningBaselines", ("primary", "guardrail")):
            for k in ("primary", "guardrail"):
                V.number(c["planningBaselines"][k], f"$.config.planningBaselines.{k}", 0, 1, True, True)
        if V.obj(c["TAU2"], "$.config.TAU2", ("primary", "guardrail")):
            for k in ("primary", "guardrail"):
                V.number(c["TAU2"][k], f"$.config.TAU2.{k}", 0, None, True)
        if not isinstance(c["cardsInView"], dict):
            V.err("$.config.cardsInView", "must be an object")

    if not isinstance(d["blinded"], bool):
        V.err("$.blinded", "must be true or false")
    if V.obj(d["funnel"], "$.funnel", ("excluded",)) and V.obj(d["funnel"]["excluded"], "$.funnel.excluded", REJECT_REASONS):
        for r in REJECT_REASONS:
            V.cell(d["funnel"]["excluded"][r], f"$.funnel.excluded.{r}")

    s = d["srm"]
    if V.obj(s, "$.srm", ("assignment", "analysed", "firstFlaggedOn", "flaggedBase", "flaggedLook", "afterDecision")):
        for k in ("assignment", "analysed"):
            r = s[k]
            if r is not None and V.obj(r, f"$.srm.{k}", ("chi2", "flagged")):
                if r["chi2"] is not None:
                    V.number(r["chi2"], f"$.srm.{k}.chi2", 0)
                if not isinstance(r["flagged"], bool):
                    V.err(f"$.srm.{k}.flagged", "must be true or false")
        V.day(s["firstFlaggedOn"], "$.srm.firstFlaggedOn", True)
        V.one_of(s["flaggedBase"], "$.srm.flaggedBase", (None, "entry", "analysed", "both"))
        if s["flaggedLook"] is not None:
            V.look(s["flaggedLook"], "$.srm.flaggedLook")
        if not isinstance(s["afterDecision"], bool):
            V.err("$.srm.afterDecision", "must be true or false")

    if isinstance(d["looks"], list):
        for i, look in enumerate(d["looks"]):
            V.look(look, f"$.looks[{i}]")
    else:
        V.err("$.looks", "must be a list")
    if V.obj(d["current"], "$.current", ("a", "b")):
        for arm in ("a", "b"):
            g = d["current"][arm]
            if V.obj(g, f"$.current.{arm}", EXPOSURE_KEYS):
                for k, x in g.items():
                    if k not in EXPOSURE_KEYS:
                        V.err(f"$.current.{arm}.{k}", "is not a published exposure")
                    else:
                        V.cell(x, f"$.current.{arm}.{k}")
    V.interval(d["primary"], "$.primary")
    V.interval(d["guardrail"], "$.guardrail")
    if "itt" in d and d["itt"] is not None and V.obj(d["itt"], "$.itt", ("a", "b")):
        V.number(d["itt"]["a"], "$.itt.a", 0, 1)
        V.number(d["itt"]["b"], "$.itt.b", 0, 1)
    fd = d["finalDescriptive"]
    if fd is not None and V.obj(fd, "$.finalDescriptive", ("day", "a", "b")):
        V.day(fd["day"], "$.finalDescriptive.day")
        for arm in ("a", "b"):
            if V.obj(fd[arm], f"$.finalDescriptive.{arm}", ("cv", "contact")):
                V.cell(fd[arm]["cv"], f"$.finalDescriptive.{arm}.cv")
                V.cell(fd[arm]["contact"], f"$.finalDescriptive.{arm}.contact")
    V.one_of(d["decision"], "$.decision", (None, "ship-b", "stop-for-harm", "inconclusive"))
    V.when(d["decidedOn"], "$.decidedOn", True)
    V.day(d["frozenAt"], "$.frozenAt", True)
    if "closureMismatch" in d and d["closureMismatch"] is not True:
        V.err("$.closureMismatch", "must be true when present")
    V.when(d["plannedEnd"], "$.plannedEnd")
    V.one_of(d["plannedEndKind"], "$.plannedEndKind", ("fixed", "earliest"))
    V.day(d["bandConflictOn"], "$.bandConflictOn", True)
    V.day(d["inconsistentOn"], "$.inconsistentOn", True)
    if d["held"] is not None and V.obj(d["held"], "$.held", ("on", "reason")):
        V.day(d["held"]["on"], "$.held.on")
        V.one_of(d["held"]["reason"], "$.held.reason", ("band-conflict", "inconsistent-counts"))
    if isinstance(d["ceilingDays"], list):
        for i, x in enumerate(d["ceilingDays"]):
            V.day(x, f"$.ceilingDays[{i}]")
    else:
        V.err("$.ceilingDays", "must be a list")
    cal = d["calibration"]
    if cal is not None and V.obj(cal, "$.calibration", ("days", "srmPassed", "intervalContainsZero", "evaluatedOn", "ready", "failed")):
        V.count(cal["days"], "$.calibration.days")
        for k in ("srmPassed", "ready"):
            if not isinstance(cal[k], bool):
                V.err(f"$.calibration.{k}", "must be true or false")
        if cal["intervalContainsZero"] is not None and not isinstance(cal["intervalContainsZero"], bool):
            V.err("$.calibration.intervalContainsZero", "must be true, false or null")
        V.day(cal["evaluatedOn"], "$.calibration.evaluatedOn", True)
        f = cal["failed"]
        if f is not None and V.obj(f, "$.calibration.failed", ("day", "reason")):
            V.day(f["day"], "$.calibration.failed.day")
            V.one_of(f["reason"], "$.calibration.failed.reason", ("srm", "interval-excludes-zero", "data-fault"))
    det = d["detectable"]
    if V.obj(det, "$.detectable", ("baseline", "power", "tau2", "looks", "points", "atCurrent", "atCurrentNote")):
        V.number(det["baseline"], "$.detectable.baseline", 0, 1, True, True)
        V.number(det["power"], "$.detectable.power", 0, 1, True, True)
        V.number(det["tau2"], "$.detectable.tau2", 0, None, True)
        if isinstance(det["points"], list):
            for i, pt in enumerate(det["points"]):
                if V.obj(pt, f"$.detectable.points[{i}]", ("nPerArm", "effect")):
                    V.count(pt["nPerArm"], f"$.detectable.points[{i}].nPerArm", 1)
                    V.number(pt["effect"], f"$.detectable.points[{i}].effect", 0)
        else:
            V.err("$.detectable.points", "must be a list")
        if det["atCurrent"] is not None:
            V.number(det["atCurrent"], "$.detectable.atCurrent", 0)
        V.one_of(det["atCurrentNote"], "$.detectable.atCurrentNote", (None, "no-views", "small-cell", "beyond-range"))
    return V.errors


# ---------------------------------------------------------------------------------------------
# Cells and their allowed values.
# ---------------------------------------------------------------------------------------------


def options(c) -> tuple:
    """The values a published cell may hold."""
    return SMALL_VALUES if c == SMALL else (c,)


def bounds(c) -> tuple:
    return (1, 4) if c == SMALL else (c, c)


def exact(*cells) -> bool:
    return all(c != SMALL for c in cells)


def running_totals(cells: list):
    """Every assignment of the "<5" cells in a list of running totals that never goes down."""
    out = []

    def walk(i: int, floor: int, acc: tuple) -> None:
        if len(out) > MAX_COMPLETIONS:
            return
        if i == len(cells):
            out.append(acc)
            return
        for v in options(cells[i]):
            if v >= floor:
                walk(i + 1, v, acc + (v,))

    walk(0, 0, ())
    return out


def verdict(results, matches):
    """'pass' when every allowed value gives the published result, 'fail' when none does, else
    'indeterminate'. `results` is a non-empty list of recomputed results."""
    hits = [matches(r) for r in results]
    if not hits:
        return "fail"
    if all(hits):
        return "pass"
    if not any(hits):
        return "fail"
    return "indeterminate"


def check(checks: list, cid: str, result: str, reason: str) -> None:
    checks.append({"id": cid, "result": result, "reason": reason})


def fmt(x: float) -> str:
    return f"{x:.10g}"


# ---------------------------------------------------------------------------------------------
# The checks on published data.
# ---------------------------------------------------------------------------------------------


class Data:
    def __init__(self, d: dict) -> None:
        self.d = d
        c = d["config"]
        self.alpha = c["alpha"]
        self.min_per_group = c["minPerGroup"]
        self.margin = c["guardrail"]["marginPp"] / 100.0
        self.flag_p = c["srmFlagP"]
        self.tau2_primary = c["TAU2"]["primary"]
        self.tau2_guardrail = c["TAU2"]["guardrail"]
        self.looks = d["looks"]
        self.ab = d["configPhase"] == "ab"
        self.placeholder = d["source"] == "unavailable"

    def below_min(self, c) -> object:
        """True, False, or None when a "<5" cell could be on either side of the minimum."""
        lo, hi = bounds(c)
        if hi < self.min_per_group:
            return True
        if lo >= self.min_per_group:
            return False
        return None

    @staticmethod
    def inconsistent(look) -> bool:
        """True when a look's counts break an event's dependency whatever its "<5" cells hold."""
        for arm in ("a", "b"):
            g = look[arm]
            for small, big in (("inview", "entry"), ("card", "inview"), ("engaged", "entry")):
                if small in g and bounds(g[small])[0] > bounds(g[big])[1]:
                    return True
        return False

    def evaluated(self, look) -> object:
        """Whether a look is analysed (both groups at the minimum, counts consistent)."""
        if self.inconsistent(look):
            return False
        below = [self.below_min(look[arm]["inview"]) for arm in ("a", "b")]
        if True in below:
            return False
        if None in below:
            return None
        return True

    def flag_options(self, look) -> set:
        """The split-check outcomes a look may have: a set of (entry flagged, analysed flagged)."""
        out = set()
        entry = {self.flagged(a, b) for a in options(look["a"]["entry"]) for b in options(look["b"]["entry"])}
        inview = {self.flagged(a, b) for a in options(look["a"]["inview"]) for b in options(look["b"]["inview"])}
        for e in entry:
            for i in inview:
                out.add((e, i))
        return out

    def flagged(self, na: int, nb: int) -> bool:
        if na + nb == 0:
            return False
        return split_check(na, nb)[1] < self.flag_p


def intersect(band, own):
    """The running intersection; a look that would empty it is a conflict (a data fault)."""
    if band is None:
        return own, False
    lower = max(band[1], own[1])
    upper = min(band[2], own[2])
    if lower >= upper:
        return (own[0], band[1], band[2]), True
    return (own[0], lower, upper), False


def excludes_zero(i) -> bool:
    return i[1] > 0 or i[2] < 0


def band_history(data: Data, idx: list, kind: str):
    """For each allowed assignment of the outcome cells at the evaluated looks `idx`: the running
    band at each of them, as a list of (own interval, band, conflict). Returns (histories, complete);
    complete is False when there were too many assignments to try."""
    looks = data.looks
    if kind == "primary":
        key, tau2 = "card", data.tau2_primary
    else:
        key, tau2 = "engaged", data.tau2_guardrail
    series = {arm: running_totals([looks[k][arm][key] for k in idx]) for arm in ("a", "b")}
    if len(series["a"]) * len(series["b"]) > MAX_COMPLETIONS:
        return [], False
    histories = []
    for sa, sb in product(series["a"], series["b"]):
        band = None
        history = []
        for j, k in enumerate(idx):
            look = looks[k]
            na, nb = look["a"]["inview"], look["b"]["inview"]
            if kind == "primary":
                own = mixture_interval(sa[j], na, sb[j], nb, tau2, data.alpha)
            else:
                ea, eb = look["a"]["entry"], look["b"]["entry"]
                own = mixture_interval(ea - sa[j], ea, eb - sb[j], eb, tau2, data.alpha)
            band, conflict = intersect(band, own)
            history.append((own, band, conflict))
        histories.append(history)
    return histories, True


def evaluated_indices(data: Data):
    """The indices of the evaluated looks, or None when a look's status depends on a "<5" cell."""
    idx = []
    for k, look in enumerate(data.looks):
        e = data.evaluated(look)
        if e is None:
            return None
        if e:
            idx.append(k)
    return idx


def outcomes_ready(data: Data, idx: list) -> bool:
    return all(all(key in data.looks[k][arm] for arm in ("a", "b")) for k in idx for key in ("card", "engaged"))


def check_small_cells(d: dict, checks: list) -> None:
    places = []
    for i, look in enumerate(d["looks"]):
        places.append((f"looks[{i}]", look))
    if d["srm"]["flaggedLook"] is not None:
        places.append(("srm.flaggedLook", d["srm"]["flaggedLook"]))
    bad = []
    for name, look in places:
        for arm in ("a", "b"):
            for k, v in look[arm].items():
                if isinstance(v, int) and 1 <= v <= 4:
                    bad.append(f"{name}.{arm}.{k}")
    for arm in ("a", "b"):
        for k, v in d["current"][arm].items():
            if isinstance(v, int) and 1 <= v <= 4:
                bad.append(f"current.{arm}.{k}")
    for r, v in d["funnel"]["excluded"].items():
        if isinstance(v, int) and 1 <= v <= 4:
            bad.append(f"funnel.excluded.{r}")
    fd = d["finalDescriptive"]
    if fd is not None:
        for arm in ("a", "b"):
            for k, v in fd[arm].items():
                if isinstance(v, int) and 1 <= v <= 4:
                    bad.append(f"finalDescriptive.{arm}.{k}")
    if bad:
        check(checks, "small-cells", "fail", "a count from 1 to 4 is printed instead of \"<5\" at " + ", ".join(bad))
    else:
        check(checks, "small-cells", "pass", 'every published count is 0, at least 5, or "<5"')


def check_no_p_values(d: dict, checks: list) -> None:
    found = []

    def walk(v, path: str) -> None:
        if isinstance(v, dict):
            for k, x in v.items():
                if k == "p" or re.fullmatch(r"p[-_]?values?", k, re.IGNORECASE):
                    found.append(f"{path}.{k}")
                walk(x, f"{path}.{k}")
        elif isinstance(v, list):
            for i, x in enumerate(v):
                walk(x, f"{path}[{i}]")

    walk(d, "$")
    if found:
        check(checks, "no-p-values", "fail", "a p-value is published at " + ", ".join(found))
    else:
        check(checks, "no-p-values", "pass", "no p-value is published")


def check_looks(data: Data, checks: list) -> None:
    looks = data.looks
    days = [look["day"] for look in looks]
    problems = []
    if any(b <= a for a, b in zip(days, days[1:])):
        problems.append("the look days are not in strictly increasing order")
    # Each published count is a running total: it can stay or grow, never fall. Feasible when the
    # "<5" cells can be filled so that it never falls.
    for arm in ("a", "b"):
        for key in EXPOSURE_KEYS + OUTCOME_KEYS:
            seq = [look[arm][key] for look in looks if key in look[arm]]
            if key in EXPOSURE_KEYS:
                seq.append(data.d["current"][arm][key])
            floor = 0
            for c in seq:
                lo, hi = bounds(c)
                floor = max(floor, lo)
                if floor > hi:
                    problems.append(f"group {arm.upper()}'s {key} count goes down")
                    break
    if problems:
        check(checks, "looks-cumulative", "fail", "; ".join(problems))
    elif not looks:
        check(checks, "looks-cumulative", "not-applicable", "no look is published yet")
    else:
        check(checks, "looks-cumulative", "pass", f"{len(looks)} looks; each count is a running total that never goes down, and today's counts are at least the last look's")

    # Within a look: card clicks <= analysed views <= entry views, engaged views <= entry views.
    always, never = True, False
    for look in looks:
        for arm in ("a", "b"):
            g = look[arm]
            pairs = [("inview", "entry")]
            if "card" in g:
                pairs.append(("card", "inview"))
            if "engaged" in g:
                pairs.append(("engaged", "entry"))
            for small, big in pairs:
                lo_small, hi_small = bounds(g[small])
                lo_big, hi_big = bounds(g[big])
                if lo_small > hi_big:
                    never = True
                elif hi_small > lo_big:
                    always = False
    if never:
        check(checks, "looks-consistent", "fail", "a published look has more card clicks than analysed views, or more analysed or engaged views than entry views")
    elif not looks:
        check(checks, "looks-consistent", "not-applicable", "no look is published yet")
    elif always:
        check(checks, "looks-consistent", "pass", "in every look, card clicks <= analysed views <= entry views and engaged views <= entry views")
    else:
        check(checks, "looks-consistent", "indeterminate", "the order of counts within a look holds for some allowed values of its \"<5\" cells but cannot be confirmed for all")

    ceiling = set(data.d["ceilingDays"])
    clash = [day for day in days if day in ceiling]
    if clash:
        check(checks, "ceiling-days", "fail", "a day that reached the daily ceiling feeds a look: " + ", ".join(clash))
    elif ceiling:
        check(checks, "ceiling-days", "pass", "no day that reached the daily ceiling feeds a look")
    else:
        check(checks, "ceiling-days", "pass", "no day reached the daily ceiling")


def check_outcomes_withheld(data: Data, checks: list) -> None:
    d = data.d
    problems = []
    places = [(f"look {look['day']}", look) for look in data.looks]
    if d["srm"]["flaggedLook"] is not None:
        places.append(("the flagged look", d["srm"]["flaggedLook"]))
    for name, look in places:
        present = [key in look[arm] for arm in ("a", "b") for key in OUTCOME_KEYS]
        below = [data.below_min(look[arm]["inview"]) for arm in ("a", "b")]
        if any(present) and not all(present):
            problems.append(f"{name} publishes only some outcomes")
        elif all(present) and (d["blinded"] or True in below):
            problems.append(f"{name} publishes outcomes while blinded or below the minimum")
        elif not any(present) and not d["blinded"] and below == [False, False]:
            problems.append(f"{name} withholds outcomes that should be published")
    if d["blinded"]:
        if d["primary"] is not None or d["guardrail"] is not None:
            problems.append("an interval is published while blinded")
        if "itt" in d:
            problems.append("the intention-to-treat rates are published while blinded")
        if d["finalDescriptive"] is not None:
            problems.append("final CV and contact counts are published while blinded")
    if problems:
        check(checks, "outcomes-withheld", "fail", "; ".join(problems))
    else:
        check(checks, "outcomes-withheld", "pass", f"outcomes appear only in looks with at least {data.min_per_group} analysed views per group, and none while blinded")


def check_mixing_variance(data: Data, checks: list) -> None:
    c = data.d["config"]
    want_p = optimal_tau2(c["planningBaselines"]["primary"], c["capPerArm"], c["alpha"])
    want_g = optimal_tau2(c["planningBaselines"]["guardrail"], c["entryCapPerArm"], c["alpha"])
    got_p, got_g = c["TAU2"]["primary"], c["TAU2"]["guardrail"]
    if close(want_p, got_p) and close(want_g, got_g):
        check(checks, "mixing-variance", "pass", f"tau^2 recomputed from the planning rates and caps: primary {fmt(want_p)}, guardrail {fmt(want_g)}")
    else:
        check(checks, "mixing-variance", "fail", f"published tau^2 primary {fmt(got_p)}, guardrail {fmt(got_g)}; recomputed {fmt(want_p)}, {fmt(want_g)}")


def split_look(d: dict):
    """The look the published split check rests on: the flagged look, else the last look."""
    if d["srm"]["flaggedLook"] is not None:
        return d["srm"]["flaggedLook"]
    return d["looks"][-1] if d["looks"] else None


def check_split(data: Data, checks: list) -> None:
    d = data.d
    look = split_look(d)
    for cid, key, base in (("split-check-entry", "assignment", "entry"), ("split-check-analysed", "analysed", "inview")):
        published = d["srm"][key]
        if look is None:
            if published is None:
                check(checks, cid, "pass", "no look yet, and no split check is published")
            else:
                check(checks, cid, "fail", "a split check is published with no look to rest on")
            continue
        ca, cb = look["a"][base], look["b"][base]
        if ca == 0 and cb == 0:
            if published is None:
                check(checks, cid, "pass", "no views yet, and no split check is published")
            else:
                check(checks, cid, "fail", "a split check is published for a look with no views")
            continue
        if published is None:
            check(checks, cid, "fail", f"no split check is published for look {look['day']}, which has views")
            continue
        if published["chi2"] is not None:
            if not exact(ca, cb):
                check(checks, cid, "fail", 'the chi-square is published although a count it rests on is "<5"')
                continue
            chi2, p = split_check(ca, cb)
            flagged = p < data.flag_p
            if not close(chi2, published["chi2"]):
                check(checks, cid, "fail", f"look {look['day']}: published chi-square {fmt(published['chi2'])}, recomputed {fmt(chi2)}")
            elif flagged != published["flagged"]:
                check(checks, cid, "fail", f"look {look['day']}: the published flag is {published['flagged']}, but the recomputed split check gives {flagged}")
            else:
                check(checks, cid, "pass", f"look {look['day']}: chi-square {fmt(chi2)} recomputed, {'flagged' if flagged else 'not flagged'} as published")
            continue
        if exact(ca, cb):
            check(checks, cid, "fail", 'the chi-square is withheld although neither count it rests on is "<5"')
            continue
        flags = [data.flagged(a, b) for a in options(ca) for b in options(cb)]
        result = verdict(flags, lambda f: f == published["flagged"])
        reasons = {
            "pass": f"look {look['day']}: the chi-square is withheld for a \"<5\" cell; {SMALL_REASON} gives the published flag",
            "fail": f"look {look['day']}: {NONE_REASON} (the flag)",
            "indeterminate": f"look {look['day']}: the chi-square is withheld for a \"<5\" cell; {SOME_REASON}",
        }
        check(checks, cid, result, reasons[result])


def check_interval(data: Data, checks: list, kind: str) -> None:
    d = data.d
    cid = f"{kind}-interval"
    published = d[kind]
    name = "card clicks of analysed views" if kind == "primary" else "quick exits of entry views"
    if d["blinded"]:
        if published is None:
            check(checks, cid, "not-applicable", f"blinded: no outcome and no interval is published while the smaller group has fewer than {data.min_per_group} analysed views")
        else:
            check(checks, cid, "fail", "an interval is published while blinded")
        return
    idx = evaluated_indices(data)
    if idx is None:
        check(checks, cid, "indeterminate", 'whether a look is analysed depends on a "<5" cell')
        return
    if not idx:
        if published is None:
            check(checks, cid, "pass", f"no look has {data.min_per_group} analysed views per group yet, and no interval is published")
        else:
            check(checks, cid, "fail", f"an interval is published but no look has {data.min_per_group} analysed views per group")
        return
    if published is None:
        check(checks, cid, "fail", "an analysed look is published but no interval")
        return
    if not outcomes_ready(data, idx):
        check(checks, cid, "fail", "an analysed look withholds the outcome the interval needs")
        return
    histories, complete = band_history(data, idx, kind)
    if not complete:
        check(checks, cid, "indeterminate", 'too many allowed values of the "<5" cells to try')
        return
    if not histories:
        check(checks, cid, "fail", f"{name}: the outcome counts at the analysed looks are not running totals")
        return
    finals = [h[-1] for h in histories]
    if any(conflict for h in histories for (_, _, conflict) in h) and all(any(c for (_, _, c) in h) for h in histories):
        check(checks, cid, "fail", "a published look's interval does not overlap the running band, which would have stopped the analysis before it")
        return
    want = (published["estimate"], published["lower"], published["upper"])
    result = verdict([f[1] for f in finals], lambda b: all(close(x, y) for x, y in zip(b, want)))
    uses_small = any(d["looks"][k][arm][("card" if kind == "primary" else "engaged")] == SMALL for k in idx for arm in ("a", "b"))
    if result == "pass":
        b = finals[0][1]
        source = f"{SMALL_REASON} gives the published interval" if uses_small else f"recomputed: B - A {fmt(b[0])}, from {fmt(b[1])} to {fmt(b[2])}"
        check(checks, cid, "pass", f"{name}, intersected over {len(idx)} analysed looks: {source}")
    elif result == "fail":
        if uses_small:
            check(checks, cid, "fail", f"{name}: {NONE_REASON}")
        else:
            b = finals[0][1]
            check(checks, cid, "fail", f"{name}: published {fmt(want[0])}, from {fmt(want[1])} to {fmt(want[2])}; recomputed {fmt(b[0])}, from {fmt(b[1])} to {fmt(b[2])}")
    else:
        check(checks, cid, "indeterminate", f"{name}: {SOME_REASON}")


def decision_walks(data: Data):
    """Every outcome the published looks allow under the pre-registered rules, as a list of
    (kind, look index), or (None, reason) when they cannot be enumerated."""
    looks = data.looks
    idx = evaluated_indices(data)
    if idx is None:
        return None, 'whether a look is analysed depends on a "<5" cell'
    if idx and not outcomes_ready(data, idx):
        return None, "an analysed look withholds the outcome the rule needs"
    # Per look: which signatures of the two bands the "<5" cells allow (deduplicated).
    prim, complete_p = band_history(data, idx, "primary") if idx else ([[]], True)
    guard, complete_g = band_history(data, idx, "guardrail") if idx else ([[]], True)
    if not (complete_p and complete_g):
        return None, 'too many allowed values of the "<5" cells to try'
    psig = {tuple((excludes_zero(own), excludes_zero(band), band[1] > 0, band[2] < 0, conflict) for (own, band, conflict) in h) for h in prim}
    gsig = {tuple((band[2] < data.margin, conflict) for (_, band, conflict) in h) for h in guard}
    # Per look: the split-check outcomes the "<5" cells allow.
    flag_sets = [sorted({e or i for (e, i) in data.flag_options(look)}) for look in looks]
    ambiguous = [k for k, s in enumerate(flag_sets) if len(s) > 1]
    if len(psig) * len(gsig) * (2 ** len(ambiguous)) > MAX_COMPLETIONS:
        return None, 'too many allowed values of the "<5" cells to try'
    position = {k: j for j, k in enumerate(idx)}
    outcomes = []
    for ps, gs in product(psig, gsig):
        for choice in product((False, True), repeat=len(ambiguous)):
            flags = [s[0] for s in flag_sets]
            for k, f in zip(ambiguous, choice):
                flags[k] = f
            outcomes.append(walk(data, flags, position, ps, gs))
    return outcomes, None


def walk(data: Data, flags: list, position: dict, ps: tuple, gs: tuple) -> tuple:
    """The pre-registered walk over the looks in order: the first look that ends the analysis."""
    for k in range(len(data.looks)):
        if data.ab and Data.inconsistent(data.looks[k]):
            return ("data-fault", k)
        if not data.ab and not flags[k] and Data.inconsistent(data.looks[k]):
            return ("data-fault", k)
        j = position.get(k)
        evaluated = j is not None
        if evaluated:
            own_excl, band_excl, lower_pos, upper_neg, conflict_p = ps[j]
            upper_ok, conflict_g = gs[j]
            conflict = conflict_p or conflict_g
        if data.ab:
            if evaluated and conflict:
                return ("data-fault", k)
            if flags[k]:
                return ("suppressed", k)
            if evaluated and lower_pos and upper_ok:
                return ("ship-b", k)
            if evaluated and upper_neg:
                return ("stop-for-harm", k)
        else:
            if flags[k]:
                return ("srm", k)
            if evaluated and (own_excl or band_excl):
                return ("interval-excludes-zero", k)
            if evaluated and conflict:
                return ("data-fault", k)
    return ("none", None)


def after_end(d: dict) -> bool:
    return d["plannedEndKind"] == "fixed" and instant(d["readAt"]) >= instant(d["plannedEnd"]) + END_MARGIN


def check_decision(data: Data, checks: list) -> None:
    d = data.d
    looks = data.looks
    last = len(looks) - 1
    status, decision, held = d["status"], d["decision"], d["held"]
    if not data.ab:
        if decision is not None:
            check(checks, "decision", "fail", "the A/A calibration publishes a decision")
        else:
            check(checks, "decision", "not-applicable", "the A/A calibration has no decision; see calibration-rule")
        return
    if d["calibration"] is not None:
        check(checks, "decision", "fail", "the A/B publishes a calibration check")
        return
    if d.get("closureMismatch"):
        check(checks, "decision", "indeterminate", "the published state rests on a stored closure that the current analysis did not confirm")
        return
    # What the published state says the walk over the published looks must give.
    problems = []
    expected = ("none", None)
    if status in ("ship-b", "stop-for-harm"):
        expected = (status, last)
        if decision != status:
            problems.append("the decision does not match the state")
        if not looks or d["frozenAt"] != looks[-1]["day"]:
            problems.append("the decision's look is not the last published look")
        if d["decidedOn"] is None or not d["decidedOn"].startswith(d["frozenAt"] or "-"):
            problems.append("the decision date does not match its look")
    elif status == "srm-suppressed":
        flagged_on = d["srm"]["firstFlaggedOn"]
        if decision is not None:
            problems.append("a decision is published beside a suppressed verdict")
        if held is None:
            expected = ("suppressed", last)
            if not looks or flagged_on != looks[-1]["day"] or d["srm"]["flaggedLook"] != looks[-1]:
                problems.append("the flagged look is not the last published look")
        elif flagged_on is None or flagged_on < held["on"] or d["srm"]["flaggedLook"] is None or d["srm"]["flaggedLook"]["day"] != flagged_on:
            problems.append("the split flag that suppresses the held analysis is not at or after the fault")
    elif status == "inconclusive":
        if decision != "inconclusive":
            problems.append("the state is inconclusive but the decision is not")
        if not after_end(d):
            problems.append("inconclusive is published before the planned end")
    elif status == "ab":
        if decision is not None:
            problems.append("a decision is published while the test runs")
        if after_end(d):
            problems.append("the test still runs after its planned end")
    else:
        problems.append(f"the state {status} is not an A/B state")
    if status not in ("ship-b", "stop-for-harm") and (d["frozenAt"] is not None or d["decidedOn"] is not None):
        problems.append("a decision day is published without a decision")
    if status != "srm-suppressed" and d["srm"]["firstFlaggedOn"] is not None:
        problems.append("a split flag is published without a suppressed verdict")
    if problems:
        check(checks, "decision", "fail", "; ".join(problems))
        return
    if data.placeholder:
        check(checks, "decision", "not-applicable", "placeholder: there is no data to decide on")
        return
    outcomes, why = decision_walks(data)
    if outcomes is None:
        check(checks, "decision", "indeterminate", why)
        return
    result = verdict(outcomes, lambda o: o == expected)
    words = {
        "none": "no look decides and no split check fails",
        "suppressed": "the split check fails at the last look, which suppresses the verdict",
        "ship-b": "the last look is the first where B ships",
        "stop-for-harm": "the last look is the first where the test stops for harm",
    }
    say = words[expected[0]]
    if result == "pass":
        tail = f"; the planned end has passed, so the result is inconclusive" if status == "inconclusive" else ""
        held_note = "; nothing after the data fault is published" if held is not None else ""
        check(checks, "decision", "pass", f"walking the {len(looks)} published looks in order: {say}, as published{tail}{held_note}")
    elif result == "fail":
        check(checks, "decision", "fail", f"the published state needs: {say}; the looks do not give that")
    else:
        check(checks, "decision", "indeterminate", f"the walk over the looks: {SOME_REASON}")


def check_calibration(data: Data, checks: list) -> None:
    d = data.d
    cal = d["calibration"]
    if data.ab:
        check(checks, "calibration-rule", "not-applicable", "the A/B has no calibration check")
        return
    if cal is None:
        check(checks, "calibration-rule", "fail", "the A/A publishes no calibration check")
        return
    looks, held, failed = data.looks, d["held"], cal["failed"]
    problems = []
    expected = ("none", None)
    if failed is not None:
        if held is None:
            if not looks or failed["day"] != looks[-1]["day"]:
                problems.append("the failing look is not the last published look")
            expected = (failed["reason"], len(looks) - 1)
        elif failed["day"] != held["on"]:
            problems.append("the failure is not at the data fault")
        if d["frozenAt"] != failed["day"]:
            problems.append("the frozen day is not the failing look")
        if d["status"] != "aa-failed":
            problems.append("the A/A failed but the state does not say so")
    elif d["frozenAt"] is not None:
        problems.append("a frozen day is published without a failure")
    counted = any(c != 0 for c in (d["current"]["a"]["entry"], d["current"]["b"]["entry"]))
    if d["status"] == "before-data" and counted:
        problems.append("the state is before-data but views are counted")
    if d["status"] not in ("before-data", "calibration", "aa-failed"):
        problems.append(f"the state {d['status']} is not an A/A state")
    clean = held is None and d["bandConflictOn"] is None and d["inconsistentOn"] is None
    ready = cal["evaluatedOn"] is not None and cal["srmPassed"] and cal["intervalContainsZero"] is True and failed is None and clean
    if cal["ready"] != ready:
        problems.append("the published readiness does not follow from the published check")
    if failed is not None and failed["reason"] == "srm" and cal["srmPassed"]:
        problems.append("the split check failed but is published as passed")
    if failed is not None and failed["reason"] == "interval-excludes-zero":
        contains = False
    elif d["primary"] is None:
        contains = None
    else:
        contains = not excludes_zero((0, d["primary"]["lower"], d["primary"]["upper"]))
    if cal["intervalContainsZero"] != contains:
        problems.append("whether the interval contains 0 does not match the published interval")
    if problems:
        check(checks, "calibration-rule", "fail", "; ".join(problems))
        return
    if data.placeholder:
        check(checks, "calibration-rule", "not-applicable", "placeholder: there is no data to check")
        return
    outcomes, why = decision_walks(data)
    if outcomes is None:
        check(checks, "calibration-rule", "indeterminate", why)
        return
    result = verdict(outcomes, lambda o: o == expected)
    if result == "pass" and failed is None and d["status"] == "aa-failed":
        check(checks, "calibration-rule", "indeterminate", "the A/A is published as failed by a recorded note, not by the published looks; the looks themselves pass the rule")
    elif result == "pass":
        say = "no look fails the A/A rule" if expected[0] == "none" else f"the last look is the first to fail the A/A rule ({expected[0]})"
        held_note = "; the failing look is a data fault and is not published" if held is not None else ""
        check(checks, "calibration-rule", "pass", f"walking the {len(looks)} published looks in order: {say}, as published{held_note}")
    elif result == "fail":
        check(checks, "calibration-rule", "fail", "the A/A rule applied to the published looks does not give the published result")
    else:
        check(checks, "calibration-rule", "indeterminate", f"the A/A rule over the looks: {SOME_REASON}")


def ended(data: Data) -> bool:
    d = data.d
    return d["held"] is not None or d["frozenAt"] is not None or (data.ab and d["srm"]["firstFlaggedOn"] is not None)


def basis(data: Data):
    """The counts the analysis stands on (analysed views per group): the last look once the
    analysis has ended, else today's counts. None when days left out make it unknowable."""
    if ended(data):
        if not data.looks:
            return (0, 0)
        last = data.looks[-1]
        return (last["a"]["inview"], last["b"]["inview"])
    if data.d["ceilingDays"]:
        return None
    return (data.d["current"]["a"]["inview"], data.d["current"]["b"]["inview"])


def check_blinding(data: Data, checks: list) -> None:
    d = data.d
    if d.get("closureMismatch"):
        check(checks, "blinding", "indeterminate", "the published state rests on a stored closure the current analysis did not confirm")
        return
    b = basis(data)
    if b is None:
        check(checks, "blinding", "indeterminate", "days that reached the daily ceiling are left out of the analysis but not published separately")
        return
    results = [min(x, y) < data.min_per_group for x in options(b[0]) for y in options(b[1])]
    result = verdict(results, lambda r: r == d["blinded"])
    word = "blinded" if d["blinded"] else "not blinded"
    if result == "pass":
        check(checks, "blinding", "pass", f"{word}, as the smaller group's analysed views give")
    elif result == "fail":
        check(checks, "blinding", "fail", f"published as {word}, but the smaller group's analysed views say otherwise")
    else:
        check(checks, "blinding", "indeterminate", f"blinding: {SOME_REASON}")


def check_itt(data: Data, checks: list) -> None:
    d = data.d
    if "itt" not in d:
        if d["blinded"]:
            check(checks, "itt", "not-applicable", "blinded: the intention-to-treat rates are not published")
        else:
            check(checks, "itt", "fail", "the intention-to-treat rates are missing although the data are not blinded")
        return
    itt = d["itt"]
    last = data.looks[-1] if data.looks else None
    shown = last is not None and "card" in last["a"] and "card" in last["b"]
    cells = [last["a"]["card"], last["a"]["entry"], last["b"]["card"], last["b"]["entry"]] if shown else []
    safe = shown and all(c != SMALL and c > 0 for c in cells)
    if itt is None:
        if safe:
            check(checks, "itt", "fail", "the intention-to-treat rates are withheld although no cell they rest on is small or zero")
        else:
            check(checks, "itt", "pass", 'withheld, as the rule requires: the last look has no outcomes, or a cell is "<5" or 0')
        return
    if not safe:
        check(checks, "itt", "fail", 'the intention-to-treat rates are published beside a "<5" or zero cell, or without outcomes')
        return
    want = (last["a"]["card"] / last["a"]["entry"], last["b"]["card"] / last["b"]["entry"])
    if close(want[0], itt["a"]) and close(want[1], itt["b"]):
        check(checks, "itt", "pass", f"card clicks per entry view at look {last['day']}: A {fmt(want[0])}, B {fmt(want[1])}")
    else:
        check(checks, "itt", "fail", f"published A {fmt(itt['a'])}, B {fmt(itt['b'])}; recomputed A {fmt(want[0])}, B {fmt(want[1])}")


def check_detectable(data: Data, checks: list) -> None:
    d = data.d
    c, det = d["config"], d["detectable"]
    problems = []
    if not close(det["baseline"], c["planningBaselines"]["primary"]):
        problems.append("its baseline is not the primary planning rate")
    if not close(det["power"], c["power"]):
        problems.append("its power is not the planned power")
    if not close(det["tau2"], c["TAU2"]["primary"]):
        problems.append("its tau^2 is not the primary mixing variance")
    for pt in det["points"]:
        want = detectable_effect(pt["nPerArm"], det["baseline"], det["tau2"], c["alpha"], det["power"])
        if want is None or not close(want, pt["effect"]):
            problems.append(f"the effect at {pt['nPerArm']} per group is {fmt(pt['effect'])}, recomputed {'none' if want is None else fmt(want)}")
    if problems:
        check(checks, "detectable-effect", "fail", "; ".join(problems))
    else:
        check(checks, "detectable-effect", "pass", f"{len(det['points'])} points of the detectable effect at one look recomputed")

    if d.get("closureMismatch"):
        check(checks, "detectable-at-current", "indeterminate", "the published state rests on a stored closure the current analysis did not confirm")
        return
    b = basis(data)
    if b is None:
        check(checks, "detectable-at-current", "indeterminate", "days that reached the daily ceiling are left out of the analysis but not published separately")
        return
    flagged = d["srm"]["flaggedLook"]
    shown = (flagged["a"]["inview"], flagged["b"]["inview"]) if data.ab and d["srm"]["firstFlaggedOn"] is not None and flagged is not None else b
    results = []
    for sa, sb, ba, bb in product(options(shown[0]), options(shown[1]), options(b[0]), options(b[1])):
        m = min(sa, sb)
        n = min(ba, bb)
        at = detectable_effect(n, det["baseline"], det["tau2"], c["alpha"], det["power"]) if n >= 1 else None
        note = "no-views" if m < 1 else "small-cell" if m < 5 else "beyond-range" if at is None else None
        results.append((note, at if note is None else None))

    def matches(r) -> bool:
        note, at = r
        if note != det["atCurrentNote"]:
            return False
        if at is None:
            return det["atCurrent"] is None
        return det["atCurrent"] is not None and close(at, det["atCurrent"])

    result = verdict(results, matches)
    if result == "pass":
        what = f"note {det['atCurrentNote']}" if det["atCurrentNote"] is not None else f"{fmt(det['atCurrent'])} at the current size"
        check(checks, "detectable-at-current", "pass", f"the detectable effect now: {what}, as recomputed")
    elif result == "fail":
        check(checks, "detectable-at-current", "fail", "the detectable effect at the current size does not match the published counts")
    else:
        check(checks, "detectable-at-current", "indeterminate", f"the detectable effect now: {SOME_REASON}")


def check_faults(data: Data, checks: list) -> None:
    d = data.d
    held = d["held"]
    if held is None:
        if d["bandConflictOn"] is not None or d["inconsistentOn"] is not None:
            check(checks, "held", "fail", "a data fault is published but the analysis is not held")
        else:
            check(checks, "held", "not-applicable", "no data fault is reported")
    else:
        problems = []
        if any(look["day"] >= held["on"] for look in data.looks):
            problems.append("a look on or after the data fault is published")
        fault_day = d["bandConflictOn"] if held["reason"] == "band-conflict" else d["inconsistentOn"]
        if fault_day != held["on"]:
            problems.append("the fault day does not match the held day")
        if problems:
            check(checks, "held", "fail", "; ".join(problems))
        else:
            check(checks, "held", "indeterminate", f"the analysis is held at a data fault ({held['reason']}) on {held['on']}; that look is not published, so the fault itself cannot be recomputed")
    if d["srm"]["afterDecision"]:
        if d["decision"] not in ("ship-b", "stop-for-harm"):
            check(checks, "after-decision", "fail", "a split flag after the decision is reported without a decision")
        else:
            check(checks, "after-decision", "indeterminate", "a split flag after the decision is reported as a note; the later looks are not published, so it cannot be recomputed, and it does not change the decision")
    else:
        check(checks, "after-decision", "not-applicable", "no split flag after a decision is reported")
    if d.get("closureMismatch"):
        check(checks, "closure", "indeterminate", "the stored closure could not be confirmed by the current analysis")


def check_placeholder(data: Data, checks: list) -> None:
    d = data.d
    if not data.placeholder:
        if d["unavailable"] is not None:
            check(checks, "placeholder", "fail", "a reason for missing data is given beside real data")
        else:
            check(checks, "placeholder", "not-applicable", "the file holds data, not the no-data placeholder")
        return
    problems = []
    if d["unavailable"] is None:
        problems.append("no reason is given for the missing data")
    if d["looks"]:
        problems.append("it publishes looks")
    if any(v != 0 for arm in ("a", "b") for v in d["current"][arm].values()):
        problems.append("it publishes counts")
    if d["decision"] is not None or d["primary"] is not None or d["guardrail"] is not None:
        problems.append("it publishes a decision or an interval")
    if problems:
        check(checks, "placeholder", "fail", "the no-data placeholder " + "; ".join(problems))
    else:
        check(checks, "placeholder", "pass", f"the no-data placeholder ({d['unavailable']}): no looks, counts, intervals or decision")


def verify_data(d: dict) -> list:
    data = Data(d)
    checks: list = []
    check_placeholder(data, checks)
    check_small_cells(d, checks)
    check_no_p_values(d, checks)
    check_looks(data, checks)
    check_outcomes_withheld(data, checks)
    check_mixing_variance(data, checks)
    check_split(data, checks)
    check_interval(data, checks, "primary")
    check_interval(data, checks, "guardrail")
    check_decision(data, checks)
    check_calibration(data, checks)
    check_blinding(data, checks)
    check_itt(data, checks)
    check_detectable(data, checks)
    check_faults(data, checks)
    if data.placeholder:
        for c in checks:
            if c["id"] in ("primary-interval", "guardrail-interval") and c["result"] != "fail":
                c["result"], c["reason"] = "not-applicable", "placeholder: there is no data"
    return checks


# ---------------------------------------------------------------------------------------------
# The reference values.
# ---------------------------------------------------------------------------------------------


def verify_reference(ref) -> list:
    checks: list = []
    if not isinstance(ref, dict) or not all(k in ref for k in ("mixtureRatio", "mixtureCs", "srm", "detectableEffectCs", "detectableEffectCsUndetectable")):
        raise Invalid("the reference file lacks the cases this script reproduces")
    try:
        bad = [c for c in ref["mixtureRatio"] if not close(mixture_ratio(c["alpha"]), c["r"])]
        say = lambda cases, what: (f"{len(cases)} {what} reproduced within 1e-8")  # noqa: E731
        check(checks, "reference-mixture-ratio", "fail" if bad else "pass", f"{len(bad)} of {len(ref['mixtureRatio'])} cases differ" if bad else say(ref["mixtureRatio"], "optimal mixing ratios"))

        bad = []
        for c in ref["mixtureCs"]:
            e, lo, hi = mixture_interval(c["xA"], c["nA"], c["xB"], c["nB"], c["tau2"], c["alpha"])
            if not (close(e, c["estimate"]) and close(lo, c["lower"]) and close(hi, c["upper"])):
                bad.append(c)
        check(checks, "reference-mixture-cs", "fail" if bad else "pass", f"{len(bad)} of {len(ref['mixtureCs'])} cases differ" if bad else say(ref["mixtureCs"], "mixture intervals"))

        bad = []
        for c in ref["srm"]:
            chi2, p = split_check(c["nA"], c["nB"])
            if not (close(chi2, c["chi2"]) and close(p, c["p"])):
                bad.append(c)
        check(checks, "reference-split-check", "fail" if bad else "pass", f"{len(bad)} of {len(ref['srm'])} cases differ" if bad else say(ref["srm"], "split checks"))

        bad = []
        cases = ref["detectableEffectCs"] + ref["detectableEffectCsUndetectable"]
        for c in cases:
            got = detectable_effect(c["nPerArm"], c["baseline"], c["tau2"], c["alpha"], c["power"])
            want = c.get("mde")
            if (want is None) != (got is None) or (want is not None and not close(got, want)):
                bad.append(c)
        check(checks, "reference-detectable-effect", "fail" if bad else "pass", f"{len(bad)} of {len(cases)} cases differ" if bad else say(cases, "detectable effects (and undetectable cases)"))
    except (KeyError, TypeError, ValueError, ZeroDivisionError) as e:
        raise Invalid(f"a reference case is malformed: {e}") from None
    return checks


# ---------------------------------------------------------------------------------------------
# Output.
# ---------------------------------------------------------------------------------------------


def summarise(checks: list, errors: list) -> str:
    if errors:
        return "invalid"
    results = {c["result"] for c in checks}
    if "fail" in results:
        return "disagrees"
    if "indeterminate" in results:
        return "indeterminate"
    return "agrees"


SUMMARY = {
    "agrees": "agrees: every check that applies was recomputed and matches the published data.",
    "indeterminate": "indeterminate: nothing disagrees, but some checks cannot be fully recomputed from the published data (see their reasons).",
    "disagrees": "disagrees: a recomputed value or a published rule does not match the published data.",
    "invalid": "invalid: the input is not valid published data, so nothing was checked.",
}


def print_text(d, checks: list, errors: list, result: str) -> None:
    if isinstance(d, dict) and not errors:
        print(f"Experiment data ({d['schema']}): namespace {d['namespace']}, phase {d['configPhase']}, state {d['status']}, read at {d['readAt']}")
        print(f"Pre-registration {d['prereg']['tag']} ({d['prereg']['version']}), design hash {d['prereg']['configSha256']}")
        print()
    for e in errors:
        print(f"ERROR          {e}")
    for c in checks:
        print(f"{c['result'].upper():<15}{c['id']}: {c['reason']}")
    print()
    print(f"Result: {SUMMARY[result]}")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Recompute the live experiment's published results from /experiment/data.json.")
    parser.add_argument("data", nargs="?", help="the published data.json")
    parser.add_argument("--reference", help="also reproduce the frozen reference values (stats-ref/reference.json)")
    parser.add_argument("--json", action="store_true", help="print the report as JSON")
    args = parser.parse_args(argv)
    if args.data is None and args.reference is None:
        parser.error("give the data file, --reference, or both")

    checks: list = []
    errors: list = []
    d = None
    try:
        if args.reference is not None:
            checks.extend(verify_reference(load_json(args.reference)))
    except Invalid as e:
        errors.append(f"reference: {e}")
    if args.data is not None and not errors:
        try:
            d = load_json(args.data)
            errors.extend(validate(d))
        except Invalid as e:
            errors.append(str(e))
        if not errors:
            checks.extend(verify_data(d))
    result = summarise(checks, errors)
    if args.json:
        print(json.dumps({"verifier": VERIFIER, "result": result, "checks": checks, "errors": errors}, indent=2, ensure_ascii=False))
    else:
        print_text(d, checks, errors, result)
    return {"agrees": 0, "indeterminate": 0, "disagrees": 1, "invalid": 2}[result]


if __name__ == "__main__":
    sys.exit(main())
