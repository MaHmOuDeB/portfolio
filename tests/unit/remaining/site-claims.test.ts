// The site-wide Audible claim rules (tests/e2e/site-claims.ts): first that they see what they must
// and leave what they must alone, then over the text no browser test renders as page content: every
// page's title, description and sharing text in content/seo.ts, and the text the sharing images
// are drawn from.
import { describe, expect, it } from 'vitest';
import { claimFindings, htmlClaimFindings } from '../../e2e/site-claims.ts';
import { HOME_SHARE_TITLE, OG_CARDS, SEO_PAGES, SITE_SHARING_HEADLINE, SITE_SHARING_LINE, shareTitle } from '../../../content/seo.ts';

const fact = (id: string, shown: string) => `<data data-fact="${id}" value="${shown}">${shown}</data>`;
const TESTS = fact('profile.audible.experiments', '25+');
const MARKETS = fact('profile.audible.markets', '11');
const TEAMS = fact('profile.audible.teams', '3');
const rules = (html: string) => htmlClaimFindings(`<!doctype html><html><head><title>t</title></head><body><main>${html}</main></body></html>`, '/x').map((f) => f.rule);

describe('the claim rules are not vacuous', () => {
  it('fail tests and markets in one paragraph, by their facts or by their words', () => {
    expect(rules(`<p>I contributed to ${TESTS} A/B tests across ${MARKETS} markets.</p>`)).toContain('experiments-with-markets');
    expect(rules('<p>I ran 25+ experiments in 11 markets.</p>')).toContain('experiments-with-markets');
    expect(claimFindings('Contributed to 25+ A/B tests across web and mobile in 11 marketplaces.', 'cv').map((f) => f.rule)).toEqual(['experiments-with-markets']);
  });

  it('pass them in two neighbouring paragraphs: a section, a card or the page is not one claim', () => {
    expect(rules(`<section><p>I contributed to ${TESTS} A/B tests.</p><p>The tool ran in ${MARKETS} markets.</p></section>`)).toEqual([]);
    expect(rules(`<ul><li>${TESTS} A/B tests</li><li>${MARKETS} markets</li></ul>`)).toEqual([]);
  });

  it('read a claim through its inline markup, a wrapped line and a hidden twin', () => {
    expect(rules(`<p><strong>${TESTS}</strong> tests,\n across <a href="/x">${MARKETS} markets</a></p>`)).toContain('experiments-with-markets');
    expect(rules(`<p aria-hidden="true" hidden>${TESTS} tests in ${MARKETS} markets</p>`)).toContain('experiments-with-markets');
    expect(rules(`<noscript><p>${TESTS} tests in ${MARKETS} markets</p></noscript>`)).toContain('experiments-with-markets');
    expect(rules(`<div>${TESTS} tests in ${MARKETS} markets</div>`)).toContain('experiments-with-markets');
  });

  it('read accessible names, titles and alt text as claims of their own', () => {
    expect(rules('<img alt="25+ tests across 11 markets" src="/a.png">')).toContain('experiments-with-markets');
    expect(rules('<button aria-label="3 teams at once">x</button>')).toContain('teams-without-tenure');
  });

  it('read the description and every sharing tag', () => {
    const head = (meta: string) => htmlClaimFindings(`<html><head>${meta}</head><body></body></html>`, '/x').map((f) => f.rule);
    expect(head('<meta name="description" content="25+ tests in 11 markets">')).toContain('experiments-with-markets');
    expect(head('<meta property="og:description" content="Worked with 3 teams">')).toContain('teams-without-tenure');
    expect(head('<meta name="twitter:image:alt" content="p &lt; 0.05 everywhere">')).toContain('significance-threshold');
    expect(head('<title>Results at p≤0.01</title>')).toContain('significance-threshold');
  });

  it('need "over my time" with every count of teams, and never accept two teams', () => {
    expect(rules(`<p>I worked with ${TEAMS} teams.</p>`)).toEqual(['teams-without-tenure']);
    expect(rules(`<p>I worked with ${TEAMS} teams over my time there, one after another.</p>`)).toEqual([]);
    expect(rules(`<p>Over my time there I worked with ${TEAMS} teams, one after another.</p>`)).toEqual([]);
    expect(rules('<p>Evaluated experiments for 2 teams over my time there.</p>')).toEqual(['two-teams']);
    expect(rules('<p>with three product teams at once</p>')).toEqual(['teams-without-tenure']);
    expect(rules('<p>aligning targeting across teams</p>')).toEqual([]);
  });

  it('fail any significance threshold, and leave the words significance and p alone otherwise', () => {
    for (const t of ['significant at p < 0.05', 'p<.02', 'a p-value < 0.01', 'the significance threshold was strict']) {
      expect(claimFindings(t, 'x').map((f) => f.rule), t).toEqual(['significance-threshold']);
    }
    for (const t of ['I did the significance testing myself', 'the p-value and the interval', 'step < next', 'group B is higher', "Cohen's h for a two-sided test at a significance level of 0.05"]) {
      expect(claimFindings(t, 'x'), t).toEqual([]);
    }
  });
});

describe('the sharing text and metadata keep the claim rules', () => {
  it('every page title, description, link-preview title and image alt text', () => {
    const found = SEO_PAGES.flatMap((p) => [
      ...claimFindings(p.title, `${p.path} title`, p.factIds),
      ...claimFindings(p.description, `${p.path} description`, p.factIds),
      ...claimFindings(shareTitle(p), `${p.path} share title`, p.factIds),
      ...claimFindings(p.imageAlt, `${p.path} image alt`, p.factIds),
    ]);
    expect(SEO_PAGES.length).toBeGreaterThan(10);
    expect(found).toEqual([]);
  });

  it('the text every sharing image is drawn from', () => {
    const found = OG_CARDS.flatMap((c) =>
      [c.title, c.sub, c.footer, c.proof ? `${c.proof.strong} ${c.proof.rest}` : ''].flatMap((t) => claimFindings(t, `og ${c.name}`, c.factIds)),
    );
    expect(OG_CARDS.length).toBeGreaterThan(1);
    expect(found).toEqual([]);
  });

  it('the site line, headline and home title', () => {
    expect([SITE_SHARING_LINE, SITE_SHARING_HEADLINE, HOME_SHARE_TITLE].flatMap((t) => claimFindings(t, 'site'))).toEqual([]);
  });
});
