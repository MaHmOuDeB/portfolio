// The experience band: where I have worked and studied, as plain text names in two small groups
// ("Work" and "Study"), centred under a small line. The names are read from the About timeline
// (content/about.tsx), never retyped: each entry's place without its town and without a "(now ...)"
// note. No logos. Server-safe.
import { TIMELINE } from '../../../content/about';
import { HOME_EXPERIENCE } from '../../../content/home.ts';
import { Chip } from '@/components/frame/Chip';

/** The name the band prints for a timeline entry: its place, without the town and any "(now ...)" note. */
export function experienceName(where: string): string {
  return where.replace(/,[^,]*$/, '').replace(/\s*\(now [^)]*\)/, '').trim();
}

/** The band's names for a list of timeline prefixes, in that order. Throws when one is not on the timeline. */
export function experienceNames(prefixes: readonly string[]): string[] {
  return prefixes.map((prefix) => {
    const entry = TIMELINE.find((t) => t.where.startsWith(prefix));
    if (!entry) throw new Error(`No timeline entry starts with "${prefix}"`);
    return experienceName(entry.where);
  });
}

export function ExperienceBand() {
  return (
    <section data-experience="" data-rule="" aria-labelledby="experience-title">
      <p id="experience-title" data-experience-title="">
        {HOME_EXPERIENCE.title}
      </p>
      <div data-experience-groups="">
        {HOME_EXPERIENCE.groups.map((g) => (
          <div key={g.label} data-experience-group="">
            <Chip>{g.label}</Chip>
            <ul data-experience-names="">
              {experienceNames(g.from).map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
