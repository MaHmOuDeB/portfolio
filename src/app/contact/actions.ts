'use server';

// The contact form's Server Action. A plain POST without JavaScript and a fetch with it both land
// here: a sent message redirects (303) to /contact?sent=1, and anything else returns the state the
// form re-renders with, values kept, in the response body (never in the address). The limiter lives
// in this module, so its key is drawn once per server instance.
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { addressFrom } from '@/lib/contact/address';
import { handleContact, type ContactState } from '@/lib/contact/handle';
import { createContactLimiter } from '@/lib/contact/limiter';
import { contactConfig, deliver } from '@/lib/contact/send';
import { serverEnv } from '@/lib/env';

const limiter = createContactLimiter();

export async function sendContact(_previous: ContactState, formData: FormData): Promise<ContactState> {
  const state = await handleContact(formData, {
    now: Date.now,
    ip: addressFrom(await headers()),
    limiter,
    deliver: (message) => deliver(message, contactConfig(serverEnv()), { fetch, log: (line) => console.error(line) }),
  });
  if (state.status === 'sent') redirect('/contact?sent=1');
  return state;
}
