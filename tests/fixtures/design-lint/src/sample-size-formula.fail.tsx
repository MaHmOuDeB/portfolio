import { SAMPLE_SIZE_FORMULA } from '@/lib/stats';

export function Fail() {
  return (
    <figure>
      <p>{SAMPLE_SIZE_FORMULA}</p> {/* expect */}
      <code>{SAMPLE_SIZE_FORMULA}</code>
    </figure>
  );
}
