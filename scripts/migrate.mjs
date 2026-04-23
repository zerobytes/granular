import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const STEPS = [
  'discover',
  'clone',
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
const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out',
  '.next', '.cache', '.turbo', '.vite', 'coverage',
]);

function parseArgs(argv) {
  const args = {
    positional: [],
    out: null,
    force: false,
    dryRun: false,
    steps: null,
    skip: new Set(),
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--force' || a === '-f') args.force = true;
    else if (a === '--out' || a === '-o') args.out = argv[++i] || null;
    else if (a.startsWith('--out=')) args.out = a.slice(6);
    else if (a === '--steps') args.steps = (argv[++i] || '').split(',').filter(Boolean);
    else if (a.startsWith('--steps=')) args.steps = a.slice(8).split(',').filter(Boolean);
    else if (a === '--skip') for (const s of (argv[++i] || '').split(',').filter(Boolean)) args.skip.add(s);
    else if (a.startsWith('--skip=')) for (const s of a.slice(7).split(',').filter(Boolean)) args.skip.add(s);
    else args.positional.push(a);
  }
  return args;
}

function printHelp() {
  console.log('Usage: granular migrate <source> [--out <path>] [--force] [--dry-run] [--steps a,b,c] [--skip x,y]');
  console.log('');
  console.log('Migrates a React project to Granular. Always writes to a NEW folder ');
  console.log('so the source tree stays intact for diffing.');
  console.log('');
  console.log('Arguments:');
  console.log('  <source>        Path to the React project to migrate (e.g. ./my-react-app)');
  console.log('');
  console.log('Options:');
  console.log('  --out, -o <p>   Destination folder. Default: "<source>-granular"');
  console.log('  --force, -f     Overwrite the destination folder if it already exists');
  console.log('  --dry-run       Plan the migration without writing any files');
  console.log('  --steps a,b,c   Run only the listed steps (default: all)');
  console.log('  --skip x,y      Skip the listed steps');
  console.log('');
  console.log('Steps:    ' + STEPS.join(', '));
  console.log('Codemods (in this order):');
  for (const t of CODEMODS_ORDERED) console.log('  ' + t);
  console.log('');
  console.log('Examples:');
  console.log('  granular migrate ./my-react-app');
  console.log('  granular migrate ./my-react-app --out ./my-granular-app');
  console.log('  granular migrate ./my-react-app --dry-run');
  console.log('  granular migrate ./my-react-app --out /tmp/preview --force');
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

function isInsidePath(child, parent) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function copyTree(srcRoot, dstRoot) {
  let copied = 0;
  let skipped = 0;
  const stack = [''];
  while (stack.length) {
    const rel = stack.pop();
    const srcPath = path.join(srcRoot, rel);
    const dstPath = path.join(dstRoot, rel);
    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) {
      const base = path.basename(srcPath);
      if (rel !== '' && IGNORE_DIRS.has(base)) { skipped++; continue; }
      fs.mkdirSync(dstPath, { recursive: true });
      for (const e of fs.readdirSync(srcPath)) stack.push(path.join(rel, e));
    } else if (stat.isFile()) {
      fs.copyFileSync(srcPath, dstPath);
      copied++;
    }
  }
  return { copied, skipped };
}

function rmTree(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function isEmptyDir(p) {
  try { return fs.readdirSync(p).length === 0; } catch { return true; }
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

function writeReport(sourceDir, destDir, report) {
  const lines = [];
  lines.push('# Granular Migration Report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Source:    ${sourceDir}`);
  lines.push(`Output:    ${destDir}`);
  lines.push('');

  lines.push('## Discover');
  lines.push(`Source files scanned: ${report.discover.total}`);
  lines.push('');

  if (report.clone) {
    lines.push('## Clone');
    lines.push(`Files copied: ${report.clone.copied}`);
    lines.push(`Directories skipped (ignored): ${report.clone.skipped}`);
    lines.push('');
  }

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
  lines.push(`1. \`cd ${path.relative(process.cwd(), destDir) || '.'}\``);
  lines.push('2. `npm install` to fetch the new Granular dependencies.');
  lines.push('3. Search for `TODO[granular-codemod]` comments and resolve each one.');
  lines.push('4. Run `granular lint .` until clean.');
  lines.push('5. Diff against the source folder to review the migration:');
  lines.push('   ```');
  lines.push(`   diff -ruN ${path.relative(process.cwd(), sourceDir) || '.'} ${path.relative(process.cwd(), destDir) || '.'}`);
  lines.push('   ```');
  lines.push('6. Run your test suite. Reactive sources read inside JSX may still need to be wrapped in `derive()` or `when()`.');
  lines.push('');

  const out = path.join(destDir, 'MIGRATION_REPORT.md');
  fs.writeFileSync(out, lines.join('\n'));
  return out;
}

function resolveDestination(sourceDir, requested) {
  if (requested) return path.resolve(requested);
  return path.resolve(path.dirname(sourceDir), `${path.basename(sourceDir)}-granular`);
}

function prepareDestination(sourceDir, destDir, force, dryRun) {
  if (sourceDir === destDir) {
    throw new Error('Refusing to migrate in place: source and destination are the same path.');
  }
  if (isInsidePath(destDir, sourceDir)) {
    throw new Error(`Destination "${destDir}" must not be inside source "${sourceDir}" (would recursively copy).`);
  }
  if (isInsidePath(sourceDir, destDir)) {
    throw new Error(`Source "${sourceDir}" must not be inside destination "${destDir}".`);
  }
  if (fs.existsSync(destDir)) {
    if (!isEmptyDir(destDir)) {
      if (!force) {
        throw new Error(
          `Destination "${destDir}" already exists and is not empty.\n` +
          `Re-run with --force to overwrite, or pass a different --out.`,
        );
      }
      if (!dryRun) rmTree(destDir);
    }
  }
  if (!dryRun) fs.mkdirSync(destDir, { recursive: true });
}

export async function runMigrate(argv) {
  const args = parseArgs(argv);
  if (args.help) { printHelp(); return 0; }

  if (args.positional.length === 0) {
    console.error('granular migrate: missing <source> argument.');
    console.error('');
    printHelp();
    return 1;
  }

  const sourceDir = path.resolve(args.positional[0]);
  if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
    console.error(`granular migrate: source is not a directory: ${sourceDir}`);
    return 1;
  }

  const destDir = resolveDestination(sourceDir, args.out);

  try {
    prepareDestination(sourceDir, destDir, args.force, args.dryRun);
  } catch (err) {
    console.error('granular migrate: ' + err.message);
    return 1;
  }

  const enabled = (name) => {
    if (args.skip.has(name)) return false;
    if (args.steps && !args.steps.includes(name)) return false;
    return true;
  };

  console.log(`granular migrate ${args.dryRun ? '(dry-run) ' : ''}`);
  console.log(`  source: ${sourceDir}`);
  console.log(`  output: ${destDir}`);
  console.log('');

  const { runner, tsconfigT, packageJsonT } = loadCodemods();
  const report = {
    discover: { total: 0 },
    clone: null,
    deps: [],
    config: [],
    codemods: [],
    errors: [],
    lint: null,
    audit: null,
  };

  if (enabled('discover')) {
    console.log('• discover');
    const sourceFiles = discover(sourceDir);
    report.discover.total = sourceFiles.length;
    console.log(`  ${sourceFiles.length} source files`);
  }

  if (enabled('clone')) {
    console.log('• clone');
    if (args.dryRun) {
      const sourceFiles = discover(sourceDir);
      report.clone = { copied: sourceFiles.length, skipped: 0, dryRun: true };
      console.log(`  would copy ${sourceFiles.length} source files (and project metadata)`);
    } else {
      const stats = copyTree(sourceDir, destDir);
      report.clone = stats;
      console.log(`  copied ${stats.copied} files (skipped ${stats.skipped} ignored dirs)`);
    }
  } else if (!fs.existsSync(destDir) || isEmptyDir(destDir)) {
    console.error('granular migrate: clone step skipped but destination is empty. ');
    console.error('Re-run without --skip clone (or restore the destination tree).');
    return 1;
  }

  const workRoot = args.dryRun ? sourceDir : destDir;

  if (enabled('deps')) {
    console.log('• deps');
    applyDeps(workRoot, args.dryRun, packageJsonT, report);
  }

  if (enabled('config')) {
    console.log('• config');
    applyConfig(workRoot, args.dryRun, runner, tsconfigT, report);
  }

  if (enabled('codemods')) {
    console.log('• codemods');
    const destFiles = discover(workRoot);
    runCodemodsAll(destFiles, args.dryRun, runner, report);
  }

  if (enabled('lint')) {
    console.log('• lint');
    runStaticAnalysis('lint', workRoot, report);
    console.log('  ' + (report.lint?.status === 'clean' ? 'clean' : 'findings'));
  }

  if (enabled('audit')) {
    console.log('• audit');
    runStaticAnalysis('audit', workRoot, report);
    console.log('  done');
  }

  if (enabled('report') && !args.dryRun) {
    const out = writeReport(sourceDir, destDir, report);
    console.log('');
    console.log('Report: ' + out);
  } else if (enabled('report') && args.dryRun) {
    console.log('');
    console.log('(dry-run) Report would be written to: ' + path.join(destDir, 'MIGRATION_REPORT.md'));
  }

  console.log('');
  console.log('Done. Source folder is untouched. Diff with:');
  console.log(`  diff -ruN ${path.relative(process.cwd(), sourceDir) || '.'} ${path.relative(process.cwd(), destDir) || '.'}`);

  return 0;
}
