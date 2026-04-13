import test from 'node:test';
import assert from 'node:assert/strict';
import { signal, state, after } from '../../../src/index.js';

// ─── Derived value contract ─────────────────────────────────────────────

test('computed derives a value from a signal', () => {
  const count = signal(3);
  const doubled = after(count).compute((v) => v * 2);
  assert.equal(doubled.get(), 6);
});

test('computed updates when source signal changes', () => {
  const count = signal(1);
  const doubled = after(count).compute((v) => v * 2);
  count.set(5);
  assert.equal(doubled.get(), 10);
});

test('computed derives from a state path', () => {
  const s = state({ user: { age: 20 } });
  const isAdult = after(s.user.age).compute((age) => age >= 18);
  assert.equal(isAdult.get(), true);
  s.user.age.set(15);
  assert.equal(isAdult.get(), false);
});

// ─── Multi-source compute ──────────────────────────────────────────────

test('computed from multiple sources receives array of values', () => {
  const a = signal(2);
  const b = signal(3);
  const sum = after(a, b).compute(([va, vb]) => va + vb);
  assert.equal(sum.get(), 5);
  a.set(10);
  assert.equal(sum.get(), 13);
  b.set(7);
  assert.equal(sum.get(), 17);
});

// ─── Read-only contract ────────────────────────────────────────────────

test('computed is read-only, set throws', () => {
  const s = signal(1);
  const c = after(s).compute((v) => v + 1);
  assert.throws(() => c.set(10));
});

// ─── Change observer contract ──────────────────────────────────────────

test('after().change fires when source changes', () => {
  const s = signal('a');
  const log = [];
  after(s).change((next, prev) => log.push({ next, prev }));
  s.set('b');
  s.set('c');
  assert.deepEqual(log, [
    { next: 'b', prev: 'a' },
    { next: 'c', prev: 'b' },
  ]);
});

test('after().change unsubscribe stops notifications', () => {
  const s = signal(0);
  let calls = 0;
  const unsub = after(s).change(() => calls++);
  s.set(1);
  assert.equal(calls, 1);
  unsub();
  s.set(2);
  assert.equal(calls, 1);
});

test('after multiple targets fires with arrays', () => {
  const a = signal(1);
  const b = signal(2);
  const log = [];
  after(a, b).change((nexts) => log.push([...nexts]));
  a.set(10);
  assert.equal(log.length, 1);
  b.set(20);
  assert.equal(log.length, 2);
});

// ─── Computed disposal ─────────────────────────────────────────────────

test('computed dispose stops reacting to source changes', () => {
  const s = signal(1);
  const c = after(s).compute((v) => v * 10);
  assert.equal(c.get(), 10);
  c.dispose();
  s.set(2);
  assert.equal(c.get(), 10);
});
