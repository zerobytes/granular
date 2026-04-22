import test from 'node:test';
import assert from 'node:assert/strict';
import { signal, state, enableDevMode, clearDevWarnings } from '../../../src/index.js';

function captureWarnings(fn) {
  const warnings = [];
  const original = console.warn;
  console.warn = (...args) => {
    warnings.push(args.map((a) => (typeof a === 'string' ? a : String(a))).join(' '));
  };
  try {
    return { warnings, result: fn() };
  } finally {
    console.warn = original;
  }
}

test('enableDevMode warns on signal string coercion via template literal', () => {
  const { disable } = enableDevMode({ warnOnce: false });
  clearDevWarnings();
  try {
    const s = signal(42);
    const { warnings } = captureWarnings(() => `${s}`);
    assert.ok(warnings.some((w) => w.includes('coerce') || w.toLowerCase().includes('coercion')),
      `expected coercion warning, got: ${warnings.join('|')}`);
  } finally {
    disable();
  }
});

test('enableDevMode warns on state numeric coercion', () => {
  const { disable } = enableDevMode({ warnOnce: false });
  clearDevWarnings();
  try {
    const s = state({ n: 7 });
    const { warnings } = captureWarnings(() => +s.n);
    assert.ok(warnings.some((w) => w.toLowerCase().includes('coercion') || w.includes('coerce')),
      `expected coercion warning, got: ${warnings.join('|')}`);
  } finally {
    disable();
  }
});

test('warnOnce dedupes the same warning key', () => {
  const { disable } = enableDevMode({ warnOnce: true });
  clearDevWarnings();
  try {
    const s = signal('x');
    const { warnings } = captureWarnings(() => {
      `${s}`;
      `${s}`;
      `${s}`;
    });
    assert.equal(warnings.length, 1, 'identical warnings should fire once');
  } finally {
    disable();
  }
});

test('disabling dev mode stops emitting warnings', () => {
  const handle = enableDevMode({ warnOnce: false });
  clearDevWarnings();
  handle.disable();
  const s = signal(1);
  const { warnings } = captureWarnings(() => `${s}`);
  assert.equal(warnings.length, 0, 'no warnings after disable');
});
