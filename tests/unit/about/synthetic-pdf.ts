// Writes small synthetic PDFs for the web CV checker's tests: Helvetica text at given positions,
// link annotations, an Info dictionary, and on request a JavaScript action or annotations inside a
// compressed object stream (so the checker's hidden-link inspection is exercised). No real CV text
// is ever written here; every fixture string comes from the test that calls it.
import { deflateSync } from 'node:zlib';

export type Line = { text: string; x?: number; y?: number; size?: number };
export type Link = {
  page: number;
  uri: string;
  rect?: [number, number, number, number];
  hex?: boolean;
  obfuscateName?: boolean;
  /** A /Contents string on the link annotation (never shown on the page). */
  contents?: string;
};
export type PdfSpec = {
  pages: Line[][];
  links?: Link[];
  info?: Record<string, string>;
  /** Adds an OpenAction that runs JavaScript. */
  javascript?: boolean;
  /** Writes every link annotation into a FlateDecode object stream with a cross-reference stream. */
  objectStream?: boolean;
  /** A text annotation (a note) on page 1 whose contents never reach the page text. */
  note?: string;
  /** Raw annotation dictionaries added to page 1 (for example an unlisted subtype). */
  rawAnnots?: string[];
  /** Raw text appended to the catalog dictionary (for example /OCProperties). */
  catalogExtra?: string;
  /** An outline (bookmark) with this title. */
  outlineTitle?: string;
  /** Draw a 2x2 image XObject on page 1. */
  image?: boolean;
  /** Draw a 2x2 inline image (BI ... ID ... EI) on page 1. */
  inlineImage?: boolean;
};

// WinAnsiEncoding for the few non-Latin-1 characters the fixtures use.
const WIN_ANSI: Record<string, number> = { '•': 0x95, '–': 0x96, '—': 0x97, '’': 0x92, '“': 0x93, '”': 0x94, '…': 0x85 };

function encode(text: string): Buffer {
  const bytes: number[] = [];
  for (const ch of text) {
    const mapped = WIN_ANSI[ch];
    const code = mapped ?? ch.codePointAt(0)!;
    if (code > 0xff) throw new Error(`synthetic-pdf: ${JSON.stringify(ch)} is not in WinAnsiEncoding`);
    if (code === 0x28 || code === 0x29 || code === 0x5c) bytes.push(0x5c);
    bytes.push(code);
  }
  return Buffer.from(bytes);
}

const literal = (s: string) => Buffer.concat([Buffer.from('('), encode(s), Buffer.from(')')]);
/** A text string: a literal when WinAnsi can hold it, else UTF-16BE with a byte-order mark, in hex. */
const textString = (s: string) =>
  [...s].every((c) => WIN_ANSI[c] !== undefined || c.codePointAt(0)! <= 0xff)
    ? literal(s)
    : Buffer.from(`<feff${Buffer.from(s, 'utf16le').swap16().toString('hex')}>`);
const hexString = (s: string) => Buffer.from(`<${Buffer.from(s, 'latin1').toString('hex')}>`);

export function writePdf(spec: PdfSpec): Buffer {
  // Object numbers: 1 catalog, 2 pages, 3 font, then per page (page, content), then annotations, info, js.
  const objects = new Map<number, Buffer>();
  let next = 4;
  const pageIds: number[] = [];
  const annotsByPage = new Map<number, number[]>();
  const pageObjs: { id: number; content: number }[] = [];
  for (let i = 0; i < spec.pages.length; i++) {
    pageObjs.push({ id: next, content: next + 1 });
    pageIds.push(next);
    next += 2;
  }
  const annotIds: number[] = [];
  for (const link of spec.links ?? []) {
    const id = next++;
    annotIds.push(id);
    const list = annotsByPage.get(link.page) ?? [];
    list.push(id);
    annotsByPage.set(link.page, list);
    const [x0, y0, x1, y1] = link.rect ?? [72, 700, 200, 712];
    const key = link.obfuscateName ? '/#55RI' : '/URI';
    objects.set(
      id,
      Buffer.concat([
        Buffer.from(`<< /Type /Annot /Subtype /Link /Rect [${x0} ${y0} ${x1} ${y1}] /Border [0 0 0] /A << /S /URI ${key} `),
        link.hex ? hexString(link.uri) : literal(link.uri),
        Buffer.from(' >>'),
        link.contents === undefined ? Buffer.alloc(0) : Buffer.concat([Buffer.from(' /Contents '), textString(link.contents)]),
        Buffer.from(' >>'),
      ]),
    );
  }
  let noteId: number | undefined;
  if (spec.note !== undefined) {
    noteId = next++;
    const list = annotsByPage.get(1) ?? [];
    list.push(noteId);
    annotsByPage.set(1, list);
    objects.set(noteId, Buffer.concat([Buffer.from('<< /Type /Annot /Subtype /Text /Rect [10 10 20 20] /Contents '), literal(spec.note), Buffer.from(' >>')]));
  }
  for (const raw of spec.rawAnnots ?? []) {
    const id = next++;
    const list = annotsByPage.get(1) ?? [];
    list.push(id);
    annotsByPage.set(1, list);
    objects.set(id, Buffer.from(raw, 'latin1'));
  }
  let outlinesId: number | undefined;
  if (spec.outlineTitle !== undefined) {
    outlinesId = next++;
    const item = next++;
    objects.set(outlinesId, Buffer.from(`<< /Type /Outlines /First ${item} 0 R /Last ${item} 0 R /Count 1 >>`));
    objects.set(item, Buffer.concat([Buffer.from('<< /Title '), textString(spec.outlineTitle), Buffer.from(` /Parent ${outlinesId} 0 R >>`)]));
  }
  let imageId: number | undefined;
  if (spec.image) {
    imageId = next++;
    objects.set(imageId, Buffer.from('<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length 4 >>\nstream\n\x10\x80\x80\x10\nendstream', 'latin1'));
  }
  let infoId: number | undefined;
  if (spec.info) {
    infoId = next++;
    const parts = Object.entries(spec.info).map(([k, v]) => Buffer.concat([Buffer.from(`/${k} `), textString(v), Buffer.from(' ')]));
    objects.set(infoId, Buffer.concat([Buffer.from('<< '), ...parts, Buffer.from('>>')]));
  }
  let jsId: number | undefined;
  if (spec.javascript) {
    jsId = next++;
    objects.set(jsId, Buffer.from('<< /S /JavaScript /JS (app.alert\\(1\\)) >>'));
  }

  objects.set(
    1,
    Buffer.from(
      `<< /Type /Catalog /Pages 2 0 R${jsId ? ` /OpenAction ${jsId} 0 R` : ''}${outlinesId ? ` /Outlines ${outlinesId} 0 R` : ''}${spec.catalogExtra ? ` ${spec.catalogExtra}` : ''} >>`,
    ),
  );
  objects.set(2, Buffer.from(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`));
  objects.set(3, Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'));
  spec.pages.forEach((lines, i) => {
    const { id, content } = pageObjs[i]!;
    const annots = annotsByPage.get(i + 1);
    objects.set(
      id,
      Buffer.from(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >>${i === 0 && imageId ? ` /XObject << /Im1 ${imageId} 0 R >>` : ''} >> /Contents ${content} 0 R` +
          (annots ? ` /Annots [${annots.map((a) => `${a} 0 R`).join(' ')}]` : '') +
          ' >>',
      ),
    );
    let y = 800;
    const ops: Buffer[] = [];
    for (const line of lines) {
      const at = line.y ?? y;
      y = at - 14;
      ops.push(Buffer.from(`BT /F1 ${line.size ?? 10} Tf ${line.x ?? 72} ${at} Td `), literal(line.text), Buffer.from(' Tj ET\n'));
    }
    if (i === 0 && imageId) ops.push(Buffer.from('q 40 0 0 40 450 760 cm /Im1 Do Q\n'));
    if (i === 0 && spec.inlineImage) ops.push(Buffer.from('q 40 0 0 40 450 700 cm BI /W 2 /H 2 /CS /G /BPC 8 ID \x10\x80\x80\x10 EI Q\n', 'latin1'));
    const body = Buffer.concat(ops);
    objects.set(content, Buffer.concat([Buffer.from(`<< /Length ${body.length} >>\nstream\n`), body, Buffer.from('\nendstream')]));
  });

  const inStream = new Set(spec.objectStream ? annotIds : []);
  const header = Buffer.from('%PDF-1.5\n%\xe2\xe3\xcf\xd3\n', 'latin1');
  const chunks: Buffer[] = [header];
  let offset = header.length;
  const offsets = new Map<number, number>();
  const push = (b: Buffer) => {
    chunks.push(b);
    offset += b.length;
  };
  const ids = [...objects.keys()].sort((a, b) => a - b);
  for (const id of ids) {
    if (inStream.has(id)) continue;
    offsets.set(id, offset);
    push(Buffer.concat([Buffer.from(`${id} 0 obj\n`), objects.get(id)!, Buffer.from('\nendobj\n')]));
  }
  const trailerExtra = `/Root 1 0 R${infoId ? ` /Info ${infoId} 0 R` : ''}`;
  if (!spec.objectStream) {
    const size = next;
    const xrefAt = offset;
    let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
    for (let id = 1; id < size; id++) {
      const off = offsets.get(id);
      xref += off === undefined ? '0000000000 65535 f \n' : `${String(off).padStart(10, '0')} 00000 n \n`;
    }
    push(Buffer.from(`${xref}trailer\n<< /Size ${size} ${trailerExtra} >>\nstartxref\n${xrefAt}\n%%EOF\n`));
    return Buffer.concat(chunks);
  }
  // Object stream holding the annotations, then a cross-reference stream.
  const streamed = annotIds;
  const objStmId = next++;
  const xrefId = next++;
  const bodies: Buffer[] = [];
  const index: string[] = [];
  let rel = 0;
  for (const id of streamed) {
    const b = Buffer.concat([objects.get(id)!, Buffer.from('\n')]);
    index.push(`${id} ${rel}`);
    bodies.push(b);
    rel += b.length;
  }
  const head = Buffer.from(`${index.join(' ')}\n`);
  const raw = deflateSync(Buffer.concat([head, ...bodies]));
  offsets.set(objStmId, offset);
  push(
    Buffer.concat([
      Buffer.from(`${objStmId} 0 obj\n<< /Type /ObjStm /N ${streamed.length} /First ${head.length} /Filter /FlateDecode /Length ${raw.length} >>\nstream\n`),
      raw,
      Buffer.from('\nendstream\nendobj\n'),
    ]),
  );
  const size = next;
  const rows: Buffer[] = [];
  for (let id = 0; id < size; id++) {
    const row = Buffer.alloc(7);
    if (id === xrefId) {
      row.writeUInt8(1, 0);
      row.writeUInt32BE(offset, 1);
    } else if (streamed.includes(id)) {
      row.writeUInt8(2, 0);
      row.writeUInt32BE(objStmId, 1);
      row.writeUInt16BE(streamed.indexOf(id), 5);
    } else if (offsets.has(id)) {
      row.writeUInt8(1, 0);
      row.writeUInt32BE(offsets.get(id)!, 1);
    } else {
      row.writeUInt8(0, 0);
      row.writeUInt16BE(0xffff, 5);
    }
    rows.push(row);
  }
  const xrefBody = deflateSync(Buffer.concat(rows));
  const xrefAt = offset;
  push(
    Buffer.concat([
      Buffer.from(`${xrefId} 0 obj\n<< /Type /XRef /Size ${size} /W [1 4 2] ${trailerExtra} /Filter /FlateDecode /Length ${xrefBody.length} >>\nstream\n`),
      xrefBody,
      Buffer.from(`\nendstream\nendobj\nstartxref\n${xrefAt}\n%%EOF\n`),
    ]),
  );
  return Buffer.concat(chunks);
}
