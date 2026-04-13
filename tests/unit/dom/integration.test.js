import test from 'node:test';
import assert from 'node:assert/strict';
import { Div, Span, Input, signal, state, after, when, match, list, observableArray } from '../../../src/index.js';
import { installDom } from '../../helpers/dom-env.js';

// ─── Computed driving DOM ──────────────────────────────────────────────

test('computed value as child updates DOM when source changes', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const price = signal(100);
    const tax = signal(0.1);
    const total = after(price, tax).compute(([p, t]) => (p * (1 + t)).toFixed(2));

    const app = Div(Span(total));
    app.mountInto(root, null);
    assert.equal(root.querySelector('span').textContent, '110.00');

    price.set(200);
    assert.equal(root.querySelector('span').textContent, '220.00');

    tax.set(0.2);
    assert.equal(root.querySelector('span').textContent, '240.00');
    app.unmount();
  } finally { cleanup(); }
});

// ─── when + signal + state combined ────────────────────────────────────

test('when inside when (nested conditional) works correctly', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const loggedIn = signal(false);
    const isAdmin = signal(false);

    const app = Div(when(loggedIn,
      () => Div(when(isAdmin,
        () => Span('admin panel'),
        () => Span('user dashboard'),
      )),
      () => Span('please login'),
    ));
    app.mountInto(root, null);
    assert.equal(root.textContent, 'please login');

    loggedIn.set(true);
    assert.equal(root.textContent, 'user dashboard');

    isAdmin.set(true);
    assert.equal(root.textContent, 'admin panel');

    loggedIn.set(false);
    assert.equal(root.textContent, 'please login');

    isAdmin.set(false);
    loggedIn.set(true);
    assert.equal(root.textContent, 'user dashboard');
    app.unmount();
  } finally { cleanup(); }
});

// ─── match + list combined ────────────────────────────────────────────

test('match controlling list visibility', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const items = observableArray(['a', 'b']);
    const loading = signal(true);

    const app = Div(match(loading,
      (v) => v,
      () => Span('loading...'),
      () => Div(list(items, (item) => Span(item))),
    ));
    app.mountInto(root, null);
    assert.equal(root.textContent, 'loading...');

    loading.set(false);
    assert.equal(root.querySelectorAll('span').length, 2);

    items.push('c');
    assert.equal(root.querySelectorAll('span').length, 3);
    app.unmount();
  } finally { cleanup(); }
});

// ─── Multiple reactive children ────────────────────────────────────────

test('multiple signals as children all update independently', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const a = signal('A');
    const b = signal('B');
    const c = signal('C');

    const app = Div(Span(a), Span(b), Span(c));
    app.mountInto(root, null);
    const spans = root.querySelectorAll('span');
    assert.equal(spans[0].textContent, 'A');
    assert.equal(spans[1].textContent, 'B');
    assert.equal(spans[2].textContent, 'C');

    b.set('B2');
    assert.equal(spans[0].textContent, 'A');
    assert.equal(spans[1].textContent, 'B2');
    assert.equal(spans[2].textContent, 'C');
    app.unmount();
  } finally { cleanup(); }
});

// ─── State-driven UI: full form scenario ───────────────────────────────

test('state drives a complex UI tree with multiple bindings', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const formState = state({
      name: 'Ana',
      email: 'ana@test.com',
      valid: true,
    });

    const statusClass = after(formState.valid).compute((v) => v ? 'valid' : 'invalid');

    const app = Div({ className: statusClass },
      Span(formState.name),
      Span(formState.email),
    );
    app.mountInto(root, null);

    assert.equal(root.querySelector('div').className, 'valid');
    const spans = root.querySelectorAll('span');
    assert.equal(spans[0].textContent, 'Ana');
    assert.equal(spans[1].textContent, 'ana@test.com');

    formState.valid.set(false);
    assert.equal(root.querySelector('div').className, 'invalid');

    formState.name.set('Bia');
    assert.equal(spans[0].textContent, 'Bia');
    app.unmount();
  } finally { cleanup(); }
});

// ─── before guard preventing UI update ─────────────────────────────────

test('before guard on signal prevents DOM from updating', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const count = signal(0);
    count.before((prev, next) => {
      if (next < 0) return false;
    });

    const app = Div(Span(count));
    app.mountInto(root, null);
    assert.equal(root.querySelector('span').textContent, '0');

    count.set(5);
    assert.equal(root.querySelector('span').textContent, '5');

    count.set(-1);
    assert.equal(root.querySelector('span').textContent, '5');
    app.unmount();
  } finally { cleanup(); }
});

// ─── Rapid sequential updates ──────────────────────────────────────────

test('rapid sequential signal updates result in correct final DOM state', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const s = signal(0);
    const app = Div(Span(s));
    app.mountInto(root, null);

    for (let i = 1; i <= 100; i++) {
      s.set(i);
    }
    assert.equal(root.querySelector('span').textContent, '100');
    app.unmount();
  } finally { cleanup(); }
});

// ─── Conditional + reactive child swap ─────────────────────────────────

test('when branch swap preserves sibling elements', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const mode = signal(true);
    const app = Div(
      Span({ id: 'before' }, 'static-before'),
      when(mode, () => Span('mode-a'), () => Span('mode-b')),
      Span({ id: 'after' }, 'static-after'),
    );
    app.mountInto(root, null);

    assert.ok(root.querySelector('#before'));
    assert.ok(root.querySelector('#after'));
    assert.match(root.textContent, /mode-a/);

    mode.set(false);
    assert.ok(root.querySelector('#before'));
    assert.ok(root.querySelector('#after'));
    assert.match(root.textContent, /mode-b/);
    app.unmount();
  } finally { cleanup(); }
});
