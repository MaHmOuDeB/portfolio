// The call to action that ends Work, About and every case study is the same on each page, and is
// tested once (tests/unit/frame/page-cta.test.tsx). A page's own tests read its markup without it.
export const withoutCta = (markup: string): string => markup.replace(/<div data-rule="" data-page-cta="[^>]*>[\s\S]*?<\/section><\/div>/, '');
