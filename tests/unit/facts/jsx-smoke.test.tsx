// Proves .test.tsx files run and that JSX compiles under vitest.
import { renderToStaticMarkup } from 'react-dom/server';
import { Fact } from '../../../src/components/kit/Fact.tsx';

describe('JSX in a .test.tsx file', () => {
  it('renders <Fact> through JSX', () => {
    expect(renderToStaticMarkup(<Fact id="profile.n8n.automated_tests" />)).toBe(
      '<data value="270" data-fact="profile.n8n.automated_tests">270+</data>',
    );
  });
});
