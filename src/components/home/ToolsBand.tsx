// The tools I have shipped with: a centred small line and a static grid of chips, in a ruled band.
// The list is the About page's own data, imported, never retyped. Server-safe.
import { TOOLS_LABEL } from '../../../content/home.ts';
import { SHIPPED_TOOLS } from '../../../content/about';
import { Chip } from '@/components/frame';

const LINE_ID = 'shipped-title';

export function ToolsBand() {
  return (
    <section data-home-shipped="" data-rule="" aria-labelledby={LINE_ID} className="py-10 text-center md:py-12">
      <p id={LINE_ID} className="text-sm text-muted">
        {TOOLS_LABEL}
      </p>
      <ul role="list" aria-labelledby={LINE_ID} className="mx-auto mt-5 flex max-w-figure flex-wrap justify-center gap-2">
        {SHIPPED_TOOLS.map((t) => (
          <li key={t.tool}>
            <Chip>{t.tool}</Chip>
          </li>
        ))}
      </ul>
    </section>
  );
}
