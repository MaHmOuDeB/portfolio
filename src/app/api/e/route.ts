// The experiment's event endpoint. POST only: Next answers any other method with 405.
import { eventDeps } from '@/lib/experiment/deps';
import { handleEvent } from '@/lib/experiment/handler';

export async function POST(request: Request): Promise<Response> {
  return handleEvent(request, eventDeps());
}
