import test from 'node:test';
import assert from 'node:assert/strict';
import { Div, Span, signal, state, list, observableArray } from '../../../src/index.js';
import { installDom } from '../../helpers/dom-env.js';

// ─── Initial rendering ────────────────────────────────────────────────

test('list renders initial items from observableArray', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const items = observableArray(['A', 'B', 'C']);
    const app = Div(list(items, (item) => Span(item)));
    app.mountInto(root, null);

    const spans = root.querySelectorAll('span');
    assert.equal(spans.length, 3);
    assert.equal(spans[0].textContent, 'A');
    assert.equal(spans[1].textContent, 'B');
    assert.equal(spans[2].textContent, 'C');
    app.unmount();
  } finally { cleanup(); }
});

test('list renders initial items from signal array', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const items = signal(['X', 'Y']);
    const app = Div(list(items, (item) => Span(item)));
    app.mountInto(root, null);

    const spans = root.querySelectorAll('span');
    assert.equal(spans.length, 2);
    app.unmount();
  } finally { cleanup(); }
});

// ─── Reactive updates: push/pop ────────────────────────────────────────

test('list adds DOM nodes when items are pushed', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const items = observableArray(['a']);
    const app = Div(list(items, (item) => Span(item)));
    app.mountInto(root, null);
    assert.equal(root.querySelectorAll('span').length, 1);

    items.push('b', 'c');
    assert.equal(root.querySelectorAll('span').length, 3);
    app.unmount();
  } finally { cleanup(); }
});

test('list removes DOM nodes when items are popped', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const items = observableArray(['a', 'b', 'c']);
    const app = Div(list(items, (item) => Span(item)));
    app.mountInto(root, null);
    assert.equal(root.querySelectorAll('span').length, 3);

    items.pop();
    assert.equal(root.querySelectorAll('span').length, 2);

    items.shift();
    assert.equal(root.querySelectorAll('span').length, 1);
    app.unmount();
  } finally { cleanup(); }
});

// ─── Splice ────────────────────────────────────────────────────────────

test('list handles splice (remove + insert) correctly', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const items = observableArray(['a', 'b', 'c', 'd']);
    const app = Div(list(items, (item) => Span(item)));
    app.mountInto(root, null);

    items.splice(1, 2, 'X', 'Y', 'Z');

    const spans = root.querySelectorAll('span');
    assert.equal(spans.length, 5);
    app.unmount();
  } finally { cleanup(); }
});

// ─── Reset ─────────────────────────────────────────────────────────────

test('list handles reset by replacing all DOM nodes', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const items = observableArray([1, 2, 3]);
    const app = Div(list(items, (item) => Span(item)));
    app.mountInto(root, null);
    assert.equal(root.querySelectorAll('span').length, 3);

    items.reset([10, 20]);
    assert.equal(root.querySelectorAll('span').length, 2);
    app.unmount();
  } finally { cleanup(); }
});

// ─── Empty list ────────────────────────────────────────────────────────

test('list with empty array renders no items', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const items = observableArray([]);
    const app = Div(list(items, (item) => Span(item)));
    app.mountInto(root, null);
    assert.equal(root.querySelectorAll('span').length, 0);

    items.push('first');
    assert.equal(root.querySelectorAll('span').length, 1);
    app.unmount();
  } finally { cleanup(); }
});

// ─── Cleanup on unmount ────────────────────────────────────────────────

test('list unmount removes all list DOM nodes', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const items = observableArray(['a', 'b']);
    const app = Div(list(items, (item) => Span(item)));
    app.mountInto(root, null);
    assert.equal(root.querySelectorAll('span').length, 2);

    app.unmount();
    assert.equal(root.querySelectorAll('span').length, 0);
  } finally { cleanup(); }
});

// ─── renderItem receives reactive wrappers ─────────────────────────────

test('renderItem receives state-wrapped item that reacts to changes', () => {
  const cleanup = installDom();
  try {
    const root = document.createElement('div');
    const items = observableArray([{ name: 'Ana' }, { name: 'Bia' }]);
    const app = Div(list(items, (item) => Span(item.name)));
    app.mountInto(root, null);

    const spans = root.querySelectorAll('span');
    assert.equal(spans[0].textContent, 'Ana');
    assert.equal(spans[1].textContent, 'Bia');
    app.unmount();
  } finally { cleanup(); }
});
