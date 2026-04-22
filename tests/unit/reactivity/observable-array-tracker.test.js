import test from 'node:test';
import assert from 'node:assert/strict';
import {
  observableArray,
  derive,
  when,
  not,
  equals,
  and,
  signal,
} from '../../../src/index.js';

test('derive: tracks observableArray.length on push', () => {
  const items = observableArray([1, 2, 3]);
  const len = derive(() => items.length);
  assert.equal(len.get(), 3);
  items.push(4);
  assert.equal(len.get(), 4);
  items.push(5, 6);
  assert.equal(len.get(), 6);
});

test('derive: tracks observableArray on splice/pop/shift', () => {
  const items = observableArray(['a', 'b', 'c', 'd']);
  const len = derive(() => items.length);
  assert.equal(len.get(), 4);
  items.pop();
  assert.equal(len.get(), 3);
  items.shift();
  assert.equal(len.get(), 2);
  items.splice(0, 1);
  assert.equal(len.get(), 1);
});

test('derive: tracks observableArray on reset', () => {
  const items = observableArray([1, 2, 3]);
  const len = derive(() => items.length);
  items.reset([10, 20, 30, 40, 50]);
  assert.equal(len.get(), 5);
  items.reset([]);
  assert.equal(len.get(), 0);
});

test('derive: tracks index assignment on observableArray', () => {
  const items = observableArray(['a', 'b', 'c']);
  const first = derive(() => items[0]);
  assert.equal(first.get(), 'a');
  items[0] = 'A';
  assert.equal(first.get(), 'A');
});

test('derive: filter().length on observableArray (TodoList "remaining" pattern)', () => {
  const todos = observableArray([
    { id: 1, done: false },
    { id: 2, done: true },
    { id: 3, done: false },
  ]);
  const remaining = derive(() => todos.filter((t) => !t.done).length);
  assert.equal(remaining.get(), 2);
  todos.push({ id: 4, done: false });
  assert.equal(remaining.get(), 3);
  todos.reset(todos.map((t) => (t.id === 1 ? { ...t, done: true } : t)));
  assert.equal(remaining.get(), 2);
});

test('derive: combining observableArray with signal in same expression', () => {
  const items = observableArray([10, 20, 30]);
  const factor = signal(2);
  const totalScaled = derive(() => items.reduce((s, n) => s + n, 0) * factor.get());
  assert.equal(totalScaled.get(), 120);
  items.push(40);
  assert.equal(totalScaled.get(), 200);
  factor.set(3);
  assert.equal(totalScaled.get(), 300);
});

test('equals: works with derive(() => items.length) and a plain number', () => {
  const items = observableArray([]);
  const isEmpty = equals(derive(() => items.length), 0);
  assert.equal(isEmpty.get(), true);
  items.push('x');
  assert.equal(isEmpty.get(), false);
  items.reset([]);
  assert.equal(isEmpty.get(), true);
});

test('not: inverts a derive over observableArray', () => {
  const items = observableArray([]);
  const hasItems = derive(() => items.length > 0);
  const empty = not(hasItems);
  assert.equal(empty.get(), true);
  items.push(1);
  assert.equal(empty.get(), false);
});

test('and: combines observableArray-derived booleans', () => {
  const items = observableArray([1, 2]);
  const enabled = signal(true);
  const ready = and(derive(() => items.length > 0), enabled);
  assert.equal(ready.get(), true);
  enabled.set(false);
  assert.equal(ready.get(), false);
  enabled.set(true);
  items.reset([]);
  assert.equal(ready.get(), false);
});

test('observableArray: existing APIs (subscribe, reset, push, pop, splice, indexing, length, filter) still work identically', () => {
  const arr = observableArray([1, 2, 3]);
  const events = [];
  const unsub = arr.subscribe((patch) => events.push(patch.type));

  arr.push(4);
  arr.pop();
  arr.splice(0, 1);
  arr.reset([10, 20]);
  arr[0] = 99;

  assert.deepEqual(events, ['insert', 'remove', 'remove', 'reset', 'set']);
  assert.equal(arr.length, 2);
  assert.equal(arr[0], 99);
  assert.equal(arr[1], 20);
  assert.deepEqual(arr.filter((v) => v > 30), [99]);

  unsub();
  arr.push(0);
  assert.equal(events.length, 5, 'unsub stops further notifications');
});
