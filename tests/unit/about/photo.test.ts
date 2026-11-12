import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { aboutPhoto } from '../../../content/about-photo.ts';

// The About photograph is a real photo, cropped to a 4:5 rectangle and stripped of every metadata
// segment (EXIF, GPS, XMP, IPTC, ICC, comments) before it is committed. This reads the JPEG's
// segment headers directly, so the check needs no image library.

const ROOT = join(import.meta.dirname, '../../..');

type JpegInfo = { width: number; height: number; segments: string[]; problems: string[] };

/** Every segment before the image data, the frame size, and anything that carries metadata. */
export function inspectJpeg(file: Uint8Array): JpegInfo {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const problems: string[] = [];
  const segments: string[] = [];
  let width = 0;
  let height = 0;
  if (view.getUint16(0) !== 0xffd8) return { width, height, segments, problems: ['not a JPEG'] };
  let p = 2;
  while (p + 4 <= file.length) {
    if (file[p] !== 0xff) {
      problems.push(`no marker at byte ${p}`);
      break;
    }
    const marker = file[p + 1]!;
    if (marker === 0xd9) break;
    const length = view.getUint16(p + 2);
    const name = marker >= 0xe0 && marker <= 0xef ? `APP${marker - 0xe0}` : marker === 0xfe ? 'COM' : `FF${marker.toString(16).toUpperCase()}`;
    segments.push(name);
    const body = Buffer.from(file.subarray(p + 4, p + 2 + length));
    if (marker >= 0xe1 && marker <= 0xef) {
      const id = body.subarray(0, 32).toString('latin1');
      const kind = id.startsWith('Exif') ? 'EXIF' : id.includes('ns.adobe.com/xap') ? 'XMP' : id.startsWith('ICC_PROFILE') ? 'ICC' : id.startsWith('Photoshop') ? 'IPTC' : name;
      problems.push(`${kind} metadata (${name})`);
      if (body.includes('GPS')) problems.push(`location data (${name})`);
    }
    if (marker === 0xfe) problems.push('comment (COM)');
    // Start-of-frame markers carry the size: C0 to CF except C4 (DHT), C8 (JPG) and CC (DAC).
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      height = view.getUint16(p + 5);
      width = view.getUint16(p + 7);
    }
    if (marker === 0xda) break;
    p += 2 + length;
  }
  return { width, height, segments, problems };
}

/** A minimal baseline JPEG header: SOI, optional extra segments, a frame of the given size, SOS. */
function syntheticJpeg(width: number, height: number, extra: Buffer[] = []): Uint8Array {
  const segment = (marker: number, body: Buffer) => {
    const head = Buffer.alloc(4);
    head.writeUInt16BE(0xff00 | marker, 0);
    head.writeUInt16BE(body.length + 2, 2);
    return Buffer.concat([head, body]);
  };
  const jfif = segment(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1'));
  const sof = Buffer.alloc(6);
  sof.writeUInt8(8, 0);
  sof.writeUInt16BE(height, 1);
  sof.writeUInt16BE(width, 3);
  sof.writeUInt8(0, 5);
  const sos = segment(0xda, Buffer.from([0]));
  return Buffer.concat([Buffer.from([0xff, 0xd8]), jfif, ...extra, segment(0xc0, sof), sos, Buffer.from([0xff, 0xd9])]);
}

function app(marker: number, text: string): Buffer {
  const head = Buffer.alloc(4);
  head.writeUInt16BE(0xff00 | marker, 0);
  head.writeUInt16BE(text.length + 2, 2);
  return Buffer.concat([head, Buffer.from(text, 'latin1')]);
}

describe('inspectJpeg', () => {
  it('passes a clean JPEG and reads its size', () => {
    expect(inspectJpeg(syntheticJpeg(960, 1200))).toEqual({ width: 960, height: 1200, segments: ['APP0', 'FFC0', 'FFDA'], problems: [] });
  });

  it('rejects EXIF, location, XMP, ICC and comment segments', () => {
    const file = syntheticJpeg(960, 1200, [
      app(0xe1, 'Exif\0\0MM GPSLatitude'),
      app(0xe1, 'http://ns.adobe.com/xap/1.0/\0<x/>'),
      app(0xe2, 'ICC_PROFILE\0'),
      app(0xfe, 'shot on a phone'),
    ]);
    expect(inspectJpeg(file).problems).toEqual([
      'EXIF metadata (APP1)',
      'location data (APP1)',
      'XMP metadata (APP1)',
      'ICC metadata (APP2)',
      'comment (COM)',
    ]);
  });

  it('reads a wrong size so the size check can reject it', () => {
    expect(inspectJpeg(syntheticJpeg(1000, 1000))).toMatchObject({ width: 1000, height: 1000 });
  });

  it('rejects a file that is not a JPEG', () => {
    expect(inspectJpeg(Buffer.from('<svg/>')).problems).toEqual(['not a JPEG']);
  });
});

describe('the About photograph', () => {
  const file = readFileSync(join(ROOT, 'public', aboutPhoto.src));
  const info = inspectJpeg(file);

  it('carries no metadata: no EXIF, location, XMP, IPTC, ICC profile or comment', () => {
    expect(info.problems).toEqual([]);
    // A JFIF header (APP0) is allowed; every other application segment and any comment is not.
    expect(info.segments.filter((s) => (s.startsWith('APP') && s !== 'APP0') || s === 'COM')).toEqual([]);
  });

  it('is a 4:5 rectangle wide enough for the 480 and 960 px variants', () => {
    expect({ width: info.width, height: info.height }).toEqual({ width: 960, height: 1200 });
    expect(info.width * 5).toBe(info.height * 4);
  });

  it('matches the size and path its descriptor gives the page', () => {
    expect(aboutPhoto).toEqual({
      src: '/images/about.jpg',
      width: info.width,
      height: info.height,
      alt: 'Mahmoud El Bergui, smiling at the camera, in a graduation cap and gown over a white shirt and dark tie',
    });
  });

  it('stays within a byte budget for a below-the-fold image', () => {
    expect(file.length).toBeLessThan(250_000);
  });
});
