import * as site from '@/lib/site';
import { CONTACT, CONTACT_HREF, CONTACT_LINK, CV_LINK, NAV, PRIVACY_HREF, SITE } from '@/lib/site';

test('identity strings match the spec', () => {
  expect(SITE).toEqual({
    name: 'Mahmoud El Bergui',
    role: 'Experimentation & growth analyst',
    city: 'Berlin, Germany',
  });
});

test('navigation labels and targets', () => {
  expect(NAV.map((item) => item.label)).toEqual(['Work', 'About', 'Lab', 'Live test']);
  expect(NAV.map((item) => item.href)).toEqual(['/work', '/about', '/lab', '/experiment']);
  expect(CV_LINK).toEqual({ label: 'CV', href: '/cv' });
  expect(CONTACT_LINK).toEqual({ label: 'Contact', href: '/contact' });
  expect(CONTACT_LINK.href).toBe(CONTACT_HREF);
  expect(PRIVACY_HREF).toBe('/privacy');
});

test('contact details: LinkedIn and GitHub, no e-mail address', () => {
  expect(CONTACT).toEqual({
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
