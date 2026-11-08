// Prints the SHA-256 of the pre-registered design (see src/lib/experiment/prereg-hash.ts).
// Run it with `npm run prereg:hash`; docs/experiment/prereg.md carries the value.
import { fileURLToPath } from 'node:url';
import { preregHash } from '../src/lib/experiment/prereg-hash.ts';

export { canonicalJson, preregHash } from '../src/lib/experiment/prereg-hash.ts';

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(preregHash());
}
