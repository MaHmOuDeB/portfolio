import type { Metadata } from 'next';
import { NotFoundBody } from '@/components/shell/NotFoundBody';
import { SHELL_DE } from '../../../content/de/shell';

export const metadata: Metadata = { title: SHELL_DE.notFound.title };

export default function GermanNotFound() {
  return <NotFoundBody locale="de" />;
}
