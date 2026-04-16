import test from 'node:test';
import assert from 'node:assert/strict';
import { Div, Span, signal, state, after, when } from '../../../src/index.js';
import { installDom } from '../../helpers/dom-env.js';

// ─── Branch rendering contract ─────────────────────────────────────────

test('when renders the true branch for a truthy signal', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const show = signal(true);
    const app = Div(when(show, () => Span('visible'), () => Span('hidden')));
    app.mountInto(root, null);
    assert.equal(root.textContent, 'visible');
    app.unmount();
  } finally { cleanup(); }
});

test('when renders the false branch for a falsy signal', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const show = signal(false);
    const app = Div(when(show, () => Span('visible'), () => Span('hidden')));
    app.mountInto(root, null);
    assert.equal(root.textContent, 'hidden');
    app.unmount();
  } finally { cleanup(); }
});

test('when swaps branches reactively when signal changes', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const show = signal(true);
    const app = Div(when(show, () => Span('ON'), () => Span('OFF')));
    app.mountInto(root, null);
    assert.equal(root.textContent, 'ON');

    show.set(false);
    assert.equal(root.textContent, 'OFF');

    show.set(true);
    assert.equal(root.textContent, 'ON');
    app.unmount();
  } finally { cleanup(); }
});

// ─── State source ───────────────────────────────────────────────────────

test('when works with a state path as source', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const s = state({ visible: true });
    const app = Div(when(s.visible, () => Span('yes'), () => Span('no')));
    app.mountInto(root, null);
    assert.equal(root.textContent, 'yes');

    s.visible.set(false);
    assert.equal(root.textContent, 'no');
    app.unmount();
  } finally { cleanup(); }
});

// ─── Function predicate with auto-tracking ─────────────────────────────

test('when with function predicate tracks dependencies automatically', async () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const age = signal(20);
    const role = signal('admin');

    const app = Div(when(
      () => age.get() >= 18 && role.get() === 'admin',
      () => Span('allowed'),
      () => Span('denied'),
    ));
    app.mountInto(root, null);
    assert.equal(root.textContent, 'allowed');

    age.set(15);
    assert.equal(root.textContent, 'denied');

    age.set(25);
    role.set('viewer');
    assert.equal(root.textContent, 'denied');

    role.set('admin');
    assert.equal(root.textContent, 'allowed');
    app.unmount();
  } finally { cleanup(); }
});

test('when with function predicate re-discovers deps on branch change', async () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const a = signal(true);
    const b = signal(true);

    const app = Div(when(
      () => a.get() && b.get(),
      () => Span('both'),
      () => Span('nope'),
    ));
    app.mountInto(root, null);
    assert.equal(root.textContent, 'both');

    a.set(false);
    assert.equal(root.textContent, 'nope');

    b.set(false);
    a.set(true);
    assert.equal(root.textContent, 'nope');

    b.set(true);
    assert.equal(root.textContent, 'both');
    app.unmount();
  } finally { cleanup(); }
});

// ─── No re-render when predicate stays same ────────────────────────────

test('when does NOT re-render the active branch when source changes but stays truthy', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const count = signal(1);
    let renders = 0;

    const app = Div(when(count,
      () => { renders++; return Span('truthy'); },
      () => Span('falsy'),
    ));
    app.mountInto(root, null);
    assert.equal(renders, 1);
    assert.equal(root.textContent, 'truthy');

    count.set(5);
    assert.equal(renders, 1);

    count.set(100);
    assert.equal(renders, 1);

    count.set(0);
    assert.equal(root.textContent, 'falsy');

    count.set(42);
    assert.equal(renders, 2);
    assert.equal(root.textContent, 'truthy');
    app.unmount();
  } finally { cleanup(); }
});

test('when does NOT re-render when source changes but stays falsy', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const val = signal(0);
    let falseRenders = 0;

    const app = Div(when(val,
      () => Span('on'),
      () => { falseRenders++; return Span('off'); },
    ));
    app.mountInto(root, null);
    assert.equal(falseRenders, 1);

    val.set(false);
    assert.equal(falseRenders, 1);

    val.set(null);
    assert.equal(falseRenders, 1);

    val.set('');
    assert.equal(falseRenders, 1);

    val.set(1);
    assert.equal(root.textContent, 'on');
    app.unmount();
  } finally { cleanup(); }
});

// ─── Static source ─────────────────────────────────────────────────────

test('when with static truthy value always renders the true branch', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const app = Div(when('yes', () => Span('always'), () => Span('never')));
    app.mountInto(root, null);
    assert.equal(root.textContent, 'always');
    app.unmount();
  } finally { cleanup(); }
});

test('when with static falsy value always renders the false branch', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const app = Div(when(0, () => Span('true'), () => Span('false')));
    app.mountInto(root, null);
    assert.equal(root.textContent, 'false');
    app.unmount();
  } finally { cleanup(); }
});

// ─── Without false branch ──────────────────────────────────────────────

test('when without renderFalse renders nothing for falsy source', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const show = signal(false);
    const app = Div(when(show, () => Span('content')));
    app.mountInto(root, null);
    assert.equal(root.textContent, '');

    show.set(true);
    assert.equal(root.textContent, 'content');

    show.set(false);
    assert.equal(root.textContent, '');
    app.unmount();
  } finally { cleanup(); }
});

// ─── Cleanup on branch swap ────────────────────────────────────────────

test('when removes old branch DOM nodes when swapping', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const show = signal(true);
    const app = Div(when(show,
      () => [Span('a'), Span('b'), Span('c')],
      () => Span('x'),
    ));
    app.mountInto(root, null);
    const initialChildCount = root.querySelectorAll('span').length;
    assert.equal(initialChildCount, 3);

    show.set(false);
    const afterSwap = root.querySelectorAll('span').length;
    assert.equal(afterSwap, 1);
    assert.equal(root.textContent, 'x');
    app.unmount();
  } finally { cleanup(); }
});

// ─── Validation ────────────────────────────────────────────────────────

test('when throws if renderTrue is not a function', () => {
  assert.throws(() => when(signal(true), 'not a function'), /renderTrue must be a function/);
});

test('when throws if renderFalse is provided but not a function', () => {
  assert.throws(() => when(signal(true), () => 'ok', 123), /renderFalse must be a function/);
});
