import test from 'node:test';
import assert from 'node:assert/strict';
import { Div, Span, signal, state, after, when } from '../../../src/index.js';
import { installDom } from '../../helpers/dom-env.js';

// ─── Mount / Unmount basic contract ────────────────────────────────────

test('mountInto appends element to the given container', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const app = Div({ id: 'app' }, 'hello');
    app.mountInto(root, null);
    const el = root.querySelector('#app');
    assert.ok(el);
    assert.equal(el.textContent, 'hello');
    app.unmount();
  } finally { cleanup(); }
});

test('unmount removes element from DOM', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const app = Div({ id: 'app' });
    app.mountInto(root, null);
    assert.ok(root.querySelector('#app'));
    app.unmount();
    assert.equal(root.querySelector('#app'), null);
    assert.equal(root.childNodes.length, 0);
  } finally { cleanup(); }
});

test('double mountInto is idempotent', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const app = Div({ id: 'test' });
    app.mountInto(root, null);
    app.mountInto(root, null);
    assert.equal(root.querySelectorAll('#test').length, 1);
    app.unmount();
  } finally { cleanup(); }
});

// ─── Reactive subscription cleanup on unmount ──────────────────────────

test('unmount stops reactive subscriptions (signal as child)', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const name = signal('Ana');
    const app = Div(Span(name));
    app.mountInto(root, null);
    assert.equal(root.textContent, 'Ana');

    app.unmount();
    name.set('Bia');
    assert.equal(root.textContent, '');
  } finally { cleanup(); }
});

test('unmount stops reactive subscriptions (state as prop)', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const cls = state('active');
    const app = Div({ className: cls });
    app.mountInto(root, null);
    const el = root.querySelector('div');
    assert.equal(el.className, 'active');

    app.unmount();

    cls.set('inactive');
  } finally { cleanup(); }
});

test('unmount stops computed subscriptions', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const count = signal(2);
    const doubled = after(count).compute((v) => v * 2);
    const app = Div(Span(doubled));
    app.mountInto(root, null);
    assert.equal(root.textContent, '4');

    app.unmount();
    count.set(10);
    assert.equal(root.textContent, '');
  } finally { cleanup(); }
});

// ─── Nested unmount cleans children ────────────────────────────────────

test('unmount of parent cleans nested children recursively', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const a = signal('a');
    const b = signal('b');
    const app = Div(
      Div(Span(a)),
      Div(Span(b)),
    );
    app.mountInto(root, null);
    assert.equal(root.querySelectorAll('span').length, 2);

    app.unmount();
    assert.equal(root.querySelectorAll('span').length, 0);

    a.set('changed-a');
    b.set('changed-b');
  } finally { cleanup(); }
});

// ─── Reactive children update DOM ──────────────────────────────────────

test('signal as text child updates DOM text reactively', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const text = signal('hello');
    const app = Div(text);
    app.mountInto(root, null);

    assert.match(root.textContent, /hello/);

    text.set('world');
    assert.match(root.textContent, /world/);
    app.unmount();
  } finally { cleanup(); }
});

test('state path as text child updates DOM reactively', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const s = state({ label: 'initial' });
    const app = Div(s.label);
    app.mountInto(root, null);
    assert.match(root.textContent, /initial/);

    s.label.set('updated');
    assert.match(root.textContent, /updated/);
    app.unmount();
  } finally { cleanup(); }
});

// ─── Reactive props ────────────────────────────────────────────────────

test('signal as className prop updates the attribute reactively', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const cls = signal('a');
    const app = Div({ className: cls });
    app.mountInto(root, null);
    assert.equal(root.querySelector('div').className, 'a');

    cls.set('b');
    assert.equal(root.querySelector('div').className, 'b');
    app.unmount();
  } finally { cleanup(); }
});

// ─── Event handlers ────────────────────────────────────────────────────

test('event handler is attached and fires on DOM event', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    let clicked = false;
    const app = Div({ onClick: () => { clicked = true; } }, 'click me');
    app.mountInto(root, null);
    root.querySelector('div').click();
    assert.equal(clicked, true);
    app.unmount();
  } finally { cleanup(); }
});

test('event handler is removed on unmount', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    let count = 0;
    const app = Div({ onClick: () => { count++; } });
    app.mountInto(root, null);
    const el = root.querySelector('div');
    el.click();
    assert.equal(count, 1);

    app.unmount();
    el.click();
    assert.equal(count, 1);
  } finally { cleanup(); }
});

// ─── when cleanup on parent unmount ────────────────────────────────────

test('when node inside a tree is cleaned up on parent unmount', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const show = signal(true);
    const app = Div(when(show, () => Span('visible')));
    app.mountInto(root, null);
    assert.equal(root.textContent, 'visible');

    app.unmount();
    assert.equal(root.textContent, '');

    show.set(false);
    show.set(true);
    assert.equal(root.textContent, '');
  } finally { cleanup(); }
});
