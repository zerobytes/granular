import test from 'node:test';
import assert from 'node:assert/strict';
import { Div, Span, list, observableArray } from '../../../src/index.js';
import { installDom } from '../../helpers/dom-env.js';

test('keyed list reuses DOM nodes for matching keys after reset', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const items = observableArray([
      { id: 1, label: 'A' },
      { id: 2, label: 'B' },
      { id: 3, label: 'C' },
    ]);
    const app = Div(list(items, (item) => Span(item.label), { key: (it) => it.id }));
    app.mountInto(root, null);

    const before = Array.from(root.querySelectorAll('span'));
    assert.equal(before.length, 3);

    items.reset([
      { id: 3, label: 'C' },
      { id: 1, label: 'A' },
      { id: 2, label: 'B' },
    ]);

    const after = Array.from(root.querySelectorAll('span'));
    assert.equal(after.length, 3);
    assert.equal(after[0].textContent, 'C');
    assert.equal(after[1].textContent, 'A');
    assert.equal(after[2].textContent, 'B');

    assert.ok(after.includes(before[0]), 'A should be reused');
    assert.ok(after.includes(before[1]), 'B should be reused');
    assert.ok(after.includes(before[2]), 'C should be reused');

    app.unmount();
  } finally { cleanup(); }
});

test('keyed list adds new keys and removes missing keys', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const items = observableArray([
      { id: 1, label: 'A' },
      { id: 2, label: 'B' },
    ]);
    const app = Div(list(items, (item) => Span(item.label), { key: (it) => it.id }));
    app.mountInto(root, null);

    const before = Array.from(root.querySelectorAll('span'));

    items.reset([
      { id: 1, label: 'A' },
      { id: 9, label: 'NEW' },
    ]);

    const after = Array.from(root.querySelectorAll('span'));
    assert.equal(after.length, 2);
    assert.equal(after[0].textContent, 'A');
    assert.equal(after[1].textContent, 'NEW');
    assert.ok(after.includes(before[0]), 'A should be reused');
    assert.ok(!after.includes(before[1]), 'B should be removed');

    app.unmount();
  } finally { cleanup(); }
});

test('keyed list updates existing item state when label changes', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const items = observableArray([
      { id: 1, label: 'A' },
      { id: 2, label: 'B' },
    ]);
    const app = Div(list(items, (item) => Span(item.label), { key: (it) => it.id }));
    app.mountInto(root, null);

    items.reset([
      { id: 1, label: 'A2' },
      { id: 2, label: 'B2' },
    ]);

    const spans = root.querySelectorAll('span');
    assert.equal(spans.length, 2);
    assert.equal(spans[0].textContent, 'A2');
    assert.equal(spans[1].textContent, 'B2');

    app.unmount();
  } finally { cleanup(); }
});

test('keyed list handles complete reverse with minimal moves', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const initial = [];
    for (let i = 0; i < 5; i++) initial.push({ id: i, label: `L${i}` });
    const items = observableArray(initial);

    const app = Div(list(items, (item) => Span(item.label), { key: (it) => it.id }));
    app.mountInto(root, null);

    const before = Array.from(root.querySelectorAll('span'));
    items.reset(initial.slice().reverse());

    const after = Array.from(root.querySelectorAll('span'));
    assert.equal(after.length, 5);
    for (let i = 0; i < 5; i++) {
      assert.equal(after[i].textContent, `L${4 - i}`);
    }
    for (const node of before) {
      assert.ok(after.includes(node), 'all original DOM nodes reused on reverse');
    }

    app.unmount();
  } finally { cleanup(); }
});
