'use client';

// The language menu: two plain links, "English" and "Deutsch", each in its own language, the current
// one marked aria-current. Each opens the same page in the other language (or that language's home
// page when the page has no twin), and a click adds the page's own query and hash, so a Figure's
// setting survives the switch. Plain anchors: crossing from one root layout to the other reloads the
// document anyway, and the links work without JavaScript.
// - `header`: a <details> in the header row, from lg (the Menu takes over below it).
// - `rows`: two link rows for the inside of the Menu. Never a nested disclosure.
import { useEffect, useRef, type MouseEvent } from 'react';
import { usePathname } from 'next/navigation';
import { cx } from '@/lib/cx';
import type { Locale } from '@/lib/i18n/locale';
import { languageHref, languageTargets } from '@/lib/i18n/language';

export type LanguageText = { label: string; english: string; german: string };

type Props = { locale: Locale; text: LanguageText; variant: 'header' | 'rows' };

/** Reads the target from the address the reader is at now, so a stale server render cannot send them astray. */
function follow(event: MouseEvent<HTMLAnchorElement>, language: Locale): void {
  const target = languageTargets(window.location.pathname)[language];
  event.currentTarget.href = languageHref(target, window.location);
}

export function LanguageMenu({ locale, text, variant }: Props) {
  const targets = languageTargets(usePathname());
  const details = useRef<HTMLDetailsElement>(null);
  const items: { language: Locale; name: string }[] = [
    { language: 'en', name: text.english },
    { language: 'de', name: text.german },
  ];

  // Escape closes the open list and returns focus to its button, as the Menu does.
  useEffect(() => {
    const el = details.current;
    if (!el) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !el.open) return;
      el.open = false;
      el.querySelector('summary')?.focus();
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, []);

  const links = items.map(({ language, name }) => {
    const current = language === locale;
    return (
      <li key={language} className={variant === 'rows' ? 'border-b border-hairline' : undefined}>
        <a
          href={targets[language]}
          hrefLang={language}
          lang={language}
          aria-current={current ? 'true' : undefined}
          data-touch-target
          onClick={(event) => follow(event, language)}
          onAuxClick={(event) => follow(event, language)}
          className={cx(
            'inline-flex items-center text-sm font-medium transition-colors hover:text-ink focus-visible:text-ink',
            variant === 'rows' ? 'min-h-12 w-full text-lg text-ink' : cx('min-h-(--size-target) w-full px-4', current ? 'text-ink' : 'text-muted'),
          )}
        >
          <span className={cx('border-b-2 py-0.5', current ? 'border-ink' : 'border-transparent')}>{name}</span>
        </a>
      </li>
    );
  });

  if (variant === 'rows') {
    return (
      <div className="pt-4">
        <p className="text-sm font-medium text-muted">{text.label}</p>
        <ul>{links}</ul>
      </div>
    );
  }

  return (
    <details
      ref={details}
      data-language-menu=""
      className="group relative hidden lg:block"
      onBlur={(event) => {
        const el = event.currentTarget;
        const next = event.relatedTarget;
        if (next instanceof Node && !el.contains(next)) el.open = false;
      }}
    >
      <summary
        data-touch-target
        aria-label={`${text.label}: ${locale === 'de' ? text.german : text.english}`}
        className="inline-flex min-h-(--size-target) min-w-(--size-target) cursor-pointer list-none items-center justify-center rounded-md border border-hairline-strong bg-surface px-3 text-sm font-medium text-ink transition-colors group-open:border-ink marker:hidden [&::-webkit-details-marker]:hidden"
      >
        {locale.toUpperCase()}
      </summary>
      <ul className="absolute top-full right-0 z-(--z-menu) mt-1 min-w-36 rounded-md border border-hairline bg-surface py-1">
        {links}
      </ul>
    </details>
  );
}
