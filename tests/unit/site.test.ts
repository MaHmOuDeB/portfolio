import * as site from '@/lib/site';
import { CONTACT, CV_LINK, NAV, PRIVACY_HREF, SITE } from '@/lib/site';

test('identity strings match the spec', () => {
  expect(SITE).toEqual({
    name: 'Mahmoud El Bergui',
    role: 'Experimentation & growth analyst',
    city: 'Berlin, Germany',
  });
});

test('navigation labels and targets', () => {
  expect(NAV.map((item) => item.label)).toEqual(['Work', 'Lab', 'Live test', 'About']);
  expect(NAV.map((item) => item.href)).toEqual(['/work', '/lab', '/experiment', '/about']);
  expect(CV_LINK).toEqual({ label: 'CV (PDF)', href: '/cv.pdf' });
  expect(PRIVACY_HREF).toBe('/privacy');
});

test('contact details', () => {
  expect(CONTACT).toEqual({
    email: 'elberguimahmoud11@gmail.com',
    linkedin: 'https://www.linkedin.com/in/melbergui',
    github: 'https://github.com/MaHmOuDeB',
  });
});

test('nothing exported from site.ts looks like a phone number', () => {
  const phone = /\+\d{2}[\d\s]{8,}|\b0\d{3}\s?\d{3,}/;
  for (const [name, value] of Object.entries(site)) {
    expect(JSON.stringify(value), `export ${name}`).not.toMatch(phone);
  }
});
