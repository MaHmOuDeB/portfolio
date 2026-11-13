// The owner's private page: its title is drawn as a page title, like every other page's h1.
import { renderToStaticMarkup } from 'react-dom/server';
import ExcludePage from '@/app/exclude/page';

describe('the exclude page', () => {
  it('draws its h1 with the page-title classes', () => {
    const html = renderToStaticMarkup(<ExcludePage />);
    expect(html).toMatch(/<h1 class="text-2xl font-semibold md:text-3xl">Leave this browser out of the experiment<\/h1>/);
  });
});
