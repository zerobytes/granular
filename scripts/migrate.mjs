import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const STEPS = [
  'discover',
  'deps',
  'config',
  'codemods',
  'lint',
  'audit',
  'report',
];

const CODEMODS_ORDERED = [
  'useState-to-signal',
  'useRef-to-signal',
  'useMemo-to-derive',
  'useEffect-to-after',
  'useCallback-remove',
  'useContext-to-context',
  'setState-updater',
  'array-map-to-list',
  'conditional-jsx-to-when',
  'react-imports',
];

const SOURCE_EXTS = new Set(['.js', '.jsx', '.ts', '.tsx']);
const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', '.cache']);

function parseArgs(argv) {
  const args = { positional: [], dryRun: false, steps: null, skip: new Set(), help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--steps') args.steps = (argv[++i] || '').split(',').filter(Boolean);
    else if (a.startsWith('--steps=')) args.steps = a.slice(8).split(',').filter(Boolean);
    else if (a === '--skip') for (const s of (argv[++i] || '').split(',').filter(Boolean)) args.skip.add(s);
    else if (a.startsWith('--skip=')) for (const s of a.slice(7).split(',').filter(Boolean)) args.skip.add(s);
    else args.positional.push(a);
  }
  return args;
}

function printHelp() {
  console.log('Usage: granular migrate [path] [--dry-run] [--steps a,b,c] [--skip x,y]');
  console.log('');
  console.log('Steps: ' + STEPS.join(', '));
  console.log('Codemods (run in this order):');
  for (const t of CODEMODS_ORDERED) console.log('  ' + t);
}

function discover(rootDir) {
  const files = [];
  const stack = [rootDir];
  while (stack.length) {
    const cur = stack.pop();
    let stat;
    try { stat = fs.statSync(cur); } catch { continue; }
    if (stat.isDirectory()) {
      const base = path.basename(cur);
      if (IGNORE_DIRS.has(base)) continue;
      for (const e of fs.readdirSync(cur)) stack.push(path.join(cur, e));
    } else if (SOURCE_EXTS.has(path.extname(cur))) {
      files.push(cur);
    }
  }
  return files.sort();
}

function tryRequire(id, fallbackPaths) {
  try { return require(id); } catch {}
  for (const p of fallbackPaths) {
    if (fs.existsSync(p)) {
      try { return require(p); } catch {}
    }
  }
  return null;
}

function loadCodemods() {
  const here = path.dirname(new URL(import.meta.url).pathname);
  const pkgRoot = path.resolve(here, '..');
  const candidates = [
    path.resolve(pkgRoot, '..', 'granular-codemods'),
    path.resolve(process.cwd(), '..', 'granular-codemods'),
    path.resolve(process.cwd(), 'granular-codemods'),
  ];

  const runnerFallbacks = candidates.map((c) => path.join(c, 'src', 'runner.js'));
  const tsconfigFallbacks = candidates.map((c) => path.join(c, 'src', 'transforms', 'tsconfig.js'));
  const packageJsonFallbacks = candidates.map((c) => path.join(c, 'src', 'transforms', 'package-json.js'));

  const runner = tryRequire('@granularjs/codemods/runner', runnerFallbacks);
  if (!runner) throw new Error('Could not load @granularjs/codemods. Install it as a dev dependency.');
  const tsconfigT = tryRequire('@granularjs/codemods/transforms/tsconfig', tsconfigFallbacks);
  const packageJsonT = tryRequire('@granularjs/codemods/transforms/package-json', packageJsonFallbacks);

  return { runner, tsconfigT, packageJsonT };
}

function applyDeps(rootDir, dryRun, packageJsonT, report) {
  const pkgPath = path.join(rootDir, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    report.deps.push({ file: pkgPath, status: 'missing' });
    return;
  }
  const src = fs.readFileSync(pkgPath, 'utf8');
  const { source, changed, error } = packageJsonT(src);
  if (error) {
    report.deps.push({ file: pkgPath, status: 'error', error });
    return;
  }
  if (changed) {
    if (!dryRun) fs.writeFileSync(pkgPath, source);
    report.deps.push({ file: pkgPath, status: dryRun ? 'preview' : 'changed' });
  } else {
    report.deps.push({ file: pkgPath, status: 'unchanged' });
  }
}

function applyConfig(rootDir, dryRun, runner, tsconfigT, report) {
  for (const fname of ['tsconfig.json', 'tsconfig.app.json']) {
    const p = path.join(rootDir, fname);
    if (!fs.existsSync(p)) continue;
    const src = fs.readFileSync(p, 'utf8');
    const { source, changed, error } = tsconfigT(src);
    if (error) {
      report.config.push({ file: p, status: 'error', error });
      continue;
    }
    if (changed) {
      if (!dryRun) fs.writeFileSync(p, source);
      report.config.push({ file: p, status: dryRun ? 'preview' : 'changed' });
    }
  }

  for (const fname of ['vite.config.js', 'vite.config.ts', 'vite.config.mjs']) {
    const p = path.join(rootDir, fname);
    if (!fs.existsSync(p)) continue;
    const src = fs.readFileSync(p, 'utf8');
    let next;
    try {
      next = runner.runTransformOnSource('vite-config', src, { path: p });
    } catch (err) {
      report.config.push({ file: p, status: 'error', error: err.message });
      continue;
    }
    if (next !== src) {
      if (!dryRun) fs.writeFileSync(p, next);
      report.config.push({ file: p, status: dryRun ? 'preview' : 'changed' });
    }
  }
}

function runCodemodsAll(files, dryRun, runner, report) {
  for (const transform of CODEMODS_ORDERED) {
    let changed = 0;
    let errors = 0;
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      let next;
      try {
        next = runner.runTransformOnSource(transform, src, { path: file });
      } catch (err) {
        errors++;
        report.errors.push({ transform, file, error: err.message });
        continue;
      }
      if (next !== src) {
        if (!dryRun) fs.writeFileSync(file, next);
        changed++;
      }
    }
    report.codemods.push({ transform, changed, errors, total: files.length });
    console.log(`  ${transform.padEnd(28)} ${changed}/${files.length} files ${dryRun ? '(preview)' : ''}${errors ? ' [' + errors + ' error(s)]' : ''}`);
  }
}

function findGranularCli() {
  const local = path.resolve(process.cwd(), 'node_modules', '.bin', 'granular');
  if (fs.existsSync(local)) return local;
  const here = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'bin', 'granular.js');
  if (fs.existsSync(here)) return here;
  return null;
}

function runStaticAnalysis(name, rootDir, report) {
  const cli = findGranularCli();
  if (!cli) {
    report[name] = { status: 'skipped', reason: 'granular CLI not found' };
    return;
  }
  const isJs = cli.endsWith('.js') || cli.endsWith('.mjs');
  const cmd = isJs ? 'node' : cli;
  const args = isJs ? [cli, name, rootDir] : [name, rootDir];
  const res = spawnSync(cmd, args, { encoding: 'utf8' });
  report[name] = { status: res.status === 0 ? 'clean' : 'findings', exit: res.status, stdout: res.stdout, stderr: res.stderr };
}

function writeReport(rootDir, report) {
  const lines = [];
  lines.push('# Granular Migration Report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Root: ${rootDir}`);
  lines.push('');

  lines.push('## Discover');
  lines.push(`Files scanned: ${report.discover.total}`);
  lines.push('');

  lines.push('## Dependencies (package.json)');
  if (report.deps.length === 0) lines.push('No package.json processed.');
  for (const d of report.deps) lines.push(`- ${d.status}: ${d.file}${d.error ? ' — ' + d.error : ''}`);
  lines.push('');

  lines.push('## Config files');
  if (report.config.length === 0) lines.push('No config files needed changes.');
  for (const d of report.config) lines.push(`- ${d.status}: ${d.file}${d.error ? ' — ' + d.error : ''}`);
  lines.push('');

  lines.push('## Codemods');
  lines.push('| Transform | Changed | Errors | Files |');
  lines.push('|-----------|---------|--------|-------|');
  for (const c of report.codemods) {
    lines.push(`| ${c.transform} | ${c.changed} | ${c.errors} | ${c.total} |`);
  }
  lines.push('');

  if (report.errors.length) {
    lines.push('## Errors');
    for (const e of report.errors) lines.push(`- [${e.transform}] ${e.file}: ${e.error}`);
    lines.push('');
  }

  lines.push('## Lint');
  if (report.lint) {
    lines.push(`Status: ${report.lint.status} (exit ${report.lint.exit ?? '-'})`);
    if (report.lint.stdout) {
      lines.push('```');
      lines.push(report.lint.stdout.trim());
      lines.push('```');
    }
  }
  lines.push('');

  lines.push('## Audit');
  if (report.audit) {
    lines.push(`Status: ${report.audit.status} (exit ${report.audit.exit ?? '-'})`);
    if (report.audit.stdout) {
      lines.push('```');
      lines.push(report.audit.stdout.trim());
      lines.push('```');
    }
  }
  lines.push('');

  lines.push('## Next steps');
  lines.push('1. `npm install` to fetch the new Granular dependencies.');
  lines.push('2. Search for `TODO[granular-codemod]` comments and resolve each one.');
  lines.push('3. Re-run `granular lint .` until clean.');
  lines.push('4. Run your test suite. Reactive sources read inside JSX still need to be wrapped in `derive()` or `when()` if they were used as plain JS values in React.');
  lines.push('');

  const out = path.join(rootDir, 'MIGRATION_REPORT.md');
  fs.writeFileSync(out, lines.join('\n'));
  return out;
}

export async function runMigrate(argv) {
  const args = parseArgs(argv);
  if (args.help) { printHelp(); return 0; }

  const rootDir = path.resolve(args.positional[0] || '.');
  if (!fs.existsSync(rootDir) || !fs.statSync(rootDir).isDirectory()) {
    console.error('Migrate target is not a directory: ' + rootDir);
    return 1;
  }

  const enabled = (name) => {
    if (args.skip.has(name)) return false;
    if (args.steps && !args.steps.includes(name)) return false;
    return true;
  };

  console.log(`granular migrate ${args.dryRun ? '(dry-run) ' : ''}→ ${rootDir}`);
  console.log('');

  const { runner, tsconfigT, packageJsonT } = loadCodemods();
  const report = {
    discover: { total: 0 },
    deps: [],
    config: [],
    codemods: [],
    errors: [],
    lint: null,
    audit: null,
  };

  let files = [];
  if (enabled('discover')) {
    console.log('• discover');
    files = discover(rootDir);
    report.discover.total = files.length;
    console.log(`  ${files.length} source files`);
  }

  if (enabled('deps')) {
    console.log('• deps');
    applyDeps(rootDir, args.dryRun, packageJsonT, report);
  }

  if (enabled('config')) {
    console.log('• config');
    applyConfig(rootDir, args.dryRun, runner, tsconfigT, report);
  }

  if (enabled('codemods')) {
    console.log('• codemods');
    if (!files.length) files = discover(rootDir);
    runCodemodsAll(files, args.dryRun, runner, report);
  }

  if (enabled('lint')) {
    console.log('• lint');
    runStaticAnalysis('lint', rootDir, report);
    console.log('  ' + (report.lint.status === 'clean' ? 'clean' : 'findings'));
  }

  if (enabled('audit')) {
    console.log('• audit');
    runStaticAnalysis('audit', rootDir, report);
    console.log('  done');
  }

  if (enabled('report')) {
    const out = writeReport(rootDir, report);
    console.log('');
    console.log('Report: ' + out);
  }

  return 0;
}
