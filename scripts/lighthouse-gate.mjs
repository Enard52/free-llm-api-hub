#!/usr/bin/env node
// lighthouse-gate.mjs — serve site/ locally, run Lighthouse on four pages and
// fail when accessibility or performance drops below the thresholds in
// lib/lighthouse-gate.mjs. Needs the runner from tools/lighthouse (npm ci there)
// and a Chrome binary in CHROME_PATH. Nothing is published and nothing leaves the machine.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';
import { evaluate } from './lib/lighthouse-gate.mjs';

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'site');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.woff2': 'font/woff2', '.png': 'image/png' };

function resolveFile(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  let file = join(SITE, clean);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  return file.startsWith(SITE) && existsSync(file) ? file : null;
}

const server = createServer((req, res) => {
  const file = resolveFile(req.url);
  if (!file) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});

await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;
const pages = ['/', '/best/', '/coverage/', '/p/ai21.html'];
const lighthouse = join(ROOT, 'tools/lighthouse/node_modules/.bin/lighthouse');
const failures = [];
try {
  for (const page of pages) {
    // Asynchronous on purpose: a synchronous child process would block this process's event loop, and the server below could never answer Lighthouse.
    let report;
    try {
      const { stdout: out } = await run(lighthouse, [
        base + page, '--output=json', '--quiet',
        '--only-categories=accessibility,performance',
        '--chrome-flags=--headless --no-sandbox',
      ], { maxBuffer: 64 * 1024 * 1024 });
      report = JSON.parse(out);
    } catch (err) {
      // Lighthouse exits non-zero when it cannot load the page; keep the log readable.
      failures.push(`${page}: Lighthouse could not measure it: ${String(err.stderr || err.message).trim().slice(0, 300)}`);
      continue;
    }
    const scores = Object.entries(report.categories).map(([k, v]) => `${k} ${v.score}`).join(', ');
    console.log(`${page}: ${scores}`);
    failures.push(...evaluate(page, report));
  }
} finally {
  server.close();
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('OK — Lighthouse accessibility and performance within thresholds.');
