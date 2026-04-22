import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const cliPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../bin/granular.js');

function run(args, cwd) {
  return spawnSync(process.execPath, [cliPath, ...args], { cwd, encoding: 'utf8' });
}

test('granular create scaffolds basic template with required files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'granular-create-'));
  const result = run(['create', 'myapp', '--template', 'basic'], dir);
  assert.equal(result.status, 0, result.stderr);
  const appDir = path.join(dir, 'myapp');
  assert.ok(fs.existsSync(path.join(appDir, 'package.json')));
  assert.ok(fs.existsSync(path.join(appDir, 'index.html')));
  assert.ok(fs.existsSync(path.join(appDir, 'src/main.js')));
  const pkg = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'myapp');
  assert.ok(pkg.dependencies['@granularjs/core']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('granular create supports router template', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'granular-create-'));
  const result = run(['create', 'rapp', '--template', 'router'], dir);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(path.join(dir, 'rapp/src/pages/Home.js')));
  assert.ok(fs.existsSync(path.join(dir, 'rapp/src/pages/About.js')));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('granular create rejects unknown template', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'granular-create-'));
  const result = run(['create', 'badapp', '--template', 'nonexistent'], dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unknown template/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('granular create refuses non-empty directory without --force', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'granular-create-'));
  fs.mkdirSync(path.join(dir, 'occupied'));
  fs.writeFileSync(path.join(dir, 'occupied/file.txt'), 'present');
  const result = run(['create', 'occupied'], dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not empty/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('granular create includes ui template with @granularjs/ui dep', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'granular-create-'));
  const result = run(['create', 'uiapp', '--template', 'ui'], dir);
  assert.equal(result.status, 0, result.stderr);
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'uiapp/package.json'), 'utf8'));
  assert.ok(pkg.dependencies['@granularjs/ui']);
  fs.rmSync(dir, { recursive: true, force: true });
});
