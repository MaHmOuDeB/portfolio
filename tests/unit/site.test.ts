import { SITE } from '@/lib/site';

test('identity strings match the spec', () => {
  expect(SITE).toEqual({
    name: 'Mahmoud El Bergui',
    role: 'Experimentation & growth analyst',
    city: 'Berlin, Germany',
  });
});
