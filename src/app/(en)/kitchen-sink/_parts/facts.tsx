// The "Fact and Stat" section of the kitchen sink. The Derived value is a fictional fixture; the
// Fact is here for its markup only (the kit has no Audible id).
import { Derived } from '@/components/kit/Derived';
import { Fact } from '@/components/kit/Fact';
import { Stat } from '@/components/kit/Stat';
import { Specimen } from './Specimen';

export function FactsSection() {
  return (
    <>
      <Specimen
        id="stat--derived"
        title="Stat with a derived value"
        note="A fictional number from the simulator, marked simulated. The source line says where it comes from."
      >
        <Stat
          value={<Derived value={1353} unit="count" refs={['simulated']} />}
          label="Visitors per group"
          source="kitchen-sink fixture"
        />
      </Specimen>
      <Specimen
        id="fact--inline"
        title="Fact"
        note="One figure from the vendored sources, in the one Fact markup."
      >
        <p className="max-w-text text-base">
          Markup specimen: <Fact id="profile.n8n.automated_tests" />.
        </p>
      </Specimen>
    </>
  );
}
