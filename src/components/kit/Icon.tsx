// One outline set on a 20 px grid, 1.5 px stroke in currentColor. Always decorative: the visible
// label next to it names the action. Server-safe, no hooks.
//
// The GitHub mark adapts the Lucide "github" icon (ISC licence, Copyright (c) for Lucide
// Contributors, https://lucide.dev), scaled from its 24 grid to 20 with a non-scaling stroke so the
// line stays 1.5 px. The other icons are drawn directly on the 20 grid.
import type { ReactNode } from 'react';

export type IconName = 'mail' | 'linkedin' | 'github' | 'download' | 'external' | 'menu' | 'alert' | 'check' | 'chevron';

const SHAPES: Record<IconName, ReactNode> = {
  mail: (
    <>
      <rect x="2.5" y="4.5" width="15" height="11" rx="2" />
      <path d="M3 6.5l7 5 7-5" />
    </>
  ),
  linkedin: (
    <>
      <rect x="2.5" y="2.5" width="15" height="15" rx="2" />
      <path d="M7 9v5M7 6.5h.01M10.5 14V9M10.5 11.2c0-1.4 1-2.2 2.2-2.2 1.3 0 2 .9 2 2.3V14" />
    </>
  ),
  github: (
    <g transform="scale(0.8333)">
      <path
        vectorEffect="non-scaling-stroke"
        d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"
      />
      <path vectorEffect="non-scaling-stroke" d="M9 18c-4.51 2-5-2-7-2" />
    </g>
  ),
  download: <path d="M10 3v9M6.5 8.5L10 12l3.5-3.5M3.5 14v1.5a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V14" />,
  external: (
    <path d="M8 4H5a1.5 1.5 0 0 0-1.5 1.5v9A1.5 1.5 0 0 0 5 16h9a1.5 1.5 0 0 0 1.5-1.5V12M12 3.5h4.5V8M16.5 3.5L9 11" />
  ),
  menu: <path d="M3 5.5h14M3 10h14M3 14.5h14" />,
  // Status marks: always beside the word they repeat ("Message not sent", an error, "Message sent"),
  // in that word's colour. The chevron only marks a native select.
  alert: (
    <>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 6v4.75M10 13.75h.01" />
    </>
  ),
  check: (
    <>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M6.75 10.25l2.25 2.25 4.25-4.5" />
    </>
  ),
  chevron: <path d="M5.5 8l4.5 4.5L14.5 8" />,
};

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {SHAPES[name]}
    </svg>
  );
}
