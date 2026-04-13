import test from 'node:test';
import assert from 'node:assert/strict';
import { observableArray } from '../../../src/index.js';

// ─── Basic array behavior ──────────────────────────────────────────────

test('observableArray initializes with the given items', () => {
  const arr = observableArray([1, 2, 3]);
  assert.deepEqual(arr.slice(), [1, 2, 3]);
  assert.equal(arr.length, 3);
});

test('observableArray defaults to empty array', () => {
  const arr = observableArray();
  assert.equal(arr.length, 0);
});

// ─── Push / insert patch ───────────────────────────────────────────────

test('push emits an insert patch at the end', () => {
  const arr = observableArray(['a']);
  const patches = [];
  arr.subscribe((patch) => patches.push(patch));

  arr.push('b', 'c');

  assert.deepEqual(arr.slice(), ['a', 'b', 'c']);
  assert.equal(patches.length, 1);
  assert.equal(patches[0].type, 'insert');
  assert.equal(patches[0].index, 1);
  assert.deepEqual(patches[0].items, ['b', 'c']);
});

// ─── Pop / remove patch ────────────────────────────────────────────────

test('pop emits a remove patch at the last index', () => {
  const arr = observableArray([1, 2, 3]);
  const patches = [];
  arr.subscribe((patch) => patches.push(patch));

  const removed = arr.pop();

  assert.equal(removed, 3);
  assert.deepEqual(arr.slice(), [1, 2]);
  assert.equal(patches[0].type, 'remove');
  assert.equal(patches[0].index, 2);
  assert.equal(patches[0].count, 1);
});

test('pop on empty array returns undefined and emits no patch', () => {
  const arr = observableArray([]);
  const patches = [];
  arr.subscribe((patch) => patches.push(patch));

  const result = arr.pop();

  assert.equal(result, undefined);
  assert.equal(patches.length, 0);
});

// ─── Unshift / shift ───────────────────────────────────────────────────

test('unshift inserts at the beginning', () => {
  const arr = observableArray([2, 3]);
  const patches = [];
  arr.subscribe((patch) => patches.push(patch));

  arr.unshift(0, 1);

  assert.deepEqual(arr.slice(), [0, 1, 2, 3]);
  assert.equal(patches[0].type, 'insert');
  assert.equal(patches[0].index, 0);
});

test('shift removes from the beginning', () => {
  const arr = observableArray(['x', 'y']);
  const patches = [];
  arr.subscribe((patch) => patches.push(patch));

  const removed = arr.shift();

  assert.equal(removed, 'x');
  assert.deepEqual(arr.slice(), ['y']);
  assert.equal(patches[0].type, 'remove');
  assert.equal(patches[0].index, 0);
});

// ─── Splice ────────────────────────────────────────────────────────────

test('splice removes and inserts items with correct patches', () => {
  const arr = observableArray([1, 2, 3, 4, 5]);
  const patches = [];
  arr.subscribe((patch) => patches.push(patch));

  const removed = arr.splice(1, 2, 10, 20, 30);

  assert.deepEqual(removed, [2, 3]);
  assert.deepEqual(arr.slice(), [1, 10, 20, 30, 4, 5]);

  const removePatch = patches.find((p) => p.type === 'remove');
  const insertPatch = patches.find((p) => p.type === 'insert');
  assert.ok(removePatch);
  assert.ok(insertPatch);
  assert.equal(removePatch.index, 1);
  assert.equal(removePatch.count, 2);
});

// ─── Index assignment / set patch ──────────────────────────────────────

test('index assignment within bounds emits a set patch', () => {
  const arr = observableArray(['a', 'b', 'c']);
  const patches = [];
  arr.subscribe((patch) => patches.push(patch));

  arr[1] = 'B';

  assert.equal(arr[1], 'B');
  assert.equal(patches[0].type, 'set');
  assert.equal(patches[0].index, 1);
  assert.equal(patches[0].value, 'B');
  assert.equal(patches[0].prev, 'b');
});

test('index assignment at length boundary emits insert patch', () => {
  const arr = observableArray(['a']);
  const patches = [];
  arr.subscribe((patch) => patches.push(patch));

  arr[1] = 'b';

  assert.deepEqual(arr.slice(), ['a', 'b']);
  assert.equal(patches[0].type, 'insert');
});

// ─── Reset ─────────────────────────────────────────────────────────────

test('reset replaces all items and emits reset patch', () => {
  const arr = observableArray([1, 2, 3]);
  const patches = [];
  arr.subscribe((patch) => patches.push(patch));

  arr.reset([10, 20]);

  assert.deepEqual(arr.slice(), [10, 20]);
  assert.equal(patches[0].type, 'reset');
  assert.deepEqual(patches[0].prevItems, [1, 2, 3]);
  assert.deepEqual(patches[0].items, [10, 20]);
});

// ─── Sort / reverse emit reset ─────────────────────────────────────────

test('sort emits a reset patch', () => {
  const arr = observableArray([3, 1, 2]);
  const patches = [];
  arr.subscribe((patch) => patches.push(patch));

  arr.sort((a, b) => a - b);

  assert.deepEqual(arr.slice(), [1, 2, 3]);
  assert.equal(patches[0].type, 'reset');
});

test('reverse emits a reset patch', () => {
  const arr = observableArray([1, 2, 3]);
  const patches = [];
  arr.subscribe((patch) => patches.push(patch));

  arr.reverse();

  assert.deepEqual(arr.slice(), [3, 2, 1]);
  assert.equal(patches[0].type, 'reset');
});

// ─── Before guard cancels mutation ─────────────────────────────────────

test('before().insert returning false cancels push', () => {
  const arr = observableArray([1]);
  arr.before().insert(() => false);

  arr.push(2);

  assert.deepEqual(arr.slice(), [1]);
});

test('before().remove returning false cancels pop', () => {
  const arr = observableArray([1, 2]);
  arr.before().remove(() => false);

  arr.pop();

  assert.deepEqual(arr.slice(), [1, 2]);
});

test('before().set returning false cancels index assignment', () => {
  const arr = observableArray(['a', 'b']);
  arr.before().set(() => false);

  arr[0] = 'X';

  assert.equal(arr[0], 'a');
});

test('before().reset returning false cancels sort', () => {
  const arr = observableArray([3, 1, 2]);
  arr.before().reset(() => false);

  arr.sort((a, b) => a - b);

  assert.deepEqual(arr.slice(), [3, 1, 2]);
});

// ─── Length truncation ─────────────────────────────────────────────────

test('setting length to smaller value removes trailing items', () => {
  const arr = observableArray([1, 2, 3, 4, 5]);
  const patches = [];
  arr.subscribe((patch) => patches.push(patch));

  arr.length = 2;

  assert.deepEqual(arr.slice(), [1, 2]);
  assert.equal(patches[0].type, 'remove');
  assert.equal(patches[0].index, 2);
  assert.equal(patches[0].count, 3);
});

// ─── Unsubscribe ───────────────────────────────────────────────────────

test('unsubscribe stops receiving patches', () => {
  const arr = observableArray([1]);
  let calls = 0;
  const unsub = arr.subscribe(() => calls++);

  arr.push(2);
  assert.equal(calls, 1);

  unsub();
  arr.push(3);
  assert.equal(calls, 1);
});

// ─── Read-only methods pass through ────────────────────────────────────

test('standard array methods (filter, map, find, includes) work normally', () => {
  const arr = observableArray([1, 2, 3, 4, 5]);

  assert.deepEqual(arr.filter((x) => x > 3), [4, 5]);
  assert.deepEqual(arr.map((x) => x * 2), [2, 4, 6, 8, 10]);
  assert.equal(arr.find((x) => x === 3), 3);
  assert.equal(arr.includes(4), true);
  assert.equal(arr.indexOf(2), 1);
});
