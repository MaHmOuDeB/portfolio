// The two tiles, "I test." on the quiet surface and "I automate." on ink. They open like a book as
// they enter, and their list rules draw in. Server-safe.
import { HOME_TILES } from '../../../content/home.ts';
import { Tile } from '@/components/depth/Tile';

function Lines({ lines }: { lines: readonly string[] }) {
  return (
    <ul role="list" className="mt-6">
      {lines.map((line) => (
        <li key={line} className="py-4 text-lg">
          <span data-depth-draw="" aria-hidden="true" />
          {line}
        </li>
      ))}
    </ul>
  );
}

export function WorkTiles() {
  return (
    <div data-home-tiles="" className="mt-12 md:mt-section grid gap-6 md:grid-cols-2">
      <Tile data-depth-book="left" data-home-tile="test">
        <h3 className="text-display-sm font-semibold">{HOME_TILES.test.title}</h3>
        <Lines lines={HOME_TILES.test.lines} />
      </Tile>
      <Tile tone="ink" data-depth-book="right" data-home-tile="automate">
        <h3 className="text-display-sm font-semibold">{HOME_TILES.automate.title}</h3>
        <Lines lines={HOME_TILES.automate.lines} />
      </Tile>
    </div>
  );
}
