import localFont from 'next/font/local';

// rsms Inter 4.001 (inter-ui 4.1.1), subset to Latin plus the symbols the site uses. It keeps the
// opsz and wght axes and the cv05 and tnum features. `axes` is a Google-only option: the local
// variable file keeps opsz on its own, and `font-optical-sizing: auto` drives it.
export const inter = localFont({
  src: [{ path: './fonts/InterVariable-latin.woff2', weight: '100 900', style: 'normal' }],
  variable: '--font-inter',
  display: 'swap',
  adjustFontFallback: 'Arial',
  preload: true,
});
