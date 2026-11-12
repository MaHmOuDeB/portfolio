/**
 * The About page photograph: a real photo, cropped to a 4:5 rectangle and stripped of all metadata.
 * The page renders it with `next/image` at 480 and 960 px wide; the file is 960 px wide so neither
 * width is enlarged by the browser. The alternative text describes what the photo shows.
 */
export const aboutPhoto = {
  src: '/images/about.jpg',
  width: 960,
  height: 1200,
  alt: 'Mahmoud El Bergui, smiling at the camera, in a graduation cap and gown over a white shirt and dark tie',
} as const;
