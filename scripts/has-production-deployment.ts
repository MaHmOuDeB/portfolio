import { readFileSync } from 'node:fs';

// Reads the body of Vercel's `GET /v6/deployments?target=production&limit=1` and says whether the
// project already has a production deployment (in any state). Vercel puts a project's first
// deployment in production when no target reaches the API, and the CLI drops `--target=preview`
// before the request, so the deploy step refuses to run until this is true. Anything that is not
// the expected shape counts as "no", so the caller fails closed.
export function hasProductionDeployment(body: string): boolean {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== 'object' || parsed === null) return false;
    const deployments = (parsed as { deployments?: unknown }).deployments;
    return Array.isArray(deployments) && deployments.length > 0;
  } catch {
    return false;
  }
}

function main(): void {
  process.stdout.write(`${hasProductionDeployment(readFileSync(0, 'utf8')) ? 'yes' : 'no'}\n`);
}

if (import.meta.main) main();
