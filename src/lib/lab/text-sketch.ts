// The words on the Lab's four decorative card sketches (they are drawn without a digit and hidden from
// assistive technology). English is the default (EN_SKETCH); the other language is in content/de/lab.tsx.
export type SketchText = {
  sample: { name: string; note: string; rows: readonly [small: string, mid: string, large: string]; tag: string };
  split: { name: string; note: string; a: string; b: string; plan: string; more: string; fewer: string };
  peek: { name: string; note: string };
  curse: { name: string; note: string };
};

export const EN_SKETCH: SketchText = {
  sample: { name: 'Visitors', note: 'per group', rows: ['Small', 'Mid', 'Large'], tag: 'rise' },
  split: { name: 'Split', note: 'half each, as planned', a: 'A', b: 'B', plan: 'Plan', more: 'more', fewer: 'fewer' },
  peek: { name: 'False winners', note: 'by daily check' },
  curse: { name: 'Overstatement', note: 'small test to large' },
};
