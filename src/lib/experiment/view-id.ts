// The id of one page view for the beacon: a version 4 UUID. randomUUID exists only in a secure
// context (https, localhost) and from Safari 15.4, so a page served over plain http on a LAN or an
// older iPhone falls back to getRandomValues, which exists everywhere. The server checks the shape
// (UUID_V4 in events.ts) either way.
type IdCrypto = {
  randomUUID?: () => string;
  getRandomValues: <T extends ArrayBufferView | null>(array: T) => T;
};

export function newViewId(c: IdCrypto = globalThis.crypto): string {
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40; // version 4
  b[8] = (b[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
