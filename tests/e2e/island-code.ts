import type { Page, Request } from '@playwright/test';

// The script requests a lazy-island test may blame on the page: every script except a chunk that
// Next's router loaded while prefetching another page.
//
// The router prefetches each in-view <Link> that keeps the default prefetch (the header's link to "/"):
// it fetches that route's RSC payload with a `Next-Router-Prefetch` request header and decodes it.
// Each client reference in the payload is an import row, `<id>:I[<module>,["/_next/static/chunks/
// <name>.js", ...],"<export>"]`, and decoding one makes React's Flight client preload its chunks
// through the bundler's chunk loader, which appends a <script>. That script request has no prefetch
// header of its own, so it is matched to the payload instead: a script is another page's prefetch
// when its path is in the chunk list of an import row of a prefetch response for another pathname.
// When that prefetch lands is up to the router (in WebKit often after `networkidle`), so a test
// cannot wait it out. An island's own code is a lazy import inside a client component, not a client
// reference, so no payload lists it and it is always counted; each lazy test also asserts that the
// scripts arriving on intent are counted.

const PREFETCH_HEADER = 'next-router-prefetch';
const IMPORT_ROW = /^[0-9a-z]+:I\[[^,]+,(\[[^\]]*\])/gm;

type Prefetch = { pathname: string; body: Promise<string> };

export type ScriptWatch = {
  /** From now on, record every script request. */
  start(): void;
  /** The recorded scripts, as paths, less the chunks of another page's prefetch. */
  counted(): Promise<string[]>;
};

/** The chunk paths of the import rows in an RSC payload. */
function importedChunks(body: string): Set<string> {
  const chunks = new Set<string>();
  for (const [, list = '[]'] of body.matchAll(IMPORT_ROW)) {
    try {
      for (const chunk of JSON.parse(list) as unknown[]) if (typeof chunk === 'string') chunks.add(chunk);
    } catch {
      // Not a chunk list: excuses nothing.
    }
  }
  return chunks;
}

/** Watches the page's script and prefetch requests. Call it before the first navigation. */
export function watchScripts(page: Page): ScriptWatch {
  const prefetches: Promise<Prefetch | null>[] = [];
  const scripts: string[] = [];
  let recording = false;
  page.on('request', (request: Request) => {
    if (recording && request.resourceType() === 'script') scripts.push(new URL(request.url()).pathname);
    // The page's own fetch sets the header, so it is in the headers known when the request starts.
    if (request.headers()[PREFETCH_HEADER] === undefined) return;
    prefetches.push(
      request
        .response()
        // Read the body now: a response that is no longer the page's may not be readable later.
        .then((response) => response && { pathname: new URL(request.url()).pathname, body: response.text() })
        .catch(() => null),
    );
  });
  return {
    start() {
      recording = true;
    },
    async counted() {
      const own = new URL(page.url()).pathname;
      const others = (await Promise.all(prefetches)).filter((p): p is Prefetch => p !== null && p.pathname !== own);
      const excused = new Set<string>();
      for (const body of await Promise.all(others.map((p) => p.body.catch(() => '')))) {
        for (const chunk of importedChunks(body)) excused.add(chunk);
      }
      return scripts.filter((path) => !excused.has(path));
    },
  };
}
