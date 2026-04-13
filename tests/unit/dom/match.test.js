import test from 'node:test';
import assert from 'node:assert/strict';
import { Div, Span, signal, state, match } from '../../../src/index.js';
import { installDom } from '../../helpers/dom-env.js';

// ─── Basic predicate contract ──────────────────────────────────────────

test('match renders true branch when predicate returns truthy', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const s = signal('active');
    const app = Div(match(s, (v) => v === 'active', () => Span('ON'), () => Span('OFF')));
    app.mountInto(root, null);
    assert.equal(root.textContent, 'ON');
    app.unmount();
  } finally { cleanup(); }
});

test('match renders false branch when predicate returns falsy', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const s = signal('inactive');
    const app = Div(match(s, (v) => v === 'active', () => Span('ON'), () => Span('OFF')));
    app.mountInto(root, null);
    assert.equal(root.textContent, 'OFF');
    app.unmount();
  } finally { cleanup(); }
});

// ─── Key invariant: branch swap ONLY when predicate result changes ────

test('match does NOT re-render the active branch when source changes but predicate stays same', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const count = signal(5);
    let trueRenders = 0;

    const app = Div(match(count,
      (v) => v > 0,
      () => { trueRenders++; return Span('positive'); },
      () => Span('zero-or-less'),
    ));
    app.mountInto(root, null);
    assert.equal(trueRenders, 1);

    count.set(10);
    assert.equal(trueRenders, 1);

    count.set(100);
    assert.equal(trueRenders, 1);

    count.set(-1);
    assert.equal(root.textContent, 'zero-or-less');
    assert.equal(trueRenders, 1);

    count.set(1);
    assert.equal(root.textContent, 'positive');
    assert.equal(trueRenders, 2);
    app.unmount();
  } finally { cleanup(); }
});

// ─── Multiple sources ──────────────────────────────────────────────────

test('match with multiple sources passes all values to predicate', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const age = signal(20);
    const role = state('admin');

    const app = Div(match(
      [age, role],
      (a, r) => a >= 18 && r === 'admin',
      () => Span('granted'),
      () => Span('denied'),
    ));
    app.mountInto(root, null);
    assert.equal(root.textContent, 'granted');

    age.set(16);
    assert.equal(root.textContent, 'denied');

    age.set(25);
    assert.equal(root.textContent, 'granted');

    role.set('viewer');
    assert.equal(root.textContent, 'denied');
    app.unmount();
  } finally { cleanup(); }
});

// ─── Non-reactive sources ──────────────────────────────────────────────

test('match accepts non-reactive values in the sources list', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const level = signal(3);

    const app = Div(match(
      [level, 'premium'],
      (lvl, tier) => lvl >= 3 && tier === 'premium',
      () => Span('VIP'),
      () => Span('standard'),
    ));
    app.mountInto(root, null);
    assert.equal(root.textContent, 'VIP');

    level.set(1);
    assert.equal(root.textContent, 'standard');
    app.unmount();
  } finally { cleanup(); }
});

// ─── Single source shorthand ───────────────────────────────────────────

test('match with a single source (not array) works correctly', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const loading = signal(true);

    const app = Div(match(loading,
      (v) => v,
      () => Span('loading...'),
      () => Span('done'),
    ));
    app.mountInto(root, null);
    assert.equal(root.textContent, 'loading...');

    loading.set(false);
    assert.equal(root.textContent, 'done');
    app.unmount();
  } finally { cleanup(); }
});

// ─── Without false branch ──────────────────────────────────────────────

test('match without renderFalse renders nothing for falsy predicate', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const n = signal(0);
    const app = Div(match(n, (v) => v > 0, () => Span('positive')));
    app.mountInto(root, null);
    assert.equal(root.textContent, '');

    n.set(5);
    assert.equal(root.textContent, 'positive');

    n.set(-1);
    assert.equal(root.textContent, '');
    app.unmount();
  } finally { cleanup(); }
});

// ─── Cleanup on unmount ────────────────────────────────────────────────

test('match unmount removes all rendered content', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const s = signal(true);
    const app = Div(match(s, (v) => v, () => [Span('a'), Span('b')]));
    app.mountInto(root, null);
    assert.equal(root.querySelectorAll('span').length, 2);

    app.unmount();
    assert.equal(root.querySelectorAll('span').length, 0);
  } finally { cleanup(); }
});

// ─── Validation ────────────────────────────────────────────────────────

test('match throws if predicate is not a function', () => {
  assert.throws(() => match(signal(1), 'bad', () => 'ok'), /predicate must be a function/);
});

test('match throws if renderTrue is not a function', () => {
  assert.throws(() => match(signal(1), () => true, 'bad'), /renderTrue must be a function/);
});
