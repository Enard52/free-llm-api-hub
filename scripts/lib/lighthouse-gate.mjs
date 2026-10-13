// lighthouse-gate.mjs — the pass/fail rule for the Lighthouse + accessibility CI gate.
//
// Pure on purpose: it takes parsed Lighthouse reports and a thresholds object and
// returns the failures, so the rule is unit-tested without a browser.
// A category that is missing or has a null score (Lighthouse could not compute it)
// is a failure, never a pass: "no score" must not read as "fine".

export const THRESHOLDS = Object.freeze({ accessibility: 0.9, performance: 0.8 });

export function evaluate(url, report, thresholds = THRESHOLDS) {
  const failures = [];
  const categories = (report && report.categories) || {};
  for (const [name, minimum] of Object.entries(thresholds)) {
    const score = categories[name] ? categories[name].score : undefined;
    if (typeof score !== 'number') {
      failures.push(`${url}: ${name} has no score`);
    } else if (score < minimum) {
      failures.push(`${url}: ${name} ${score.toFixed(2)} is below ${minimum.toFixed(2)}`);
    }
  }
  return failures;
}
