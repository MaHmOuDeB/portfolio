// The owner's exclusion cookie: POST sets it, DELETE clears it. Any other method gets 405 from
// Next. Dynamic only because it is a non-GET handler; it renders no page.
import { serverEnv } from '@/lib/env';
import { handleExclude } from '@/lib/experiment/exclude';

export async function POST(request: Request): Promise<Response> {
  return handleExclude(request, serverEnv());
}

export async function DELETE(request: Request): Promise<Response> {
  return handleExclude(request, serverEnv());
}
