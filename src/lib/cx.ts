// Joins class names, skipping falsy parts. The whole of what clsx would do for this site.
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
