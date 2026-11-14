// A tile on the quiet surface, or an ink one. Extra data-* attributes go onto the tile.
import type { ReactNode } from 'react';
import type { DataAttributes } from './data-attributes';

export function Tile({ tone = 'surface', children, ...rest }: DataAttributes & { tone?: 'surface' | 'ink'; children: ReactNode }) {
  return (
    <div data-tile={tone === 'ink' ? 'ink' : ''} {...rest}>
      {children}
    </div>
  );
}
