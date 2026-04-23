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
  console.log('       granular audit <path ...>');
  console.log('       granular create <appName> [--basic|--complete] [--template basic|router|ssr|ui]');
  console.log('       granular docs [--host 127.0.0.1] [--port 4178] [--open]');
  console.log('       granular migrate <source> [--out <path>] [--force] [--dry-run] [--steps a,b,c] [--skip x,y]');
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
  if (callee.type === 'Identifier') {
    if (callee.name === 'state') return 'state';
    if (callee.name === 'signal') return 'signal';
    if (callee.name === 'observableArray') return 'observableArray';
    if (callee.name === 'computed') return 'computed';
    if (callee.name === 'derive') return 'computed';
  }
  if (callee.type === 'MemberExpression' && !callee.computed) {
    const prop = callee.property?.name;
    if (prop === 'compute') return 'computed';
  }
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

function isInsideSafeWrapper(pathRef) {
  let p = pathRef.parentPath;
  while (p) {
    const node = p.node;
    if (node?.type === 'ArrowFunctionExpression' || node?.type === 'FunctionExpression') {
      const grand = p.parentPath?.node;
      if (grand?.type === 'CallExpression') return true;
      if (grand?.type === 'ObjectProperty') return true;
      if (grand?.type === 'JSXExpressionContainer') return true;
      if (grand?.type === 'ReturnStatement') {
        let pp = p.parentPath;
        while (pp && pp.node.type !== 'FunctionDeclaration' && pp.node.type !== 'FunctionExpression' && pp.node.type !== 'ArrowFunctionExpression') {
          pp = pp.parentPath;
        }
        if (pp) {
          const grandgrand = pp.parentPath?.node;
          if (grandgrand?.type === 'CallExpression' || grandgrand?.type === 'ObjectProperty') return true;
        }
      }
    }
    p = p.parentPath;
  }
  return false;
}

function isLiteralNode(node) {
  if (!node) return false;
  return node.type === 'StringLiteral'
    || node.type === 'NumericLiteral'
    || node.type === 'BooleanLiteral'
    || node.type === 'NullLiteral'
    || node.type === 'TemplateLiteral';
}

function isComponentFunction(fn) {
  if (!fn) return false;
  if (fn.type !== 'FunctionDeclaration' && fn.type !== 'FunctionExpression' && fn.type !== 'ArrowFunctionExpression') return false;
  const id = fn.id?.name || fn.__inferredName;
  if (id && /^[A-Z]/.test(id)) return true;
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

  const proxyDecls = new WeakMap();
  const propsDecls = new WeakSet();

  const bindingKey = (binding) => binding?.identifier || binding?.path?.node;

  const isProxyName = (pathRef, name) => {
    if (!name) return false;
    const binding = pathRef.scope?.getBinding(name);
    const key = bindingKey(binding);
    if (!key) return false;
    return proxyDecls.has(key);
  };

  const isPropsName = (pathRef, name) => {
    if (!name) return false;
    const binding = pathRef.scope?.getBinding(name);
    const key = bindingKey(binding);
    if (!key) return false;
    return propsDecls.has(key);
  };

  const isProxyIdentifierAt = (pathRef, node) => {
    if (!node || node.type !== 'Identifier') return false;
    return isProxyName(pathRef, node.name);
  };

  const isMaybeProxyExpressionAt = (pathRef, node) => {
    if (!node) return false;
    if (isProxyIdentifierAt(pathRef, node)) return true;
    if (node.type === 'MemberExpression' && !node.computed) {
      return isMaybeProxyExpressionAt(pathRef, node.object);
    }
    return false;
  };

  const reportProxyComparison = (pathRef) => {
    const { node } = pathRef;
    const ops = new Set(['===', '!==', '==', '!=', '<', '>', '<=', '>=']);
    if (!ops.has(node.operator)) return;
    const leftLit = isLiteralNode(node.left);
    const rightLit = isLiteralNode(node.right);
    const leftProxy = isMaybeProxyExpressionAt(pathRef, node.left);
    const rightProxy = isMaybeProxyExpressionAt(pathRef, node.right);
    if (!((leftProxy && rightLit) || (rightProxy && leftLit))) return;
    if (isInsideSafeWrapper(pathRef)) return;
    findings.push({
      rule: 'no-proxy-comparison',
      message: 'Proxy reativo nao pode ser comparado direto com literal. Use after().compute, classMap, eq() ou .get() dentro de callback resolvido.',
      line: node.loc?.start.line || 1,
      column: node.loc?.start.column || 0,
    });
  };

  const reportProxyTruthy = (pathRef) => {
    const { node } = pathRef;
    if (node.type === 'LogicalExpression') {
      if (node.operator !== '&&' && node.operator !== '||' && node.operator !== '??') return;
      if (!isProxyIdentifierAt(pathRef, node.left)) return;
      if (isInsideSafeWrapper(pathRef)) return;
      findings.push({
        rule: 'no-proxy-truthy',
        message: 'Proxy reativo em && / || avalia o objeto, nao o valor. Use classFlag, when, after().compute ou .get().',
        line: node.loc?.start.line || 1,
        column: node.loc?.start.column || 0,
      });
    }
    if (node.type === 'ConditionalExpression') {
      if (!isProxyIdentifierAt(pathRef, node.test)) return;
      if (isInsideSafeWrapper(pathRef)) return;
      findings.push({
        rule: 'no-proxy-truthy',
        message: 'Proxy reativo como teste de ternario nao reage. Use after().compute, when ou .get().',
        line: node.loc?.start.line || 1,
        column: node.loc?.start.column || 0,
      });
    }
    if (node.type === 'UnaryExpression' && node.operator === '!') {
      if (node.argument?.type === 'UnaryExpression' && node.argument.operator === '!') {
        if (!isProxyIdentifierAt(pathRef, node.argument.argument)) return;
        if (isInsideSafeWrapper(pathRef)) return;
        findings.push({
          rule: 'no-proxy-truthy',
          message: 'Coercao !! em proxy reativo retorna sempre true. Use resolveBool() ou .get().',
          line: node.loc?.start.line || 1,
          column: node.loc?.start.column || 0,
        });
      }
    }
  };

  const COERCION_FUNCS = new Set(['String', 'Number', 'Boolean', 'parseInt', 'parseFloat']);
  const TIME_FUNCS = new Set(['setTimeout', 'setInterval']);

  const reportCoercion = (pathRef) => {
    const { node } = pathRef;
    if (node.callee.type === 'Identifier' && COERCION_FUNCS.has(node.callee.name)) {
      const arg = node.arguments[0];
      if (!isProxyIdentifierAt(pathRef, arg)) return;
      if (isInsideSafeWrapper(pathRef)) return;
      findings.push({
        rule: 'no-proxy-coercion',
        message: `${node.callee.name}() em proxy reativo retorna placeholder. Resolva antes via resolveValue() ou .get().`,
        line: node.loc?.start.line || 1,
        column: node.loc?.start.column || 0,
      });
      return;
    }
    if (node.callee.type === 'Identifier' && TIME_FUNCS.has(node.callee.name)) {
      const arg = node.arguments[1];
      if (!isProxyIdentifierAt(pathRef, arg)) return;
      findings.push({
        rule: 'no-proxy-as-arg',
        message: `${node.callee.name} recebeu proxy reativo como delay. Resolva o valor antes (resolveValue ou .get()).`,
        line: node.loc?.start.line || 1,
        column: node.loc?.start.column || 0,
      });
      return;
    }
    if (node.callee.type === 'MemberExpression'
      && !node.callee.computed
      && node.callee.object?.type === 'Identifier'
      && node.callee.object.name === 'Array'
      && node.callee.property?.name === 'isArray') {
      const arg = node.arguments[0];
      if (!isProxyIdentifierAt(pathRef, arg)) return;
      findings.push({
        rule: 'no-proxy-coercion',
        message: 'Array.isArray() em proxy reativo retorna false silenciosamente. Resolva antes.',
        line: node.loc?.start.line || 1,
        column: node.loc?.start.column || 0,
      });
    }
  };

  traverse(ast, {
    VariableDeclarator(pathRef) {
      const { node } = pathRef;

      if (node.id.type === 'Identifier') {
        const kind = getReactiveBindingKind(node.init);
        if (kind) {
          const binding = pathRef.scope?.getBinding(node.id.name);
          const key = bindingKey(binding) || node.id;
          proxyDecls.set(key, kind);
        }
      }

      if (node.id.type === 'ObjectPattern') {
        const initIsSplit = node.init?.type === 'CallExpression'
          && node.init.callee?.type === 'Identifier'
          && node.init.callee.name === 'splitPropsChildren';
        if (initIsSplit) {
          for (const property of node.id.properties) {
            if (property.type !== 'ObjectProperty') continue;
            if (property.key.type !== 'Identifier') continue;
            if (property.key.name !== 'props') continue;
            if (property.value.type !== 'Identifier') continue;
            const binding = pathRef.scope?.getBinding(property.value.name);
            const key = bindingKey(binding);
            if (key) propsDecls.add(key);
          }
        }

        const initIsCall = node.init?.type === 'CallExpression';
        if (initIsCall && !initIsSplit) {
          const callee = node.init.callee;
          let factoryName = null;
          if (callee?.type === 'Identifier') factoryName = callee.name;
          else if (callee?.type === 'MemberExpression' && !callee.computed) factoryName = callee.property?.name;
          if (factoryName === 'state' || factoryName === 'computed' || factoryName === 'derive') {
            for (const property of node.id.properties) {
              if (property.type !== 'ObjectProperty') continue;
              const targetName = property.value.type === 'Identifier'
                ? property.value.name
                : property.value.type === 'AssignmentPattern' && property.value.left?.type === 'Identifier'
                  ? property.value.left.name
                  : null;
              if (!targetName) continue;
              const tBinding = pathRef.scope?.getBinding(targetName);
              const key = bindingKey(tBinding);
              if (key) proxyDecls.set(key, factoryName);
            }
          }
        }

        const initIsIdent = node.init?.type === 'Identifier';
        if (initIsIdent) {
          const binding = pathRef.scope?.getBinding(node.init.name);
          const initKey = bindingKey(binding);
          if (initKey && propsDecls.has(initKey)) {
            for (const property of node.id.properties) {
              if (property.type === 'ObjectProperty') {
                const targetName = property.value.type === 'Identifier'
                  ? property.value.name
                  : property.value.type === 'AssignmentPattern' && property.value.left?.type === 'Identifier'
                    ? property.value.left.name
                    : null;
                if (!targetName) continue;
                const tBinding = pathRef.scope?.getBinding(targetName);
                const tKey = bindingKey(tBinding);
                if (tKey) proxyDecls.set(tKey, 'prop');
              } else if (property.type === 'RestElement' && property.argument.type === 'Identifier') {
                const rBinding = pathRef.scope?.getBinding(property.argument.name);
                const rKey = bindingKey(rBinding);
                if (rKey) propsDecls.add(rKey);
              }
            }
          }
        }
      }
    },

    BinaryExpression(pathRef) {
      reportProxyComparison(pathRef);
    },
    LogicalExpression(pathRef) {
      reportProxyTruthy(pathRef);
    },
    ConditionalExpression(pathRef) {
      reportProxyTruthy(pathRef);
    },
    UnaryExpression(pathRef) {
      reportProxyTruthy(pathRef);
    },
    CallExpression(pathRef) {
      const { node } = pathRef;

      reportCoercion(pathRef);

      if (isTagCall(node)) {
        for (const arg of node.arguments) {
          if (arg.type === 'SpreadElement') {
            const inner = arg.argument;
            const innerName = inner?.type === 'Identifier' ? inner.name : null;
            const isReactiveSpread = innerName && isProxyName(pathRef, innerName);
            const isChildrenSpread = innerName === 'children';
            if (isReactiveSpread || isChildrenSpread) {
              findings.push({
                rule: 'no-array-spread-in-tag',
                message: 'Nao use spread de array em tags do Granular. Passe o array diretamente para preservar o contrato de renderizacao.',
                line: arg.loc?.start.line || 1,
                column: arg.loc?.start.column || 0,
              });
            }
          }

          if (arg.type !== 'CallExpression') continue;
          if (arg.callee.type !== 'MemberExpression' || arg.callee.computed) continue;
          if (arg.callee.property.type !== 'Identifier' || arg.callee.property.name !== 'map') continue;
          if (arg.callee.object.type !== 'Identifier') continue;
          if (!isProxyName(pathRef, arg.callee.object.name)) continue;

          const callback = arg.arguments[0];
          const returned = getCallbackReturnedNode(callback);
          if (!isRenderableExpression(returned)) continue;

          const binding = pathRef.scope?.getBinding(arg.callee.object.name);
          const key = bindingKey(binding);
          const kind = (key && proxyDecls.get(key)) || 'reactive';

          findings.push({
            rule: 'no-reactive-map-render',
            message: `Nao use .map() para renderizar colecao reativa (${kind}). Use list().`,
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

function runAudit(targets) {
  const files = collectTargets(targets);
  const findings = [];
  const ruleCounts = new Map();
  const fileCounts = new Map();
  let totalLines = 0;

  for (const filePath of files) {
    try {
      const source = fs.readFileSync(filePath, 'utf8');
      totalLines += source.split('\n').length;
    } catch {}
    const fileFindings = analyzeFile(filePath);
    if (fileFindings.length) fileCounts.set(filePath, fileFindings.length);
    for (const f of fileFindings) {
      findings.push({ ...f, filePath });
      ruleCounts.set(f.rule, (ruleCounts.get(f.rule) || 0) + 1);
    }
  }

  console.log('Granular Audit Report');
  console.log('=====================');
  console.log(`Files analyzed: ${files.length}`);
  console.log(`Total lines: ${totalLines}`);
  console.log(`Total findings: ${findings.length}`);
  console.log('');

  if (ruleCounts.size > 0) {
    console.log('Findings by rule:');
    const rules = [...ruleCounts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [rule, count] of rules) {
      console.log(`  ${rule.padEnd(35)} ${count}`);
    }
    console.log('');
  }

  if (fileCounts.size > 0) {
    console.log('Top offenders:');
    const offenders = [...fileCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    for (const [file, count] of offenders) {
      console.log(`  ${count.toString().padStart(4)}  ${file}`);
    }
    console.log('');
  }

  if (findings.length === 0) {
    console.log('Codebase clean. No anti-patterns detected.');
    return 0;
  }
  console.log('Run "granular lint <path>" to see detailed location of each finding.');
  return findings.length > 0 ? 1 : 0;
}

async function runCreate(args) {
  const modulePath = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../scripts/scaffold.mjs');
  if (!fs.existsSync(modulePath)) {
    console.error('Scaffold module not found.');
    return 1;
  }
  const { runScaffold } = await import(`file://${modulePath}`);
  return await runScaffold(args);
}

const [, , command, ...rest] = process.argv;

if (!command || command === '--help' || command === '-h') {
  printUsage();
  process.exit(command ? 0 : 1);
}

if (command === 'lint') {
  process.exit(runLint(rest));
}

if (command === 'audit') {
  process.exit(runAudit(rest));
}

if (command === 'create') {
  process.exit(await runCreate(rest));
}

if (command === 'docs') {
  const modulePath = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../scripts/serve-module-docs.mjs');
  const { runModuleDocsServer } = await import(`file://${modulePath}`);
  await runModuleDocsServer(rest);
  process.exit(0);
}

if (command === 'migrate') {
  const modulePath = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../scripts/migrate.mjs');
  const { runMigrate } = await import(`file://${modulePath}`);
  process.exit(await runMigrate(rest));
}

console.error(`Unknown command: ${command}`);
printUsage();
process.exit(1);
