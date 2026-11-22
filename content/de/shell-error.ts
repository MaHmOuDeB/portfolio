// The German error pages' words. Unlike the rest of content/de this file has no server-only guard:
// the error boundary is a client component and loads it with a dynamic import, so only a visitor
// who meets an error on a German page downloads it.
import type { ErrorCopy } from '../shell';

export const ERROR_DE: ErrorCopy = {
  title: 'Diese Seite konnte nicht geladen werden',
  body: 'Ein Fehler hat das Laden dieser Seite verhindert. Versuchen Sie es erneut. Wenn es wieder passiert, schicken Sie mir die Adresse der Seite auf LinkedIn.',
  retry: 'Erneut versuchen',
  work: 'Projekte',
  lab: 'Lab',
  linkedin: 'LinkedIn',
};
