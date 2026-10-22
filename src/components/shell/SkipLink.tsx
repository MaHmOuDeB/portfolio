// First tab stop on every page. Hidden until focused, then a visible 44 px target.
export function SkipLink() {
  return (
    <a
      href="#main"
      data-touch-target
      className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-(--z-menu) focus:inline-flex focus:min-h-(--size-target) focus:items-center focus:rounded-sm focus:bg-ink focus:px-4 focus:text-bg"
    >
      Skip to content
    </a>
  );
}
