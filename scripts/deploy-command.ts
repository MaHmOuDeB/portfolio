// Builds the argv for `vercel deploy`. Production is only ever targeted once the site is launched,
// so the guard lives here, where it is unit-tested, instead of in workflow YAML.
export function deployCommand(opts: { launched: boolean }): string[] {
  const argv = ['deploy', '--prebuilt'];
  if (opts.launched) argv.push('--prod');
  return argv;
}

function main(): void {
  const launched = process.argv.includes('--launched') || process.env.LAUNCHED === 'true';
  process.stdout.write(`${deployCommand({ launched }).join(' ')}\n`);
}

if (import.meta.main) main();
