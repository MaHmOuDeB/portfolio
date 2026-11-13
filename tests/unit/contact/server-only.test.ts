// The contact form's server side is marked server-only, so a later client import of it fails the build
// instead of shipping the send logic to the browser. Next implements `import 'server-only'` in its
// compiler (no package); the unit tests resolve it to the empty module (vitest.config.mts).
import { readFileSync } from 'node:fs';

const SERVER_ONLY = ['src/lib/env.ts', 'src/lib/contact/send.ts', 'src/lib/contact/address.ts', 'src/lib/contact/issue.ts', 'src/lib/contact/limiter.ts', 'src/lib/contact/handle.ts'];

describe('the contact form server modules', () => {
  it.each(SERVER_ONLY)('%s imports server-only', (file) => {
    expect(readFileSync(file, 'utf8')).toMatch(/^import 'server-only';$/m);
  });

  it('keeps the client form free of them: it imports only types from the server side', () => {
    const form = readFileSync('src/components/contact/ContactForm.tsx', 'utf8');
    for (const line of form.split('\n').filter((l) => l.startsWith('import '))) {
      if (/lib\/contact\/(handle|send|address|issue|limiter)|lib\/env/.test(line)) expect(line, line).toMatch(/^import type /);
    }
  });
});
