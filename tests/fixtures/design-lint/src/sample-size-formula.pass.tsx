import { SAMPLE_SIZE_FORMULA } from '@/lib/stats';

export function Pass() {
  return (
    <figure>
      <code>{SAMPLE_SIZE_FORMULA}</code>
      <pre>
        <code className="code-block">{SAMPLE_SIZE_FORMULA}</code>
      </pre>
    </figure>
  );
}
