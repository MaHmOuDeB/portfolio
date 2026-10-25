// The live experiment's published data: cumulative counts, the intervals once unblinded, and the
// pre-registration it is checked against. Static and regenerated every 5 minutes; an error during
// regeneration keeps the last good file.
import { serverEnv } from '@/lib/env';
import { getExperimentSnapshot } from '@/lib/experiment/live';
import { toPublicData } from '@/lib/experiment/public-data';

export const revalidate = 300;

export async function GET(): Promise<Response> {
  const data = toPublicData(await getExperimentSnapshot(), { commit: serverEnv().gitCommit ?? null });
  return Response.json(data, { headers: { 'Content-Disposition': 'inline; filename="data.json"' } });
}
