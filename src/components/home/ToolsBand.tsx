// The methods and tools band: a centred small line, then two groups side by side from lg (one column
// below), each with its name, what it is for, a static list of chips and where the site shows them,
// then one quiet line for the engineering. Home's own list (HOME_TOOLS); About keeps its longer one.
// Server-safe: no link, no control, no motion.
import { HOME_TOOLS, TOOLS_LABEL } from '../../../content/home.ts';
import { Chip } from '@/components/frame';

const LINE_ID = 'shipped-title';

export function ToolsBand() {
  return (
    <section data-home-shipped="" data-rule="" aria-labelledby={LINE_ID} className="py-10 md:py-12">
      <p id={LINE_ID} data-tools-label="" className="text-center text-sm text-muted">
        {TOOLS_LABEL}
      </p>
      <div data-tools-groups="" className="mx-auto mt-6 grid max-w-figure grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
        {HOME_TOOLS.groups.map((g) => {
          const nameId = `tools-${g.id}-name`;
          return (
            <div key={g.id} data-tools-group={g.id} className="min-w-0">
              <p id={nameId} data-tools-name="" className="text-sm font-semibold text-ink">
                {g.name}
              </p>
              <p data-tools-line="" className="mt-1 text-sm text-muted">
                {g.line}
              </p>
              <ul role="list" aria-labelledby={nameId} className="mt-4 flex flex-wrap gap-2">
                {g.items.map((item) => (
                  <li key={item}>
                    <Chip>{item}</Chip>
                  </li>
                ))}
              </ul>
              <p data-tools-seen="" className="mt-3 text-xs text-muted">
                {g.seenIn}
              </p>
            </div>
          );
        })}
      </div>
      <p data-tools-engineering="" className="mx-auto mt-8 max-w-figure text-sm text-muted">
        {HOME_TOOLS.engineering}
      </p>
    </section>
  );
}
