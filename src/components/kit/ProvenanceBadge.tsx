// Where a Figure's numbers come from. Three forms in one neutral style: the wording carries the
// meaning, never the colour. Server-safe, no hooks.
import { EN_BADGE, type BadgeText } from './text';

export type Provenance = 'simulated' | 'public-data' | 'live';

export function ProvenanceBadge({ kind, text = EN_BADGE }: { kind: Provenance; text?: BadgeText }) {
  const LABEL: Record<Provenance, string> = { simulated: text.simulated, 'public-data': text.publicData, live: text.live };
  return (
    <span className="inline-block rounded-sm border border-muted px-2 text-xs whitespace-nowrap text-ink">
      {LABEL[kind]}
    </span>
  );
}
