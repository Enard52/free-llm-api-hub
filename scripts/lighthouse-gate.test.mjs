import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, THRESHOLDS } from './lib/lighthouse-gate.mjs';

const report = (accessibility, performance) => ({ categories: { accessibility: { score: accessibility }, performance: { score: performance } } });

test('scores at or above the thresholds pass', () => {
  assert.deepEqual(evaluate('/', report(THRESHOLDS.accessibility, THRESHOLDS.performance)), []);
});

test('accessibility just below the threshold fails and names the page', () => {
  const f = evaluate('/best/', report(0.94, 1));
  assert.equal(f.length, 1);
  assert.match(f[0], /^\/best\/: accessibility 0\.94 is below 0\.95$/);
});

test('performance just below the threshold fails', () => {
  assert.equal(evaluate('/', report(1, 0.79)).length, 1);
});

test('a missing or null score is a failure, not a pass', () => {
  assert.equal(evaluate('/', { categories: { accessibility: { score: null }, performance: { score: 1 } } }).length, 1);
  assert.equal(evaluate('/', { categories: {} }).length, 2);
  assert.equal(evaluate('/', undefined).length, 2);
});
