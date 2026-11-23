// A string with {name} placeholders that a client island fills. Client-safe: no imports.
// The brand names the placeholders for the type checker; it cannot see inside the string, so a unit
// test checks that each template holds every placeholder of its brand.
export type Template<P extends string> = string & { readonly __placeholders?: P };

/** Replaces each {name} with its value in one pass (a value is never expanded again). A missing value throws. */
export function fill<P extends string>(t: Template<P>, values: Record<P, string>): string {
  return t.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (_m, name: string) => {
    if (!Object.hasOwn(values, name)) throw new Error(`missing value for {${name}}`);
    return (values as Record<string, string>)[name]!;
  });
}
