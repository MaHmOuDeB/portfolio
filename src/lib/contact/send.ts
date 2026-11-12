// Delivery: one server-side request to Resend's REST API (no SDK), with exactly from, to, reply_to,
// subject and a plain-text body: no HTML, no tracking options, no tags. It fails closed when either
// variable is missing, and logs only a variable's name or Resend's status code, never a value or a
// response body (Resend error bodies can echo the addresses). Nothing is retried or kept.
import type { ServerEnv } from '../env.ts';
import { reasonLabel, type ContactValues } from './fields.ts';

export const RESEND_URL = 'https://api.resend.com/emails';
const FROM = 'Portfolio contact <onboarding@resend.dev>';
const TIMEOUT_MS = 10_000;

export type ContactMessage = ContactValues;
export type ContactConfig = { apiKey?: string; to?: string; apiUrl: string };
export type DeliverDeps = { fetch: typeof fetch; log: (line: string) => void };

function isLoopback(value: string): boolean {
  try {
    const host = new URL(value).hostname;
    return host === '127.0.0.1' || host === 'localhost' || host === '[::1]';
  } catch {
    return false;
  }
}

/** The send settings. RESEND_API_URL (the e2e fake) counts only outside production, on loopback. */
export function contactConfig(env: ServerEnv): ContactConfig {
  const override = env.vercelEnv !== 'production' && env.resendApiUrl !== undefined && isLoopback(env.resendApiUrl);
  return { apiKey: env.resendApiKey, to: env.contactToEmail, apiUrl: override ? env.resendApiUrl! : RESEND_URL };
}

export async function deliver(m: ContactMessage, config: ContactConfig, deps: DeliverDeps): Promise<'sent' | 'failed'> {
  const missing = [config.apiKey === undefined && 'RESEND_API_KEY', config.to === undefined && 'CONTACT_TO_EMAIL'].filter(
    (name): name is string => typeof name === 'string',
  );
  for (const name of missing) deps.log(`contact form: ${name} is not set; nothing was sent`);
  if (missing.length > 0) return 'failed';

  const reason = reasonLabel(m.reason) ?? m.reason;
  const body = {
    from: FROM,
    to: config.to,
    reply_to: m.email,
    subject: `[Portfolio] ${reason}: ${m.subject}`,
    text: `Name: ${m.name}\nE-mail: ${m.email}\nReason: ${reason}\n\nMessage:\n${m.message}\n`,
  };
  let response: Response;
  try {
    response = await deps.fetch(config.apiUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch {
    deps.log('contact form: the request to Resend failed; nothing was sent');
    return 'failed';
  }
  if (!response.ok) {
    deps.log(`contact form: Resend answered ${response.status}; nothing was sent`);
    return 'failed';
  }
  return 'sent';
}
