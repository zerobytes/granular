import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const cliPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../bin/granular.js');

test('granular lint reports core anti-patterns', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'granular-lint-'));
  const filePath = path.join(tempDir, 'app.js');

  fs.writeFileSync(filePath, `
    import { Div, state } from '@granularjs/core';
    const items = state([{ label: 'A' }]);
    export const App = () => Div(
      ...items,
      items.map((item) => Div(item.label))
    );
  `);

  const result = spawnSync(process.execPath, [cliPath, 'lint', filePath], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /no-array-spread-in-tag/);
  assert.match(result.stdout, /no-reactive-map-render/);
});

test('granular lint exits cleanly when no anti-pattern is found', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'granular-lint-clean-'));
  const filePath = path.join(tempDir, 'app.js');

  fs.writeFileSync(filePath, `
    import { Div, list, state } from '@granularjs/core';
    const items = state([{ label: 'A' }]);
    export const App = () => Div(list(items, (item) => Div(item.label)));
  `);

  const result = spawnSync(process.execPath, [cliPath, 'lint', filePath], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /No anti-patterns found/);
});

test('granular docs serves the module docs viewer', async () => {
  const child = spawn(process.execPath, [cliPath, 'docs', '--host', '127.0.0.1', '--port', '0'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const url = await new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      reject(new Error(`docs server did not start\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, 10_000);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      const match = stdout.match(/Module docs available at (http:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`docs server exited early with code ${code}\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    });
  });

  const html = await new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        resolve(body);
      });
    }).on('error', reject);
  });

  assert.match(html, /Granular Module Docs/);
  assert.match(html, /runtime\.md/);

  child.kill('SIGINT');
  await new Promise((resolve) => child.once('exit', resolve));
});
