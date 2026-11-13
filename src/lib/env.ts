import 'server-only';

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
  productionHost?: string;
  deploymentHost?: string;
  gitCommit?: string;
  fakeStore: boolean;
  /**
   * VERCEL=1: running on Vercel. Vercel always sets VERCEL_ENV too, so on Vercel a development
   * VERCEL_ENV (or none) is a misconfiguration, never a reason to show the no-credentials fixture.
   */
  onVercel?: boolean;
  /**
   * NEXT_PHASE=phase-production-build: inside `next build` (static generation), which sets it before
   * it starts the workers that prerender. A build never fails on experiment data.
   */
  buildPhase?: boolean;
  /**
   * EXPERIMENT_CLOCK_OFFSET_MS: a test clock for the e2e run, in milliseconds added to the server's
   * time. Only the loopback fake store outside production honours it (lib/experiment/clock.ts).
   */
  clockOffsetMs?: number;
  /** The contact form's Resend API key. Never logged. */
  resendApiKey?: string;
  /** The inbox the contact form delivers to. Never logged, never rendered. */
  contactToEmail?: string;
  /**
   * RESEND_API_URL: the e2e run's loopback fake of Resend's endpoint. lib/contact/send.ts honours it
   * only outside production and only for a loopback host.
   */
  resendApiUrl?: string;
}

function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value;
}

/** A whole number of milliseconds, or undefined for anything else. */
function integerMs(value: string | undefined): number | undefined {
  if (value === undefined || !/^-?\d+$/.test(value)) return undefined;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : undefined;
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
    edgeConfig: nonEmpty(process.env.GLOBAL_CONFIG),
    internalTrafficSecret: nonEmpty(process.env.INTERNAL_TRAFFIC_SECRET),
    excludeToken: nonEmpty(process.env.EXCLUDE_TOKEN),
    ratelimitHmacKey: nonEmpty(process.env.RATELIMIT_HMAC_KEY),
    vercelEnv: toVercelEnv(nonEmpty(process.env.VERCEL_ENV)),
    productionHost: nonEmpty(process.env.VERCEL_PROJECT_PRODUCTION_URL),
    deploymentHost: nonEmpty(process.env.VERCEL_URL),
    gitCommit: nonEmpty(process.env.VERCEL_GIT_COMMIT_SHA),
    fakeStore: process.env.EXPERIMENT_FAKE_STORE === '1',
    onVercel: process.env.VERCEL === '1',
    buildPhase: process.env.NEXT_PHASE === 'phase-production-build',
    clockOffsetMs: integerMs(nonEmpty(process.env.EXPERIMENT_CLOCK_OFFSET_MS)),
    resendApiKey: nonEmpty(process.env.RESEND_API_KEY),
    contactToEmail: nonEmpty(process.env.CONTACT_TO_EMAIL),
    resendApiUrl: nonEmpty(process.env.RESEND_API_URL),
  };
}
