import type { Metadata } from 'next';
import { NotFoundBody } from '@/components/shell/NotFoundBody';

export const metadata: Metadata = { title: 'Page not found' };

export default function NotFound() {
  return <NotFoundBody locale="en" />;
}
