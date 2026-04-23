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

// ─── Data property name collisions with API methods ────────────────────

test('data property named "subscribe" is accessible as path, not the API method', () => {
  const s = state({ event: { name: 'Conf', subscribe: 'https://example.com/register' } });
  assert.equal(s.event.subscribe.get(), 'https://example.com/register');
});

test('data property named "get" is accessible as path, not the API method', () => {
  const s = state({ request: { get: '/api/users', post: '/api/users' } });
  assert.equal(s.request.get.get(), '/api/users');
  assert.equal(s.request.post.get(), '/api/users');
});

test('data property named "set" is accessible as path', () => {
  const s = state({ config: { set: 'value' } });
  assert.equal(s.config.set.get(), 'value');
});

test('data property named "before" is accessible as path', () => {
  const s = state({ step: { before: 'intro', after: 'summary' } });
  assert.equal(s.step.before.get(), 'intro');
});

test('data property named "patch" is accessible as path', () => {
  const s = state({ release: { patch: 3, minor: 2, major: 1 } });
  assert.equal(s.release.patch.get(), 3);
});

test('data property named "mutate" is accessible as path', () => {
  const s = state({ dna: { mutate: true, sequence: 'ATCG' } });
  assert.equal(s.dna.mutate.get(), true);
});

test('API methods still work when data does NOT have colliding keys', () => {
  const s = state({ name: 'Ana', age: 25 });
  assert.equal(s.get().name, 'Ana');
  s.set({ name: 'Bia', age: 30 });
  assert.equal(s.get().name, 'Bia');
  let notified = false;
  const unsub = s.subscribe(() => { notified = true; });
  s.set({ name: 'Cia', age: 35 });
  assert.equal(notified, true);
  unsub();
});

test('colliding property is reactive as a text child', () => {
  const s = state({ event: { subscribe: 'free' } });
  const changes = [];
  after(s.event.subscribe).change((v) => changes.push(v));
  s.event.subscribe.set('paid');
  assert.equal(s.event.subscribe.get(), 'paid');
  assert.deepEqual(changes, ['paid']);
});

// ─── effect (run + change) ──────────────────────────────────────────────

test('after(target).effect(fn) runs once with the current value and on subsequent changes', () => {
  const s = state({ mode: 'dark' });
  const calls = [];
  const unsub = after(s.mode).effect((next, prev) => calls.push([next, prev]));

  assert.deepEqual(calls, [['dark', undefined]]);

  s.mode.set('light');
  assert.deepEqual(calls, [['dark', undefined], ['light', 'dark']]);

  unsub();
  s.mode.set('dark');
  assert.deepEqual(calls, [['dark', undefined], ['light', 'dark']]);
});

test('after(a, b).effect(fn) runs once with both values and on subsequent changes', () => {
  const a = state(1);
  const b = state(2);
  const calls = [];
  after(a, b).effect(([na, nb]) => calls.push([na, nb]));

  assert.deepEqual(calls, [[1, 2]]);

  a.set(10);
  assert.deepEqual(calls, [[1, 2], [10, 2]]);

  b.set(20);
  assert.deepEqual(calls, [[1, 2], [10, 2], [10, 20]]);
});
