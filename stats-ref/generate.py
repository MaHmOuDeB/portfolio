"""Reference values for src/lib/stats, produced by scipy and statsmodels.

Writes reference.json next to this file (or to the path given as the optional first argument).
Everything is deterministic: fixed seeds, sorted keys and floats rounded to 12 significant digits,
so two runs on the same platform produce identical bytes. CI regenerates the file to a temporary
path and compares it numerically with the committed copy (check_reference.py), so a last-digit
difference from another platform's libm does not fail the build.

Run with: cd stats-ref && uv run generate.py [output-path]
"""

from __future__ import annotations

import json
import math
import platform
import sys
from pathlib import Path

import numpy as np
import scipy
import statsmodels
from scipy import integrate, optimize, stats
from statsmodels.stats.power import NormalIndPower
from statsmodels.stats.proportion import (
    confint_proportions_2indep,
    proportion_confint,
    proportion_effectsize,
    proportions_ztest,
)

OUT = Path(__file__).with_name("reference.json")
NUMPY_SEED = 20261005
SFC32_SEED = 42


def warn(message: str) -> None:
    print(message, file=sys.stderr)


def round12(x: float) -> float:
    """Round to 12 significant digits (not decimals, so tiny tail values keep their precision)."""
    return float(f"{x:.12g}")


def round_floats(value):
    """Recursively round every float to 12 significant digits; ints, strings and keys are untouched.

    A last-ulp difference in numpy/scipy between platforms (macOS arm64 vs Linux x86) must not change
    the committed bytes. The library's tolerances (1e-9 absolute, 1e-12 for normalCdf, 1e-6 relative
    in the tails) are all looser than this rounding. Values that the TypeScript reads as *inputs*
    (the p of a quantile pair, tau2) are rounded before the reference is computed from them, so each
    pair stays self-consistent.
    """
    if isinstance(value, bool) or isinstance(value, int) or isinstance(value, str):
        return value
    if isinstance(value, float):
        return round12(value)
    if isinstance(value, dict):
        return {k: round_floats(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [round_floats(v) for v in value]
    raise TypeError(f"unexpected type {type(value)}")


# ---------------------------------------------------------------------------
# meta
# ---------------------------------------------------------------------------


def make_meta() -> dict:
    # Major.minor only: the patch level of the interpreter must not change the committed bytes.
    return {
        "numpy": np.__version__,
        "python": f"{sys.version_info.major}.{sys.version_info.minor}",
        "scipy": scipy.__version__,
        "statsmodels": statsmodels.__version__,
    }


# ---------------------------------------------------------------------------
# normal distribution
# ---------------------------------------------------------------------------


def make_normal_cdf() -> list:
    # Python integers from range(), scaled by an exact power of two, give exact multiples of 0.25.
    xs = [float(k) * 0.25 for k in range(-160, 33)] + [-1e-9, 1e-9]
    return [[x, float(stats.norm.cdf(x))] for x in xs]


def make_normal_quantile() -> list:
    base = [1e-300, 1e-100, 1e-20, 1e-10, 1e-5, 0.001, 0.01, 0.025, 0.05, 0.1, 0.2, 0.5]
    ps: list[float] = []
    for p in base:
        for q in (p, round12(1.0 - p)):
            # 1 - 1e-20 rounds to exactly 1.0, whose quantile is +Infinity (not valid JSON), and
            # 1 - 0.5 is 0.5 again. Keep only complements that are distinct and strictly inside (0, 1).
            if 0.0 < q < 1.0 and q not in ps:
                ps.append(q)  # already 12 significant digits: the quantile is computed from it
    return [[p, float(stats.norm.ppf(p))] for p in ps]


# ---------------------------------------------------------------------------
# sfc32
# ---------------------------------------------------------------------------

M32 = 0xFFFFFFFF


def sfc32_outputs(seed: int, count: int) -> list[int]:
    """Python port of sfc32 seeded as in the TypeScript library.

    State (a, b, c, d) = (0x9E3779B9, 0x243F6A88, 0xB7E15162, seed >>> 0), then 12 outputs are
    discarded. The step is the reference implementation's:
        t = (a + b + d) | 0; d = (d + 1) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0;
        c = ((c << 21) | (c >>> 11)) + t | 0; return t >>> 0
    all with 32-bit wraparound.
    """
    a, b, c, d = 0x9E3779B9, 0x243F6A88, 0xB7E15162, seed & M32

    def step() -> int:
        nonlocal a, b, c, d
        t = (a + b + d) & M32
        d = (d + 1) & M32
        a = b ^ (b >> 9)
        b = (c + (c << 3)) & M32
        c = (((c << 21) | (c >> 11)) + t) & M32  # rotl(c, 21) + t; high bits dropped by the mask
        return t

    for _ in range(12):
        step()
    return [step() for _ in range(count)]


def make_sfc32() -> dict:
    return {"first": sfc32_outputs(SFC32_SEED, 16), "seed": SFC32_SEED}


# ---------------------------------------------------------------------------
# intervals and tests
# ---------------------------------------------------------------------------


def make_wilson() -> list:
    cases = [(x, 100) for x in (0, 1, 5, 50, 99, 100)] + [
        (0, 1),
        (1, 1),
        (3, 7),
        (350, 1000),
        (5_000_000, 10_000_000),
    ]
    out = []
    for x, n in cases:
        for alpha in (0.05, 0.1):
            lower, upper = proportion_confint(x, n, alpha=alpha, method="wilson")
            out.append(
                {"alpha": alpha, "lower": float(lower), "n": n, "upper": float(upper), "x": x}
            )
    return out


def make_newcombe() -> list:
    # (xA, nA, xB, nB, alpha); the interval is for the difference B - A.
    cases = [
        (0, 100, 0, 100, 0.05),
        (0, 100, 5, 100, 0.05),
        (5, 100, 0, 100, 0.05),
        (50, 100, 60, 100, 0.05),
        (290, 1000, 340, 1000, 0.05),
        (100, 100, 100, 100, 0.05),
        (0, 1, 1, 1, 0.05),
        (3, 7, 5, 9, 0.1),
        (29, 100, 40, 100, 0.1),
        (2_900_000, 10_000_000, 2_950_000, 10_000_000, 0.05),
        (10, 10_000_000, 20, 10_000_000, 0.05),
        (0, 10_000_000, 0, 10_000_000, 0.01),
    ]
    out = []
    for xa, na, xb, nb, alpha in cases:
        lower, upper = confint_proportions_2indep(
            xb, nb, xa, na, method="newcomb", compare="diff", alpha=alpha
        )
        out.append(
            {
                "alpha": alpha,
                "lower": float(lower),
                "nA": na,
                "nB": nb,
                "upper": float(upper),
                "xA": xa,
                "xB": xb,
            }
        )
    return out


def make_ztest() -> list:
    # Pooled proportion strictly between 0 and 1 in every case (the 0 / 1 case is a TS special case).
    cases = [
        (50, 100, 60, 100),
        (290, 1000, 340, 1000),
        (0, 100, 5, 100),
        (5, 100, 0, 100),
        (1, 7, 3, 7),
        (350, 1000, 350, 1000),
        (2_900_000, 10_000_000, 2_950_000, 10_000_000),
        (10, 10_000_000, 20, 10_000_000),
        (120, 400, 150, 380),
        (99, 100, 100, 100),
    ]
    out = []
    for xa, na, xb, nb in cases:
        z, p = proportions_ztest([xb, xa], [nb, na])
        out.append({"nA": na, "nB": nb, "p": float(p), "xA": xa, "xB": xb, "z": float(z)})
    return out


def make_srm() -> list:
    cases = [
        (500, 500),
        (480, 520),
        (5_000_000, 5_010_000),
        (4900, 5100),
        (1000, 1100),
        (100, 200),
        (50_000, 50_500),
        (1, 9),
    ]
    out = []
    for na, nb in cases:
        chi2, p = stats.chisquare([na, nb])
        out.append({"chi2": float(chi2), "nA": na, "nB": nb, "p": float(p)})
    return out


# ---------------------------------------------------------------------------
# sample size and detectable effect
# ---------------------------------------------------------------------------

SAMPLE_SIZE_CASES = [
    # (baseline, mde, alpha, power); the first is the repo's preset and must give 1353.
    (0.29, 0.05, 0.05, 0.8),
    (0.29, 0.05, 0.05, 0.9),
    (0.29, 0.03, 0.05, 0.8),
    (0.29, 0.10, 0.05, 0.8),
    (0.10, 0.02, 0.05, 0.8),
    (0.10, 0.01, 0.05, 0.9),
    (0.05, 0.01, 0.05, 0.8),
    (0.05, 0.005, 0.01, 0.8),
    (0.50, 0.05, 0.05, 0.8),
    (0.50, 0.02, 0.05, 0.8),
    (0.20, 0.04, 0.01, 0.9),
    (0.20, 0.04, 0.10, 0.7),
    (0.01, 0.005, 0.05, 0.8),
    (0.01, 0.002, 0.05, 0.95),
    (0.35, 0.07, 0.05, 0.8),
    (0.35, 0.07, 0.05, 0.95),
    (0.60, 0.10, 0.05, 0.8),
    (0.80, 0.05, 0.05, 0.8),
    (0.15, 0.03, 0.025, 0.85),
    (0.40, 0.15, 0.05, 0.9),
]


def make_sample_size() -> list:
    power_solver = NormalIndPower()
    out = []
    for baseline, mde, alpha, power in SAMPLE_SIZE_CASES:
        h = proportion_effectsize(baseline + mde, baseline)
        solver_n = int(
            math.ceil(
                power_solver.solve_power(
                    h, alpha=alpha, power=power, ratio=1, alternative="two-sided"
                )
            )
        )
        z_sum = stats.norm.ppf(1 - alpha / 2) + stats.norm.ppf(power)
        closed_n = int(math.ceil(2 * (z_sum / h) ** 2))
        if closed_n != solver_n:
            warn(
                f"sampleSize case dropped (closed form {closed_n} != solve_power {solver_n}): "
                f"baseline={baseline} mde={mde} alpha={alpha} power={power}"
            )
            continue
        out.append(
            {"alpha": alpha, "baseline": baseline, "mde": mde, "n": solver_n, "power": power}
        )
    # A library bump that makes a case disagree must fail loudly, not just print a warning.
    assert len(out) == 20, f"expected 20 sampleSize cases, got {len(out)}"
    assert {"alpha": 0.05, "baseline": 0.29, "mde": 0.05, "n": 1353, "power": 0.8} in out, (
        "the 0.29 / 0.05 / 0.05 / 0.8 -> 1353 anchor is missing"
    )
    return out


DETECTABLE_EFFECT_CASES = [
    # (nPerArm, baseline, alpha, power)
    (1353, 0.29, 0.05, 0.8),
    (200, 0.29, 0.05, 0.8),
    (500, 0.29, 0.05, 0.8),
    (5000, 0.29, 0.05, 0.8),
    (1000, 0.10, 0.05, 0.8),
    (1000, 0.50, 0.05, 0.9),
    (10_000, 0.05, 0.05, 0.8),
    (100, 0.50, 0.05, 0.8),
    (2000, 0.35, 0.01, 0.8),
    (300, 0.20, 0.10, 0.8),
    (50_000, 0.01, 0.05, 0.95),
    (1000, 0.80, 0.05, 0.8),
]


def effect_to_absolute_difference(h: float, baseline: float) -> float:
    """Invert Cohen's h: p2 = sin^2(asin(sqrt(p1)) + h / 2), returned as the difference p2 - p1."""
    angle = math.asin(math.sqrt(baseline)) + h / 2
    if angle > math.pi / 2:
        raise ValueError("effect size pushes p2 past 1")
    return math.sin(angle) ** 2 - baseline


def make_detectable_effect() -> list:
    power_solver = NormalIndPower()
    out = []
    for n, baseline, alpha, power in DETECTABLE_EFFECT_CASES:
        # The closed form the TypeScript implements.
        h_closed = (stats.norm.ppf(1 - alpha / 2) + stats.norm.ppf(power)) * math.sqrt(2 / n)
        mde = effect_to_absolute_difference(h_closed, baseline)
        # Cross-check against the statsmodels solver, which includes a negligible far-tail term.
        h_solver = float(
            power_solver.solve_power(
                effect_size=None,
                nobs1=n,
                alpha=alpha,
                power=power,
                ratio=1,
                alternative="two-sided",
            )
        )
        mde_solver = effect_to_absolute_difference(h_solver, baseline)
        gap = abs(mde - mde_solver)
        assert gap < 1e-4, (
            f"detectableEffect closed form differs from solve_power by {gap:g}: "
            f"n={n} baseline={baseline} alpha={alpha} power={power}"
        )
        if gap > 1e-6:
            warn(
                f"note: detectableEffect closed form differs from solve_power by {gap:.3g} "
                f"(n={n} baseline={baseline} alpha={alpha} power={power})"
            )
        out.append(
            {"alpha": alpha, "baseline": baseline, "mde": mde, "nPerArm": n, "power": power}
        )
    return out


# ---------------------------------------------------------------------------
# mixture confidence sequence
# ---------------------------------------------------------------------------

MIXTURE_ALPHAS = (0.01, 0.05, 0.1)


def mixture_objective(r: float, alpha: float) -> float:
    return (1 + 1 / r) * (2 * math.log(1 / alpha) + math.log(1 + r))


def optimal_ratio(alpha: float) -> float:
    """r* that minimises (1 + 1/r)(2 ln(1/a) + ln(1 + r)).

    scipy's minimize_scalar is run as the stated reference. A minimum is only located to about the
    square root of machine precision, which is too coarse for the library's 1e-9 tolerance, so the
    stored value is the root of the stationarity condition d/dr = 0, i.e. r = 2 ln(1/a) + ln(1 + r),
    found with brentq to full precision. The two must agree.
    """
    result = optimize.minimize_scalar(
        mixture_objective,
        args=(alpha,),
        bounds=(1e-3, 1e3),
        method="bounded",
        options={"xatol": 1e-12},
    )
    root = optimize.brentq(
        lambda r: r - 2 * math.log(1 / alpha) - math.log(1 + r),
        1e-3,
        1e3,
        xtol=1e-15,
        rtol=4 * np.finfo(float).eps,
    )
    assert abs(result.x - root) < 1e-4, (alpha, result.x, root)
    return float(root)


def make_mixture_ratio() -> list:
    return [{"alpha": alpha, "r": optimal_ratio(alpha)} for alpha in MIXTURE_ALPHAS]


def mixture_interval(xa: int, na: int, xb: int, nb: int, tau2: float, alpha: float) -> dict:
    """Two-sided normal-mixture confidence sequence for B - A at one look."""
    pa = (xa + 0.5) / (na + 1)
    pb = (xb + 0.5) / (nb + 1)
    v = pa * (1 - pa) / na + pb * (1 - pb) / nb
    half = math.sqrt(v * (v + tau2) / tau2 * (2 * math.log(1 / alpha) + math.log((v + tau2) / v)))
    estimate = xb / nb - xa / na
    return {"estimate": estimate, "lower": estimate - half, "upper": estimate + half}


def make_mixture_cs() -> list:
    # (xA, nA, xB, nB, alpha, baseline, nCapPerArm); tau2 = r*(alpha) * 2 p (1 - p) / nCap.
    cases = [
        (0, 60, 0, 60, 0.05, 0.35, 1000),
        (0, 100, 5, 100, 0.05, 0.35, 1000),
        (5, 100, 0, 100, 0.05, 0.35, 1000),
        (35, 100, 40, 100, 0.05, 0.35, 1000),
        (350, 1000, 380, 1000, 0.05, 0.35, 1000),
        (100, 100, 100, 100, 0.05, 0.35, 1000),
        (0, 1, 1, 1, 0.05, 0.35, 1000),
        (29, 100, 40, 100, 0.1, 0.29, 1353),
        (290, 1000, 345, 1000, 0.01, 0.29, 2000),
        (3_500_000, 10_000_000, 3_501_000, 10_000_000, 0.05, 0.35, 10_000_000),
        (0, 10_000_000, 0, 10_000_000, 0.05, 0.35, 10_000_000),
        (0, 10_000_000, 10, 10_000_000, 0.05, 0.35, 10_000_000),
    ]
    out = []
    for xa, na, xb, nb, alpha, baseline, n_cap in cases:
        tau2 = round12(optimal_ratio(alpha) * 2 * baseline * (1 - baseline) / n_cap)
        ci = mixture_interval(xa, na, xb, nb, tau2, alpha)
        out.append(
            {
                "alpha": alpha,
                "estimate": ci["estimate"],
                "lower": ci["lower"],
                "nA": na,
                "nB": nb,
                "tau2": tau2,
                "upper": ci["upper"],
                "xA": xa,
                "xB": xb,
            }
        )
    return out


# ---------------------------------------------------------------------------
# simulations
# ---------------------------------------------------------------------------

REPS = 200_000
OBF_REPS = 2_000_000
OBF_CHUNK = 20_000
OBF_MAX_LOOKS = 60


def make_obf() -> dict:
    """0.95 quantile c_K of max_{k<=K} |S_k| / sqrt(K), S_k = cumulative sum of standard normals.

    K = 1 is exact: |S_1| = |Z|, so c_1 = norm.ppf(0.975). K = 2..60 are Monte Carlo estimates from
    OBF_REPS paths of 60 normals (prefix K of each path), drawn in fixed-size chunks from one seeded
    generator. Only the top OBF_REPS * 0.05 + 2 values per K are kept, which is enough to compute
    np.quantile(..., 0.95) exactly without holding all 2M x 59 values in memory.
    """
    rng = np.random.default_rng(NUMPY_SEED)
    sqrt_k = np.sqrt(np.arange(1, OBF_MAX_LOOKS + 1))
    q = 0.95
    h = q * (OBF_REPS - 1)
    lo = int(math.floor(h))
    frac = h - lo
    keep = OBF_REPS - lo + 1  # sorted indexes lo and lo + 1 both live in the top `keep` values
    kept = [np.empty(0) for _ in range(OBF_MAX_LOOKS)]
    for _ in range(OBF_REPS // OBF_CHUNK):
        z = rng.standard_normal((OBF_CHUNK, OBF_MAX_LOOKS))
        running_max = np.maximum.accumulate(np.abs(np.cumsum(z, axis=1)), axis=1)
        scaled = running_max / sqrt_k
        for k in range(2, OBF_MAX_LOOKS + 1):
            merged = np.concatenate([kept[k - 1], scaled[:, k - 1]])
            if merged.size > keep:
                merged = np.partition(merged, merged.size - keep)[-keep:]
            kept[k - 1] = merged
    out = {"1": float(stats.norm.ppf(0.975))}
    for k in range(2, OBF_MAX_LOOKS + 1):
        top = np.sort(kept[k - 1])  # ascending; top[0] has global sorted index OBF_REPS - keep
        offset = OBF_REPS - keep
        low, high = top[lo - offset], top[lo + 1 - offset]
        out[str(k)] = float(low + (high - low) * frac)
    return out


def make_peeking() -> list:
    p = 0.35
    n_per_look = 100
    alpha = 0.05
    r_star = optimal_ratio(alpha)
    z_crit = stats.norm.ppf(1 - alpha / 2)
    out = []
    for looks in (1, 5, 10, 20, 50):
        # Both methods see the same A/A draws: exact binomials per arm per look, cumulated.
        rng = np.random.default_rng(NUMPY_SEED + looks)
        xa = np.cumsum(rng.binomial(n_per_look, p, size=(REPS, looks)), axis=1).astype(float)
        xb = np.cumsum(rng.binomial(n_per_look, p, size=(REPS, looks)), axis=1).astype(float)
        n = n_per_look * np.arange(1, looks + 1, dtype=float)

        # Naive: pooled two-sided z-test at every look, reject if any look is significant.
        pooled = (xa + xb) / (2 * n)
        spread = pooled * (1 - pooled) * 2 / n
        safe = np.where(spread > 0, spread, 1.0)
        z = np.where(spread > 0, (xb / n - xa / n) / np.sqrt(safe), 0.0)
        naive_hits = (np.abs(z) > z_crit).any(axis=1)

        # Mixture confidence sequence with tau2 = r* * 2 p (1 - p) / nCap, nCap = looks * nPerLook.
        tau2 = r_star * 2 * p * (1 - p) / (looks * n_per_look)
        pa = (xa + 0.5) / (n + 1)
        pb = (xb + 0.5) / (n + 1)
        v = pa * (1 - pa) / n + pb * (1 - pb) / n
        half = np.sqrt(v * (v + tau2) / tau2 * (2 * math.log(1 / alpha) + np.log((v + tau2) / v)))
        cs_hits = (np.abs(xb / n - xa / n) > half).any(axis=1)

        for method, hits in (("cs", cs_hits), ("naive", naive_hits)):
            fpr = float(hits.mean())
            out.append(
                {
                    "fpr": fpr,
                    "looks": looks,
                    "method": method,
                    "nPerLook": n_per_look,
                    "p": p,
                    "reps": REPS,
                    "se": math.sqrt(fpr * (1 - fpr) / REPS),
                }
            )
    return out


# ---------------------------------------------------------------------------
# retrodesign (Gelman and Carlin)
# ---------------------------------------------------------------------------


def make_retrodesign() -> list:
    # (true effect, standard error, alpha); the estimate is D ~ Normal(trueEffect, se^2).
    cases = [
        (0.01, 0.02, 0.05),
        (0.02, 0.02, 0.05),
        (0.05, 0.02, 0.05),
        (0.10, 0.02, 0.05),
        (0.01, 0.05, 0.05),
        (0.03, 0.05, 0.05),
        (0.05, 0.05, 0.10),
        (0.20, 0.05, 0.05),
    ]
    out = []
    for theta, se, alpha in cases:
        t = stats.norm.ppf(1 - alpha / 2) * se

        def pdf(d: float, theta: float = theta, se: float = se) -> float:
            return float(stats.norm.pdf(d, loc=theta, scale=se))

        opts = {"epsabs": 0.0, "epsrel": 1e-12, "limit": 500}
        upper_mass = integrate.quad(pdf, t, np.inf, **opts)[0]
        lower_mass = integrate.quad(pdf, -np.inf, -t, **opts)[0]
        upper_abs = integrate.quad(lambda d: d * pdf(d), t, np.inf, **opts)[0]
        lower_abs = integrate.quad(lambda d: -d * pdf(d), -np.inf, -t, **opts)[0]
        power = upper_mass + lower_mass
        type_s = lower_mass / power
        exaggeration = (upper_abs + lower_abs) / power / theta

        # Closed-form sanity check of the integrals.
        power_closed = stats.norm.sf((t - theta) / se) + stats.norm.cdf((-t - theta) / se)
        assert abs(power - power_closed) <= 1e-9 * power_closed, (theta, se, power, power_closed)

        out.append(
            {
                "alpha": alpha,
                "exaggeration": float(exaggeration),
                "power": float(power),
                "se": se,
                "trueEffect": theta,
                "typeS": float(type_s),
            }
        )
    return out


# ---------------------------------------------------------------------------


def main(argv: list[str]) -> None:
    out = Path(argv[1]) if len(argv) > 1 else OUT
    reference = {
        "detectableEffect": make_detectable_effect(),
        "meta": make_meta(),
        "mixtureCs": make_mixture_cs(),
        "mixtureRatio": make_mixture_ratio(),
        "newcombe": make_newcombe(),
        "normalCdf": make_normal_cdf(),
        "normalQuantile": make_normal_quantile(),
        "obf": make_obf(),
        "peeking": make_peeking(),
        "retrodesign": make_retrodesign(),
        "sampleSize": make_sample_size(),
        "sfc32": make_sfc32(),
        "srm": make_srm(),
        "wilson": make_wilson(),
        "ztest": make_ztest(),
    }
    # allow_nan=False: a NaN or Infinity would produce invalid JSON, so fail loudly instead.
    text = json.dumps(round_floats(reference), sort_keys=True, indent=1, allow_nan=False) + "\n"
    out.write_text(text, encoding="utf-8", newline="\n")
    print(f"wrote {out.name} ({len(text)} bytes, Python {platform.python_version()})")


if __name__ == "__main__":
    main(sys.argv)
