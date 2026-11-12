// The Live test page's colophon: the stack (versions from package.json) and the deploy's test and
// audit results, embedded into the build (readBuildMeta). A build with no metadata (every local, CI
// and e2e build) says the results are added on deploy, with no number; a deploy build without them
// fails before it gets here. The Lighthouse scores are a CI lab run, never field data. Server-safe.
import { Derived } from '@/components/kit/Derived';
import type { BuildMeta } from '@/lib/live-page/build-meta-shape';
import pkg from '../../../package.json';
import { BUILD, MarkedText } from './Values';

const P = 'max-w-text text-base';

const Count = ({ n }: { n: number }) => <Derived value={n} unit="count" refs={BUILD} />;

export function Colophon({ meta }: { meta: BuildMeta | null }) {
  const v = (s: string) => <MarkedText value={s} refs={BUILD} />;
  return (
    <div>
      <p id="colophon-stack" className={P}>
        Built with Next.js {v(pkg.dependencies.next)}, React {v(pkg.dependencies.react)}, Tailwind CSS {v(pkg.devDependencies.tailwindcss)} and
        TypeScript {v(pkg.devDependencies.typescript)}.
      </p>
      {meta === null ? (
        <p id="colophon-results" data-derived="build" className={`${P} mt-3`}>
          Test and audit results are added when the site is deployed.
        </p>
      ) : (
        <p id="colophon-results" className={`${P} mt-3`}>
          Unit tests: <Count n={meta.unitTests.passed} /> of <Count n={meta.unitTests.total} /> passed. Browser tests:{' '}
          <Count n={meta.e2eTests.passed} /> of <Count n={meta.e2eTests.total} /> passed. Accessibility checks (axe):{' '}
          <Count n={meta.axeViolations} /> violations. Lighthouse, {meta.lighthouseLabel}: performance <Count n={meta.lighthouse.performance} />,
          accessibility <Count n={meta.lighthouse.accessibility} />, best practices <Count n={meta.lighthouse.bestPractices} />, SEO{' '}
          <Count n={meta.lighthouse.seo} />. These results are for commit <MarkedText value={meta.commit} shown={meta.commit.slice(0, 7)} refs={BUILD} />.
        </p>
      )}
    </div>
  );
}
