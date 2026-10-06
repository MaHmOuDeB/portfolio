// Builds the argv for `vercel deploy`. Production is only ever targeted once the site is launched,
// so the guard lives here, where it is unit-tested, instead of in workflow YAML. The target is
// always stated explicitly: Vercel assigns a project's first deployment to production when no
// target is given, so merely omitting --prod is not a guard.
export function deployCommand(opts: { launched: boolean }): string[] {
  return ['deploy', '--prebuilt', opts.launched ? '--prod' : '--target=preview'];
}

function main(): void {
  const launched = process.argv.includes('--launched') || process.env.LAUNCHED === 'true';
  process.stdout.write(`${deployCommand({ launched }).join(' ')}\n`);
}

if (import.meta.main) main();
