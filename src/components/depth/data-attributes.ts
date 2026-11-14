// Extra data-* attributes a depth component passes through to its root element, so a page can add
// `data-depth-rise`, `data-depth-book` and its own tracking attributes.
export type DataAttributes = { [K in `data-${string}`]?: string | number | boolean | undefined };
