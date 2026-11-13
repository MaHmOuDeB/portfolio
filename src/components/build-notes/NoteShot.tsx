// A real screenshot in a build note: a figure with the picture, its caption and, for a picture whose
// text is small beside the column, a link to the full-size file (or to a wider crop of the same
// recording). Tokens only: a 1 px line border and the site radius, no shadow. The picture is shown
// at its own width or the text column's, never wider than its file. A picture with a narrowest width
// keeps that width in a narrow column and scrolls sideways in its own labelled frame, so its text
// never drops under 13 px and the page itself still reflows at 320 px (ShotFrame, a small client
// module). Server-safe, no hooks.
import { NOTE_SHOTS, NOTE_SHOT_DIR, type NoteShot as Shot } from './note-shots';
import { ShotFrame } from './ShotFrame';

export function NoteShot({ shot }: { shot: keyof typeof NOTE_SHOTS }) {
  const s: Shot = NOTE_SHOTS[shot];
  const src = `${NOTE_SHOT_DIR}/${s.file}`;
  const captionId = `${shot}-caption`;
  const picture = (
    <img
      src={src}
      alt={s.alt}
      width={s.width}
      height={s.height}
      loading="lazy"
      decoding="async"
      className="h-auto w-full rounded-sm border border-line"
      style={s.minWidth ? { minWidth: `${s.minWidth}px` } : undefined}
    />
  );
  return (
    <figure
      data-note-shot={shot}
      className={s.maxWidth === 'text' ? 'mt-8 min-w-0 max-w-text' : 'mt-8 min-w-0'}
      style={s.maxWidth === 'text' ? undefined : { maxWidth: `${s.maxWidth}px` }}
    >
      {s.minWidth ? (
        <ShotFrame labelledBy={captionId}>{picture}</ShotFrame>
      ) : (
        picture
      )}
      <figcaption id={captionId} className="mt-2 max-w-text text-sm text-muted">
        {s.caption}
        {s.fullSize ? (
          <>
            {' '}
            <a
              href={`${NOTE_SHOT_DIR}/${s.fullSizeFile ?? s.file}`}
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
