export type VercelEnv = 'production' | 'preview' | 'development';

export interface ServerEnv {
  kvUrl?: string;
  kvToken?: string;
  kvReadOnlyToken?: string;
  edgeConfig?: string;
  internalTrafficSecret?: string;
  excludeToken?: string;
  ratelimitHmacKey?: string;
  vercelEnv: VercelEnv;
}

function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value;
}

function toVercelEnv(value: string | undefined): VercelEnv {
  return value === 'production' || value === 'preview' ? value : 'development';
}

/**
 * Typed reader for server-side configuration. Never throws and has no side
 * effects, so `next build` works with a completely empty environment. Every
 * variable read here must be listed in `.env.example`.
 */
export function serverEnv(): ServerEnv {
  return {
    kvUrl: nonEmpty(process.env.KV_REST_API_URL),
    kvToken: nonEmpty(process.env.KV_REST_API_TOKEN),
    kvReadOnlyToken: nonEmpty(process.env.KV_REST_API_READ_ONLY_TOKEN),
    edgeConfig: nonEmpty(process.env.EDGE_CONFIG),
    internalTrafficSecret: nonEmpty(process.env.INTERNAL_TRAFFIC_SECRET),
    excludeToken: nonEmpty(process.env.EXCLUDE_TOKEN),
    ratelimitHmacKey: nonEmpty(process.env.RATELIMIT_HMAC_KEY),
    vercelEnv: toVercelEnv(nonEmpty(process.env.VERCEL_ENV)),
  };
}
