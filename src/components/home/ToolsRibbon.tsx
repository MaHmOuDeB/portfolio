// The tools I have shipped with, as a ribbon of words that slides with the scroll. The list is the
// About page's own data, imported, never retyped. The ribbon clips and fades its own edges (it
// reaches into the page's side padding for the fade), so this wrapper must not clip. Server-safe.
import { TOOLS_LABEL } from '../../../content/home.ts';
import { SHIPPED_TOOLS } from '../../../content/about';
import { Ribbon } from '@/components/depth/Ribbon';

export function ToolsRibbon() {
  return (
    <div data-home-ribbon="" className="mt-12 md:mt-section">
      <Ribbon items={SHIPPED_TOOLS.map((t) => t.tool)} label={TOOLS_LABEL} />
    </div>
  );
}
