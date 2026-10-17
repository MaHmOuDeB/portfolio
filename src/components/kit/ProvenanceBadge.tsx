// Where a Figure's numbers come from. Three forms in one neutral style: the wording carries the
// meaning, never the colour. Server-safe, no hooks.
export type Provenance = 'simulated' | 'public-data' | 'live';

const LABEL: Record<Provenance, string> = {
  simulated: 'Simulated',
  'public-data': 'Public data',
  live: 'Live from this site',
};

export function ProvenanceBadge({ kind }: { kind: Provenance }) {
  return (
    <span className="inline-block rounded-sm border border-muted px-2 text-xs whitespace-nowrap text-ink">
      {LABEL[kind]}
    </span>
  );
}
