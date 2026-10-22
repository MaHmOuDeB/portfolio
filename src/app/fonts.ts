import localFont from 'next/font/local';

// rsms Inter 4.001 (inter-ui 4.1.1). It keeps the opsz axis (14 to 32), the wght axis limited to
// 400 to 700 (the tokens use 400, 500 and 600; `bolder` reaches 700) and the cv05, tnum, calt,
// locl and kern features. Glyphs: Latin plus the symbols the site uses. `axes` is a Google-only
// option: the local variable file keeps opsz on its own, and `font-optical-sizing: auto` drives it.
//
// The file is preloaded, so it sits on the LCP path: tests/unit/font-file.test.ts keeps it under
// its byte budget and keeps `weight` equal to the file's wght range. Rebuild it with:
//   export SOURCE_DATE_EPOCH=1760000000
//   uvx --from 'fonttools[woff]==4.67.0' fonttools varLib.instancer \
//     node_modules/inter-ui/variable/InterVariable.woff2 wght=400:700 -o /tmp/inter.ttf
//   uvx --from 'fonttools[woff]==4.67.0' pyftsubset /tmp/inter.ttf --flavor=woff2 \
//     --layout-features='kern,liga,calt,ccmp,locl,mark,mkmk,tnum,cv05' \
//     --unicodes='U+0000-00FF,U+0131,U+0152-0153,U+02C6,U+02DA,U+02DC,U+03B1-03B2,U+2002-200B,U+2010-2014,U+2018-201E,U+2020-2022,U+2026,U+202F-2030,U+2032-2033,U+2039-203A,U+2044,U+2060,U+2070-209C,U+20AC,U+2122,U+2212,U+221A,U+2248,U+2264-2265,U+FEFF,U+FFFD' \
//     --output-file=src/app/fonts/InterVariable-latin.woff2
export const inter = localFont({
  src: [{ path: './fonts/InterVariable-latin.woff2', weight: '400 700', style: 'normal' }],
  variable: '--font-inter',
  display: 'swap',
  adjustFontFallback: 'Arial',
  preload: true,
});
