// Fails when a build contains a kitchen-sink route. The kitchen sink is dev-only: it is built
// only with KITCHEN_SINK=1 (see next.config.ts), so the production build must not list it.
//
//   npm run build && npm run assert:no-kitchen-sink
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MANIFEST = join('.next', 'server', 'app-paths-manifest.json');

/** The keys of an app-paths manifest that belong to the kitchen sink. */
export function findKitchenSinkRoutes(manifest: Record<string, string>): string[] {
  return Object.keys(manifest).filter((route) => route.includes('kitchen-sink'));
}

function main(): number {
  if (!existsSync(MANIFEST)) {
    console.error(`${MANIFEST} not found: run "npm run build" first`);
    return 1;
  }
  const routes = findKitchenSinkRoutes(JSON.parse(readFileSync(MANIFEST, 'utf8')) as Record<string, string>);
  if (routes.length > 0) {
    console.error(`the build contains kitchen-sink routes (build without KITCHEN_SINK=1):\n${routes.join('\n')}`);
    return 1;
  }
  console.log('no kitchen-sink route in the build');
  return 0;
}

if (import.meta.main) process.exit(main());
