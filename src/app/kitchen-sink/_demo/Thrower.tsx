'use client';

// A client island that fails on purpose, for the error-boundary specimen: it renders its chart until
// the pointer enters it, or its button is pressed (the keyboard path), and then throws while
// rendering. Only its own Figure shows the fallback.
import { useState, type ReactNode } from 'react';
import { buttonClass } from '@/components/kit/ButtonLink';

export function Thrower({ children }: { children: ReactNode }) {
  const [broken, setBroken] = useState(false);
  if (broken) throw new Error('A fictional failure in the kitchen sink');
  return (
    <div data-thrower="" onPointerEnter={() => setBroken(true)}>
      {children}
      <button type="button" className={`mt-3 ${buttonClass('secondary')}`} onClick={() => setBroken(true)}>
        Make this chart fail
      </button>
    </div>
  );
}
