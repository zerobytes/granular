import test from 'node:test';
import assert from 'node:assert/strict';
import { signal } from '../../../src/index.js';

// ─── Basic read/write contract ────────────────────────────────────────────

test('signal.get returns the initial value', () => {
  const s = signal(42);
  assert.equal(s.get(), 42);
});

test('signal.set updates the value returned by get', () => {
  const s = signal('hello');
  s.set('world');
  assert.equal(s.get(), 'world');
});

test('signal.set with the same value is a no-op (no notification)', () => {
  const s = signal(10);
  let calls = 0;
  s.subscribe(() => calls++);
  s.set(10);
  assert.equal(calls, 0);
});

test('signal.set with force=true notifies even if value is the same', () => {
  const s = signal(10);
  let calls = 0;
  s.subscribe(() => calls++);
  s.set(10, true);
  assert.equal(calls, 1);
});

test('signal.set returns true on successful update', () => {
  const s = signal(1);
  assert.equal(s.set(2), true);
});

// ─── Subscribe contract ──────────────────────────────────────────────────

test('subscribe receives (next, prev) on each change', () => {
  const s = signal('a');
  const received = [];
  s.subscribe((next, prev) => received.push({ next, prev }));
  s.set('b');
  s.set('c');
  assert.deepEqual(received, [
    { next: 'b', prev: 'a' },
    { next: 'c', prev: 'b' },
  ]);
});

test('unsubscribe stops receiving notifications', () => {
  const s = signal(0);
  let calls = 0;
  const unsub = s.subscribe(() => calls++);
  s.set(1);
  assert.equal(calls, 1);
  unsub();
  s.set(2);
  assert.equal(calls, 1);
});

test('multiple subscribers all receive notifications independently', () => {
  const s = signal(0);
  const log1 = [];
  const log2 = [];
  const unsub1 = s.subscribe((v) => log1.push(v));
  s.subscribe((v) => log2.push(v));
  s.set(1);
  unsub1();
  s.set(2);
  assert.deepEqual(log1, [1]);
  assert.deepEqual(log2, [1, 2]);
});

// ─── Before guard contract ──────────────────────────────────────────────

test('before guard returning false cancels the update', () => {
  const s = signal(10);
  s.before(() => false);
  const result = s.set(20);
  assert.equal(result, false);
  assert.equal(s.get(), 10);
});

test('before guard returning undefined allows the update', () => {
  const s = signal(10);
  s.before(() => {});
  s.set(20);
  assert.equal(s.get(), 20);
});

test('before guard receives (prev, next)', () => {
  const s = signal('x');
  const received = [];
  s.before((prev, next) => { received.push({ prev, next }); });
  s.set('y');
  assert.deepEqual(received, [{ prev: 'x', next: 'y' }]);
});

test('canceled update does not notify subscribers', () => {
  const s = signal(1);
  s.before(() => false);
  let called = false;
  s.subscribe(() => { called = true; });
  s.set(2);
  assert.equal(called, false);
});

test('before guard unsubscribe removes the guard', () => {
  const s = signal(1);
  const unsub = s.before(() => false);
  assert.equal(s.set(2), false);
  assert.equal(s.get(), 1);
  unsub();
  assert.equal(s.set(2), true);
  assert.equal(s.get(), 2);
});

// ─── Patch contract ─────────────────────────────────────────────────────

test('patch merges object keys shallowly', () => {
  const s = signal({ name: 'Ana', age: 25 });
  s.patch({ age: 26 });
  assert.deepEqual(s.get(), { name: 'Ana', age: 26 });
});

test('patch merges nested objects recursively', () => {
  const s = signal({ user: { name: 'Ana', prefs: { theme: 'dark' } } });
  s.patch({ user: { prefs: { theme: 'light' } } });
  const result = s.get();
  assert.equal(result.user.name, 'Ana');
  assert.equal(result.user.prefs.theme, 'light');
});

test('patch returns false when no keys actually changed', () => {
  const s = signal({ a: 1 });
  const result = s.patch({ a: 1 });
  assert.equal(result, false);
});

test('patch with non-object value behaves as full replace', () => {
  const s = signal({ a: 1 });
  s.patch(42);
  assert.equal(s.get(), 42);
});

test('patch notifies subscribers with (next, prev)', () => {
  const s = signal({ x: 1, y: 2 });
  const received = [];
  s.subscribe((next, prev) => received.push({ next: { ...next }, prev: { ...prev } }));
  s.patch({ y: 3 });
  assert.equal(received.length, 1);
  assert.deepEqual(received[0].prev, { x: 1, y: 2 });
  assert.deepEqual(received[0].next, { x: 1, y: 3 });
});

// ─── Coercion / ergonomics ──────────────────────────────────────────────

test('signal supports valueOf coercion for arithmetic', () => {
  const s = signal(5);
  assert.equal(+s, 5);
});

test('signal supports toString coercion', () => {
  const s = signal(42);
  assert.equal(`${s}`, '42');
});
