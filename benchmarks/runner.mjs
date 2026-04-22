#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cases = [];

export function bench(name, fn, options = {}) {
  cases.push({ name, fn, ...options });
}

const args = process.argv.slice(2);
const flags = {
  baselinePath: null,
  outputPath: null,
  filter: null,
  threshold: 0.20,
  iterations: null,
  json: false,
  fail: false,
};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--baseline') flags.baselinePath = args[++i];
  else if (a === '--out') flags.outputPath = args[++i];
  else if (a === '--filter') flags.filter = args[++i];
  else if (a === '--threshold') flags.threshold = parseFloat(args[++i]);
  else if (a === '--iterations') flags.iterations = parseInt(args[++i], 10);
  else if (a === '--json') flags.json = true;
  else if (a === '--fail-on-regression') flags.fail = true;
}

async function loadSuites() {
  const dir = path.join(__dirname, 'suites');
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.bench.mjs')).sort();
  for (const f of files) {
    await import(pathToFileURL(path.join(dir, f)).href);
  }
}

async function runOne({ name, fn, iterations, warmup }) {
  const total = flags.iterations ?? iterations ?? 1000;
  const warm = warmup ?? Math.min(50, Math.floor(total / 10));
  for (let i = 0; i < warm; i++) await fn();

  const samples = [];
  const sampleSize = Math.min(total, 5);
  const opsPerSample = Math.max(1, Math.floor(total / sampleSize));
  for (let s = 0; s < sampleSize; s++) {
    const t0 = performance.now();
    for (let i = 0; i < opsPerSample; i++) await fn();
    const t1 = performance.now();
    samples.push((t1 - t0) / opsPerSample);
  }
  samples.sort((a, b) => a - b);
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const median = samples[Math.floor(samples.length / 2)];
  const min = samples[0];
  const max = samples[samples.length - 1];
  const opsPerSec = 1000 / median;
  return { name, samples, mean, median, min, max, opsPerSec, iterations: total };
}

function loadBaseline() {
  if (!flags.baselinePath) return null;
  if (!fs.existsSync(flags.baselinePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(flags.baselinePath, 'utf8'));
  } catch { return null; }
}

function compare(current, baseline) {
  if (!baseline) return null;
  const baseMap = new Map(baseline.results.map((r) => [r.name, r]));
  const diffs = [];
  for (const r of current.results) {
    const b = baseMap.get(r.name);
    if (!b) { diffs.push({ name: r.name, status: 'new', delta: 0, current: r.median, baseline: null }); continue; }
    const delta = (r.median - b.median) / b.median;
    let status = 'stable';
    if (delta > flags.threshold) status = 'regression';
    else if (delta < -flags.threshold) status = 'improvement';
    diffs.push({ name: r.name, status, delta, current: r.median, baseline: b.median });
  }
  return diffs;
}

function fmt(ms) { return `${ms.toFixed(4)}ms`; }
function fmtPct(d) { const s = d >= 0 ? '+' : ''; return `${s}${(d * 100).toFixed(1)}%`; }

async function main() {
  await loadSuites();
  const filtered = cases.filter((c) => !flags.filter || c.name.includes(flags.filter));
  if (!filtered.length) {
    console.error('No benchmarks matched filter.');
    process.exit(1);
  }

  const results = [];
  for (const c of filtered) {
    process.stdout.write(`> ${c.name} ... `);
    const r = await runOne(c);
    results.push(r);
    process.stdout.write(`${fmt(r.median)} median (${r.opsPerSec.toFixed(0)} ops/sec)\n`);
  }

  const report = {
    timestamp: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    results,
  };

  if (flags.outputPath) {
    fs.mkdirSync(path.dirname(flags.outputPath), { recursive: true });
    fs.writeFileSync(flags.outputPath, JSON.stringify(report, null, 2));
    console.log(`\nSaved report to ${flags.outputPath}`);
  }

  const baseline = loadBaseline();
  if (baseline) {
    const diffs = compare(report, baseline);
    console.log('\nComparison vs baseline:');
    let regressed = 0;
    for (const d of diffs) {
      const tag = d.status === 'regression' ? 'REGRESSION'
        : d.status === 'improvement' ? 'IMPROVED'
        : d.status === 'new' ? 'NEW'
        : 'stable';
      const pct = d.baseline != null ? `  (${fmtPct(d.delta)})` : '';
      console.log(`  [${tag}] ${d.name}: ${fmt(d.current)}${pct}`);
      if (d.status === 'regression') regressed++;
    }
    if (flags.fail && regressed > 0) {
      console.error(`\n${regressed} benchmark(s) regressed beyond ${(flags.threshold * 100).toFixed(0)}% threshold.`);
      process.exit(2);
    }
  }

  if (flags.json) console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
