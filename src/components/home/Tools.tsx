// "Tools I've built": one row per tool, its name as the link to its page and one line on what it
// does. The figures in a line are Facts. Server-safe.
import { HOME_TOOLS } from '../../../content/home.ts';
import { TextLink } from '@/components/kit/TextLink';
import { Parts } from './Parts';

export function Tools() {
  return (
    <section data-home-tools="" aria-labelledby="home-tools-title">
      <h2 id="home-tools-title" className="text-xl font-semibold">
        Tools I&apos;ve built
      </h2>
      <ul className="mt-6 border-t border-line">
        {HOME_TOOLS.map((tool) => (
          <li key={tool.id} data-tool={tool.id} className="grid gap-y-1 border-b border-line py-4 md:grid-cols-12 md:gap-x-8">
            <h3 className="text-base font-semibold md:col-span-4">
              <TextLink href={tool.href} standalone>
                {tool.name}
              </TextLink>
            </h3>
            <p data-tool-line="" className="max-w-text text-base text-muted md:col-span-8 md:self-center">
              <Parts parts={tool.parts} />
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
