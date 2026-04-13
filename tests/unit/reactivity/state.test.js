import test from 'node:test';
import assert from 'node:assert/strict';
import { state, after } from '../../../src/index.js';

// ─── Basic read/write contract ────────────────────────────────────────────

test('state.get returns the initial value', () => {
  const s = state({ name: 'Ana', age: 25 });
  assert.deepEqual(s.get(), { name: 'Ana', age: 25 });
});

test('state.set replaces the entire value', () => {
  const s = state({ a: 1 });
  s.set({ b: 2 });
  assert.deepEqual(s.get(), { b: 2 });
});

// ─── Deep path access ──────────────────────────────────────────────────

test('nested property access returns a path proxy with the correct value', () => {
  const s = state({ user: { name: 'Ana', address: { city: 'SP' } } });
  assert.equal(s.user.name.get(), 'Ana');
  assert.equal(s.user.address.city.get(), 'SP');
});

test('path proxy .set updates only that path', () => {
  const s = state({ a: 1, b: { c: 2, d: 3 } });
  s.b.c.set(99);
  assert.equal(s.b.c.get(), 99);
  assert.equal(s.b.d.get(), 3);
  assert.equal(s.a.get(), 1);
});

test('state.set with string path sets a nested value', () => {
  const s = state({ x: { y: 10 } });
  s.set('x.y', 20);
  assert.equal(s.x.y.get(), 20);
});

// ─── Setter proxy contract ──────────────────────────────────────────────

test('set() returns a setter proxy for property assignment', () => {
  const s = state({ name: 'Ana', age: 25 });
  s.set().name = 'Bia';
  assert.equal(s.name.get(), 'Bia');
  assert.equal(s.age.get(), 25);
});

test('setter proxy supports nested property assignment', () => {
  const s = state({ user: { name: 'Ana' } });
  s.set().user.name = 'Bia';
  assert.equal(s.user.name.get(), 'Bia');
});

test('setter proxy array mutators work (push, splice)', () => {
  const s = state({ items: ['a', 'b'] });
  s.set().items.push('c');
  assert.deepEqual(s.items.get(), ['a', 'b', 'c']);
});

// ─── Direct assignment throws ───────────────────────────────────────────

test('direct property assignment on state proxy throws', () => {
  const s = state({ x: 1 });
  assert.throws(() => { s.x = 2; }, /Direct mutation is not allowed/);
});

// ─── Path-scoped subscription ──────────────────────────────────────────

test('path subscription only fires when that specific path changes', () => {
  const s = state({ a: 1, b: 2 });
  const aChanges = [];
  const bChanges = [];
  after(s.a).change((next) => aChanges.push(next));
  after(s.b).change((next) => bChanges.push(next));

  s.a.set(10);
  assert.deepEqual(aChanges, [10]);
  assert.deepEqual(bChanges, []);

  s.b.set(20);
  assert.deepEqual(aChanges, [10]);
  assert.deepEqual(bChanges, [20]);
});

test('parent path subscription fires when child path changes', () => {
  const s = state({ user: { name: 'Ana', age: 25 } });
  const userChanges = [];
  after(s.user).change((next) => userChanges.push({ ...next }));
  s.user.name.set('Bia');
  assert.equal(userChanges.length, 1);
  assert.equal(userChanges[0].name, 'Bia');
});

// ─── Before guard contract ──────────────────────────────────────────────

test('before guard on state can cancel updates', () => {
  const s = state({ count: 0 });
  s.before(() => false);
  s.count.set(5);
  assert.equal(s.count.get(), 0);
});

// ─── Coercion ───────────────────────────────────────────────────────────

test('state path valueOf returns the current value', () => {
  const s = state({ n: 42 });
  assert.equal(+s.n, 42);
});

test('state path toString returns string representation', () => {
  const s = state({ name: 'Ana' });
  assert.equal(`${s.name}`, 'Ana');
});

// ─── State with arrays ─────────────────────────────────────────────────

test('state holding an array supports index access', () => {
  const s = state({ items: ['x', 'y', 'z'] });
  assert.equal(s.items.get().length, 3);
});

test('state set with immutable update replaces array', () => {
  const s = state({ items: [1, 2, 3] });
  s.items.set([4, 5]);
  assert.deepEqual(s.items.get(), [4, 5]);
});
