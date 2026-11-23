// The ruled row with the three "I automate." lines, a compact list without a title under a hairline
// that draws in as it enters. It ends the Automation group on the Work page. Server-safe.
import type { Locale } from '@/lib/i18n/locale';
import { homeCopy } from './copy';

export function AutomateRow({ locale = 'en' }: { locale?: Locale } = {}) {
  return (
    <div data-home-automate="" className="mt-2.5">
      <span data-depth-draw="" aria-hidden="true" className="block h-px bg-hairline" />
      <ul role="list" data-depth-trace="row" className="grid grid-cols-1 md:grid-cols-[minmax(0,calc(100%/3_-_0.5rem))_minmax(0,1fr)_minmax(0,calc(100%/3_-_0.5rem))]">
        {homeCopy(locale).automate.map((line) => (
          <li key={line} className="border-hairline py-5 text-sm text-muted md:px-6 md:first:pl-0 md:last:pr-0 md:[&+li]:border-l max-md:[&+li]:border-t">
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}
