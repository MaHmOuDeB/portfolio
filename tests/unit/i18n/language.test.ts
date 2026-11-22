import { appendLocation, languageTargets } from '@/lib/i18n/language';

const PAGES = ['/', '/work', '/about'];
const ROUTES = ['/', '/work', '/about', '/lab'];
const t = (path: string | null) => languageTargets(path, PAGES, ROUTES);

describe('languageTargets', () => {
  it('sends the home page to /de and back to /', () => {
    expect(t('/')).toEqual({ en: '/', de: '/de' });
    expect(t('/de')).toEqual({ en: '/', de: '/de' });
  });

  it('maps a group page to the home page, as the home page it is for the reader', () => {
    expect(t('/v/a')).toEqual({ en: '/', de: '/de' });
    expect(t('/v/b')).toEqual({ en: '/', de: '/de' });
  });

  it('maps a registered page to its twin and back', () => {
    expect(t('/work')).toEqual({ en: '/work', de: '/de/work' });
    expect(t('/de/work')).toEqual({ en: '/work', de: '/de/work' });
  });

  it('sends a page without a twin to /de, and a German page without an English page to /', () => {
    expect(t('/lab')).toEqual({ en: '/lab', de: '/de' });
    expect(t('/somewhere')).toEqual({ en: '/', de: '/de' });
    expect(t('/de/somewhere')).toEqual({ en: '/', de: '/de' });
    expect(t(null)).toEqual({ en: '/', de: '/de' });
  });

  it('ignores a trailing slash', () => {
    expect(t('/work/')).toEqual({ en: '/work', de: '/de/work' });
  });
});

describe('appendLocation', () => {
  it('appends the query and the hash of the page', () => {
    expect(appendLocation('/de/work', '?a=1', '#b')).toBe('/de/work?a=1#b');
    expect(appendLocation('/', '', '')).toBe('/');
    expect(appendLocation('/de', '?peeking.looks=20', '')).toBe('/de?peeking.looks=20');
  });
});
