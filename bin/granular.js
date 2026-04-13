#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';

const traverse = traverseModule.default;
const JS_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx']);
const IGNORE_DIRS = new Set(['.git', 'dist', 'node_modules']);

function printUsage() {
  console.log('Usage: granular lint <path ...>');
  console.log('       granular docs [--host 127.0.0.1] [--port 4178] [--open]');
}

function isTagCall(node) {
  if (!node || node.type !== 'CallExpression') return false;
  const { callee } = node;
  if (callee.type === 'Identifier') {
    return /^[A-Z]/.test(callee.name);
  }
  if (callee.type === 'MemberExpression' && !callee.computed && callee.property.type === 'Identifier') {
    return /^[A-Z]/.test(callee.property.name);
  }
  return false;
}

function getReactiveBindingKind(init) {
  if (!init || init.type !== 'CallExpression') return null;
  const callee = init.callee;
  if (callee.type !== 'Identifier') return null;
  if (callee.name === 'state') return 'state';
  if (callee.name === 'signal') return 'signal';
  if (callee.name === 'observableArray') return 'observableArray';
  return null;
}

function collectTargets(entries) {
  const queue = entries.length ? entries : ['.'];
  const files = [];

  while (queue.length) {
    const current = path.resolve(queue.shift());
    if (!fs.existsSync(current)) continue;
    const stat = fs.statSync(current);
    if (stat.isDirectory()) {
      const base = path.basename(current);
      if (IGNORE_DIRS.has(base)) continue;
      for (const entry of fs.readdirSync(current)) {
        queue.push(path.join(current, entry));
      }
      continue;
    }
    if (JS_EXTENSIONS.has(path.extname(current))) files.push(current);
  }

  return files.sort();
}

function getCallbackReturnedNode(callback) {
  if (!callback) return null;
  if (callback.type === 'ArrowFunctionExpression' && callback.body.type !== 'BlockStatement') {
    return callback.body;
  }
  if (callback.body?.type !== 'BlockStatement') return null;
  for (const stmt of callback.body.body) {
    if (stmt.type === 'ReturnStatement') return stmt.argument || null;
  }
  return null;
}

function isRenderableExpression(node) {
  if (!node) return false;
  if (node.type === 'CallExpression') return isTagCall(node);
  if (node.type === 'ArrayExpression') return true;
  return false;
}

function analyzeFile(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const findings = [];
  let ast;

  try {
    ast = parse(source, {
      sourceType: 'unambiguous',
      plugins: ['jsx', 'typescript'],
    });
  } catch (error) {
    findings.push({
      rule: 'parse-error',
      message: `Nao foi possivel analisar o arquivo: ${error.message}`,
      line: error.loc?.line || 1,
      column: error.loc?.column || 0,
    });
    return findings;
  }

  const reactiveBindings = new Map();

  traverse(ast, {
    VariableDeclarator(pathRef) {
      const { node } = pathRef;
      if (node.id.type !== 'Identifier') return;
      const kind = getReactiveBindingKind(node.init);
      if (kind) reactiveBindings.set(node.id.name, kind);
    },
    CallExpression(pathRef) {
      const { node } = pathRef;

      if (isTagCall(node)) {
        for (const arg of node.arguments) {
          if (arg.type === 'SpreadElement') {
            findings.push({
              rule: 'no-array-spread-in-tag',
              message: 'Nao use spread de array em tags do Granular. Passe o array diretamente para preservar o contrato de renderizacao.',
              line: arg.loc?.start.line || 1,
              column: arg.loc?.start.column || 0,
            });
          }

          if (arg.type !== 'CallExpression') continue;
          if (arg.callee.type !== 'MemberExpression' || arg.callee.computed) continue;
          if (arg.callee.property.type !== 'Identifier' || arg.callee.property.name !== 'map') continue;
          if (arg.callee.object.type !== 'Identifier') continue;
          if (!reactiveBindings.has(arg.callee.object.name)) continue;

          const callback = arg.arguments[0];
          const returned = getCallbackReturnedNode(callback);
          if (!isRenderableExpression(returned)) continue;

          findings.push({
            rule: 'no-reactive-map-render',
            message: `Nao use .map() para renderizar colecao reativa (${reactiveBindings.get(arg.callee.object.name)}). Use list().`,
            line: arg.loc?.start.line || 1,
            column: arg.loc?.start.column || 0,
          });
        }
      }

      if (node.callee.type === 'Identifier' && node.callee.name === 'when' && pathRef.parentPath.isObjectProperty()) {
        const branches = [node.arguments[1], node.arguments[2]].filter(Boolean);
        for (const branch of branches) {
          const returned = getCallbackReturnedNode(branch);
          if (!isRenderableExpression(returned)) continue;
          findings.push({
            rule: 'no-renderable-when-prop',
            message: 'when() em prop deve resolver valor atribuivel, nao branch renderavel complexa.',
            line: branch.loc?.start.line || 1,
            column: branch.loc?.start.column || 0,
          });
        }
      }
    },
  });

  return findings;
}

function runLint(targets) {
  const files = collectTargets(targets);
  const findings = [];

  for (const filePath of files) {
    for (const finding of analyzeFile(filePath)) {
      findings.push({ ...finding, filePath });
    }
  }

  if (!findings.length) {
    console.log('No anti-patterns found.');
    return 0;
  }

  for (const finding of findings) {
    console.log(`${finding.filePath}:${finding.line}:${finding.column + 1} [${finding.rule}] ${finding.message}`);
  }
  return 1;
}

const [, , command, ...rest] = process.argv;

if (!command || command === '--help' || command === '-h') {
  printUsage();
  process.exit(command ? 0 : 1);
}

if (command === 'lint') {
  process.exit(runLint(rest));
}

if (command === 'docs') {
  const modulePath = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../scripts/serve-module-docs.mjs');
  const { runModuleDocsServer } = await import(`file://${modulePath}`);
  await runModuleDocsServer(rest);
  process.exit(0);
}

console.error(`Unknown command: ${command}`);
printUsage();
process.exit(1);
