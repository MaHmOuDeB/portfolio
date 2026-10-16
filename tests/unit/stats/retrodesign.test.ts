import fc from "fast-check";
import { normalPdf, normalQuantile } from "@/lib/stats/normal";
import { retrodesign } from "@/lib/stats/retrodesign";
import { ref } from "./reference";

// Fixed seed: the property tests are deterministic in CI.
const FC = { seed: 20260101, numRuns: 300 } as const;

const ABS_TOL = 1e-8;
/** The reference is rounded to 12 significant digits, so the relative error is about 5e-13. */
const REL_TOL = 1e-6;

describe("retrodesign", () => {
  it("matches every reference case", () => {
    expect(ref.retrodesign.length).toBeGreaterThan(0);
    for (const c of ref.retrodesign) {
      const r = retrodesign({
        trueEffect: c.trueEffect,
        se: c.se,
        alpha: c.alpha,
      });
      const label = `d=${c.trueEffect} se=${c.se} alpha=${c.alpha}`;
      expect(Math.abs(r.power - c.power), `power ${label}`).toBeLessThanOrEqual(
        ABS_TOL,
      );
      expect(
        Math.abs(r.exaggeration - c.exaggeration),
        `exaggeration ${label}`,
      ).toBeLessThanOrEqual(ABS_TOL);
      expect(
        Math.abs(r.typeS - c.typeS) / c.typeS,
        `typeS ${label}`,
      ).toBeLessThanOrEqual(REL_TOL);
    }
  });

  it("defaults alpha to 0.05", () => {
    expect(retrodesign({ trueEffect: 0.03, se: 0.02 })).toEqual(
      retrodesign({ trueEffect: 0.03, se: 0.02, alpha: 0.05 }),
    );
  });

  it("keeps typeS accurate in relative terms when it is astronomically small", () => {
    // d / se = 8: typeS is about 1e-23, far below what 1 - Phi(...) arithmetic could resolve.
    const r = retrodesign({ trueEffect: 0.16, se: 0.02 });
    // Independent value: Mills-ratio asymptotic series for the lower tail Phi(-x) at
    // x = z + 8 (the upper-tail term of the power is 1 to double precision).
    const x = -normalQuantile(0.025) + 8;
    const tail =
      (normalPdf(x) / x) * (1 - 1 / x ** 2 + 3 / x ** 4 - 15 / x ** 6);
    expect(r.typeS).toBeGreaterThan(0);
    expect(r.typeS).toBeLessThan(1e-22);
    expect(Math.abs(r.typeS - tail) / tail).toBeLessThan(1e-4);
  });

  it("is almost unbiased when power is high", () => {
    const r = retrodesign({ trueEffect: 0.1, se: 0.01 });
    expect(r.exaggeration).toBeGreaterThan(1);
    expect(r.exaggeration).toBeLessThan(1.01);
  });

  it("treats positive and negative effects of equal size identically", () => {
    for (const d of [0.01, 0.03, 0.1, 0.5]) {
      expect(retrodesign({ trueEffect: -d, se: 0.05 })).toEqual(
        retrodesign({ trueEffect: d, se: 0.05 }),
      );
    }
  });

  it.each([1, 0.02])(
    "agrees with direct numerical integration for a low-power case at se = %s",
    (se) => {
      const d = 0.5 * se;
      const alpha = 0.05;
      const c = -normalQuantile(alpha / 2) * se;
      // Midpoint rule on grids aligned with the cut-off: 1e5 steps over 10 standard errors.
      const steps = 100000;
      const width = 10 * se;
      const h = width / steps;
      const density = (x: number): number => normalPdf((x - d) / se) / se;
      let prob = 0;
      let wrongSign = 0;
      let mass = 0;
      for (let i = 0; i < steps; i += 1) {
        const u = (i + 0.5) * h;
        const upper = c + u;
        const lower = -c - u;
        prob += density(upper) * h;
        wrongSign += density(lower) * h;
        mass += (upper * density(upper) + -lower * density(lower)) * h;
      }
      const power = prob + wrongSign;
      const r = retrodesign({ trueEffect: d, se, alpha });
      expect(Math.abs(r.power - power)).toBeLessThan(1e-6);
      expect(Math.abs(r.typeS - wrongSign / power)).toBeLessThan(1e-6);
      const exaggeration = mass / (power * d);
      expect(exaggeration).toBeGreaterThan(2);
      expect(Math.abs(r.exaggeration - exaggeration)).toBeLessThan(1e-6);
    },
  );

  it("depends only on d / se, even when z * se would overflow", () => {
    const unit = retrodesign({ trueEffect: 1, se: 1 });
    // c = z * se would be Infinity for se > ~9e307 and make the power wrong.
    const huge = retrodesign({ trueEffect: 1e308, se: 1e308 });
    expect(huge.power).toBeCloseTo(unit.power, 12);
    expect(huge.typeS).toBeCloseTo(unit.typeS, 12);
    expect(huge.exaggeration).toBeCloseTo(unit.exaggeration, 12);
    const wide = retrodesign({ trueEffect: 5e307, se: 1.5e308 });
    const ratio = retrodesign({ trueEffect: 5e307 / 1.5e308, se: 1 });
    expect(wide.power).toBeCloseTo(ratio.power, 12);
  });

  it("returns the limit values when d / se overflows to Infinity", () => {
    for (const [d, se] of [
      [1e300, 1e-9],
      [1e308, 1e-10],
      [-1e308, 1e-10],
    ] as const) {
      const r = retrodesign({ trueEffect: d, se });
      expect(r, `d=${d} se=${se}`).toEqual({ power: 1, typeS: 0, exaggeration: 1 });
    }
  });

  it("never returns NaN for extreme finite effects and standard errors", () => {
    // d and se on a log grid from 1e-300 to 1e300, so d / se spans 1e-600 (underflow to 0)
    // to 1e600 (overflow to Infinity).
    for (let i = -300; i <= 300; i += 20) {
      for (let j = -300; j <= 300; j += 20) {
        for (const alpha of [0.05, 1e-17]) {
          const r = retrodesign({ trueEffect: 10 ** i, se: 10 ** j, alpha });
          const label = `d=1e${i} se=1e${j} alpha=${alpha}`;
          for (const [name, v] of Object.entries(r)) {
            expect(Number.isNaN(v), `${name} ${label}`).toBe(false);
          }
          expect(r.power, label).toBeGreaterThanOrEqual(0);
          expect(r.power, label).toBeLessThanOrEqual(1);
          expect(r.typeS, label).toBeGreaterThanOrEqual(0);
          expect(r.typeS, label).toBeLessThanOrEqual(0.5);
          expect(r.exaggeration, label).toBeGreaterThanOrEqual(1 - 1e-12);
        }
      }
    }
  });

  it("shows the winner’s curse: exaggeration is clearly above 1 at low power", () => {
    expect(
      retrodesign({ trueEffect: 0.5 * 0.02, se: 0.02 }).exaggeration,
    ).toBeGreaterThan(2);
  });

  it("converges to no exaggeration and no sign errors as d / se grows", () => {
    let previous = retrodesign({ trueEffect: 3, se: 1 });
    for (const ratio of [4, 6, 8, 12]) {
      const r = retrodesign({ trueEffect: ratio, se: 1 });
      expect(r.exaggeration).toBeLessThan(previous.exaggeration);
      expect(r.typeS).toBeLessThan(previous.typeS);
      previous = r;
    }
    const big = retrodesign({ trueEffect: 12, se: 1 });
    expect(Math.abs(big.exaggeration - 1)).toBeLessThan(1e-12);
    expect(big.typeS).toBeLessThan(1e-30);
    expect(big.power).toBeCloseTo(1, 12);
  });

  it("converges to the null-hypothesis limits as d / se shrinks", () => {
    const r = retrodesign({ trueEffect: 1e-9, se: 1 });
    expect(r.power).toBeCloseTo(0.05, 9);
    expect(r.typeS).toBeCloseTo(0.5, 6);
    expect(r.exaggeration).toBeGreaterThan(1e8);
  });

  describe("validation", () => {
    it("rejects a zero effect", () => {
      expect(() => retrodesign({ trueEffect: 0, se: 0.02 })).toThrow(
        RangeError,
      );
      expect(() => retrodesign({ trueEffect: 0, se: 0.02 })).toThrow(
        /trueEffect/,
      );
    });

    it.each([NaN, Infinity, -Infinity])("rejects trueEffect = %s", (v) => {
      expect(() => retrodesign({ trueEffect: v, se: 0.02 })).toThrow(
        /trueEffect/,
      );
    });

    it.each([0, -0.02, NaN, Infinity])("rejects se = %s", (v) => {
      expect(() => retrodesign({ trueEffect: 0.05, se: v })).toThrow(
        RangeError,
      );
      expect(() => retrodesign({ trueEffect: 0.05, se: v })).toThrow(/se/);
    });

    it.each([0, 1, -0.1, 1.5, NaN])("rejects alpha = %s", (v) => {
      expect(() =>
        retrodesign({ trueEffect: 0.05, se: 0.02, alpha: v }),
      ).toThrow(RangeError);
      expect(() =>
        retrodesign({ trueEffect: 0.05, se: 0.02, alpha: v }),
      ).toThrow(/alpha/);
    });
  });

  describe("properties", () => {
    const effect = fc.double({ min: 1e-3, max: 0.5, noNaN: true });
    const se = fc.double({ min: 1e-3, max: 0.5, noNaN: true });
    const alpha = fc.double({ min: 1e-6, max: 0.5, noNaN: true });

    it("power lies in [alpha, 1]", () => {
      fc.assert(
        fc.property(effect, se, alpha, (d, s, a) => {
          const { power } = retrodesign({ trueEffect: d, se: s, alpha: a });
          return power >= a - 1e-12 && power <= 1 + 1e-12;
        }),
        FC,
      );
    });

    it("power increases with |trueEffect| / se", () => {
      fc.assert(
        fc.property(
          effect,
          se,
          alpha,
          fc.double({ min: 1.01, max: 3, noNaN: true }),
          (d, s, a, k) => {
            const lo = retrodesign({ trueEffect: d, se: s, alpha: a }).power;
            const hi = retrodesign({
              trueEffect: d * k,
              se: s,
              alpha: a,
            }).power;
            return hi >= lo - 1e-12;
          },
        ),
        FC,
      );
    });

    it("exaggeration is at least 1 and typeS lies in [0, 0.5]", () => {
      fc.assert(
        fc.property(effect, se, alpha, (d, s, a) => {
          const r = retrodesign({ trueEffect: d, se: s, alpha: a });
          return (
            r.exaggeration >= 1 - 1e-12 &&
            r.typeS >= 0 &&
            r.typeS <= 0.5 + 1e-12
          );
        }),
        FC,
      );
    });

    it("depends only on |trueEffect| (sign symmetry)", () => {
      fc.assert(
        fc.property(effect, se, alpha, (d, s, a) => {
          const pos = retrodesign({ trueEffect: d, se: s, alpha: a });
          const neg = retrodesign({ trueEffect: -d, se: s, alpha: a });
          return (
            pos.power === neg.power &&
            pos.typeS === neg.typeS &&
            pos.exaggeration === neg.exaggeration
          );
        }),
        FC,
      );
    });
  });
});
