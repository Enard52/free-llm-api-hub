import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { gpuComputeErrors, CLAIM_FIELDS } from './lib/gpu-compute.mjs';
import { providerFigures } from './lib/figures.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const providers = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8')).providers;
const slugs = new Set(providers.map((p) => p.slug));
const section = () => JSON.parse(readFileSync(join(ROOT, 'data/gpu-compute.json'), 'utf8'));
const claim = (state, quotes = []) => ({ state, quotes });
const entry = (over = {}) => ({
  slug: 'example-gpu', name: 'Example', url: 'https://example.com/faq', kind: 'notebook',
  claims: Object.fromEntries(CLAIM_FIELDS.map((f) => [f, claim('not_stated')])), ...over,
});

test('the section exists and passes its own rules', () => {
  assert.ok(existsSync(join(ROOT, 'data/gpu-compute.json')), 'data/gpu-compute.json is missing');
  assert.deepEqual(gpuComputeErrors(section(), slugs), []);
});

test('the section enters no provider count, no slug and no figure', () => {
  const s = section();
  assert.ok(s.entries.length > 0);
  for (const e of s.entries) assert.ok(!slugs.has(e.slug), `${e.slug} is also a provider`);
  // The provider figures come from providers.json alone, so the section is not counted.
  assert.equal(providerFigures(providers).providers, providers.length);
  // The committed outputs that carry the provider count do not list the section's entries as providers.
  const home = readFileSync(join(ROOT, 'site/index.html'), 'utf8');
  for (const e of s.entries) assert.ok(!home.includes(`/p/${e.slug}`), `${e.slug} must not have a provider page link on the home`);
});

test('a slug shared with a provider is rejected', () => {
  const errs = gpuComputeErrors({ entries: [entry({ slug: providers[0].slug })] }, slugs);
  assert.ok(errs.some((m) => /shares its slug with a provider/.test(m)));
});

test('a stated value without a quoted sentence is rejected', () => {
  const e = entry();
  e.claims.quota = claim('stated', []);
  assert.ok(gpuComputeErrors({ entries: [e] }, slugs).some((m) => /stated without a quoted sentence/.test(m)));
});

test('a quotation without a source or a read date is rejected', () => {
  const e = entry();
  e.claims.expires = claim('not_stated', [{ text: 'they expire in 90 days' }]);
  const errs = gpuComputeErrors({ entries: [e] }, slugs);
  assert.ok(errs.some((m) => /source/.test(m)) && errs.some((m) => /day it was read/.test(m)));
});

test('a missing or unknown claim field is rejected', () => {
  const e = entry();
  delete e.claims.card_required;
  e.claims.price = claim('not_stated');
  const errs = gpuComputeErrors({ entries: [e] }, slugs);
  assert.ok(errs.some((m) => /card_required/.test(m)) && errs.some((m) => /unknown claim "price"/.test(m)));
});

test('fal.ai keeps both of its contradicting expiry sentences and no invented value', () => {
  const fal = section().entries.find((e) => e.slug === 'fal-ai');
  assert.equal(fal.claims.expires.state, 'not_stated');
  const texts = fal.claims.expires.quotes.map((q) => q.text).join(' | ');
  assert.match(texts, /expire in 90 days/);
  assert.match(texts, /ranging from 1 week to 1 year/);
  for (const f of ['credit_amount', 'card_required']) assert.equal(fal.claims[f].state, 'not_stated');
});

// The page of the section. It reads data/gpu-compute.json only, shows every quoted sentence with the day it
// was read, says "Not stated" where the provider did not, and stays out of everything that counts providers.
test('the section has a page that shows its quotations and stays out of every provider count', () => {
  execFileSync(process.execPath, [join(ROOT, 'scripts/build.mjs')], { cwd: ROOT, stdio: 'pipe' });
  const page = join(ROOT, 'site/free-gpu/index.html');
  assert.ok(existsSync(page), 'site/free-gpu/index.html is not generated');
  const html = readFileSync(page, 'utf8');
  const s = section();
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  for (const e of s.entries) {
    assert.ok(html.includes(esc(e.name)), `${e.name} is missing from the page`);
    for (const c of Object.values(e.claims)) {
      for (const q of c.quotes) {
        assert.ok(html.includes(esc(q.text)), `a quotation of ${e.name} is missing from the page`);
        assert.ok(html.includes(`read ${q.read}`), `the read date of a quotation of ${e.name} is missing`);
      }
    }
  }
  assert.match(html, /Not stated/, 'a value the provider did not state must read Not stated');
  assert.match(html, /not part of the ranking/, 'the page must say it is apart from the ranking');

  // Out of every count: no provider page, no entry of the providers API, no collection, no provider-page sitemap line.
  for (const e of s.entries) {
    assert.ok(!existsSync(join(ROOT, `site/p/${e.slug}.html`)), `${e.slug} got a provider page`);
    const sitemap = readFileSync(join(ROOT, 'site/sitemap.xml'), 'utf8');
    assert.ok(!sitemap.includes(`/p/${e.slug}`), `${e.slug} is in the sitemap as a provider`);
    for (const f of readdirSync(join(ROOT, 'collections')).filter((x) => x.endsWith('.md'))) {
      assert.ok(!readFileSync(join(ROOT, 'collections', f), 'utf8').includes(`(p/${e.slug}`), `${e.slug} is in a collection (${f})`);
    }
  }
  const api = JSON.parse(readFileSync(join(ROOT, 'site/api/v1/index.json'), 'utf8'));
  const count = Array.isArray(api.providers) ? api.providers.length : api.count ?? api.provider_count;
  if (count !== undefined) assert.equal(count, providers.length, 'the providers API counts providers.json only');
  const sitemap = readFileSync(join(ROOT, 'site/sitemap.xml'), 'utf8');
  assert.ok(sitemap.includes('/free-gpu/'), 'the page is in the sitemap');
  assert.equal([...sitemap.matchAll(/\/p\/[a-z0-9-]+</g)].length, providers.length, 'the sitemap lists one page per provider and nothing else');
});

test('the page is linked from both footers, the hand-written home and the shared one', () => {
  const home = readFileSync(join(ROOT, 'site/index.html'), 'utf8');
  const shared = readFileSync(join(ROOT, 'site/best/index.html'), 'utf8');
  assert.match(home, /href="free-gpu\/"/);
  assert.match(shared, /href="\.\.\/free-gpu\/"/);
});
