// A real screenshot in a build note: a figure with the picture, its caption and, for a picture whose
// text is small beside the column, a link to the full-size file. Tokens only: a 1 px line border and
// the site radius, no shadow. The picture never grows past its capture size and never overflows the
// column, so it reflows at 320 px. Server-safe, no hooks.
import { NOTE_SHOTS, NOTE_SHOT_DIR, type NoteShot as Shot } from './note-shots';

export function NoteShot({ shot }: { shot: keyof typeof NOTE_SHOTS }) {
  const s: Shot = NOTE_SHOTS[shot];
  const src = `${NOTE_SHOT_DIR}/${s.file}`;
  return (
    <figure data-note-shot={shot} className="mt-8 min-w-0" style={{ maxWidth: `${s.maxWidth}px` }}>
      <img
        src={src}
        alt={s.alt}
        width={s.width}
        height={s.height}
        loading="lazy"
        decoding="async"
        className="h-auto w-full rounded-sm border border-line"
      />
      <figcaption className="mt-2 max-w-text text-sm text-muted">
        {s.caption}
        {s.fullSize ? (
          <>
            {' '}
            <a
              href={src}
              data-touch-target=""
              className="inline-flex min-h-(--size-target) items-center text-sm text-muted underline decoration-muted hover:text-ink focus-visible:text-ink"
            >
              Full-size picture of {s.label}
            </a>
          </>
        ) : null}
      </figcaption>
    </figure>
  );
}
