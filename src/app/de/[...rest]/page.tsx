import { notFound } from 'next/navigation';

// Every /de address without a page of its own is the German 404 (de/not-found.tsx).
export default function UnknownGermanPage(): never {
  notFound();
}
