import test from 'node:test';
import assert from 'node:assert/strict';
import {
  state,
  signal,
  eq, neq, gt, gte, lt, lte,
  equals, differs, like, unlike, bigger, smaller, atLeast, atMost,
  not, and, or, derive,
} from '../../../src/index.js';

test('eq returns reactive boolean for state', () => {
  const s = state('a');
  const isA = eq(s, 'a');
  assert.equal(isA.get(), true);
  s.set('b');
  assert.equal(isA.get(), false);
  s.set('a');
  assert.equal(isA.get(), true);
});

test('eq works with signals', () => {
  const s = signal(5);
  const isFive = eq(s, 5);
  assert.equal(isFive.get(), true);
  s.set(6);
  assert.equal(isFive.get(), false);
});

test('neq inverts eq', () => {
  const s = state('x');
  const notY = neq(s, 'y');
  assert.equal(notY.get(), true);
  s.set('y');
  assert.equal(notY.get(), false);
});

test('gt/gte/lt/lte compare reactively', () => {
  const s = state(5);
  assert.equal(gt(s, 3).get(), true);
  assert.equal(gt(s, 5).get(), false);
  assert.equal(gte(s, 5).get(), true);
  assert.equal(lt(s, 6).get(), true);
  assert.equal(lt(s, 5).get(), false);
  assert.equal(lte(s, 5).get(), true);
  s.set(2);
  assert.equal(gt(s, 3).get(), false);
  assert.equal(lt(s, 3).get(), true);
});

test('not negates truthiness', () => {
  const s = state(false);
  const truthy = not(s);
  assert.equal(truthy.get(), true);
  s.set(true);
  assert.equal(truthy.get(), false);
});

test('and returns true only when all sources truthy', () => {
  const a = state(true);
  const b = state(true);
  const c = state(true);
  const all = and(a, b, c);
  assert.equal(all.get(), true);
  b.set(false);
  assert.equal(all.get(), false);
  b.set(true);
  c.set(0);
  assert.equal(all.get(), false);
});

test('or returns true when any source truthy', () => {
  const a = state(false);
  const b = state(false);
  const c = state(false);
  const any = or(a, b, c);
  assert.equal(any.get(), false);
  b.set(true);
  assert.equal(any.get(), true);
  b.set(false);
  c.set(1);
  assert.equal(any.get(), true);
});

test('derive auto-tracks dependencies and recomputes', () => {
  const a = state(1);
  const b = state(2);
  const sum = derive(() => a.get() + b.get());
  assert.equal(sum.get(), 3);
  a.set(10);
  assert.equal(sum.get(), 12);
  b.set(20);
  assert.equal(sum.get(), 30);
});

test('derive picks up newly tracked deps after first run', () => {
  const flag = state(false);
  const x = state('hello');
  const y = state('world');
  const out = derive(() => (flag.get() ? y.get() : x.get()));
  assert.equal(out.get(), 'hello');
  flag.set(true);
  assert.equal(out.get(), 'world');
  y.set('moon');
  assert.equal(out.get(), 'moon');
});

test('derive returns disposable', () => {
  const a = state(1);
  const sum = derive(() => a.get() * 2);
  assert.equal(typeof sum.dispose, 'function');
  sum.dispose();
});

// --- New long names + dual-reactive behaviour --------------------------

test('equals: reactive on the LEFT only', () => {
  const a = state(5);
  const r = equals(a, 5);
  assert.equal(r.get(), true);
  a.set(6);
  assert.equal(r.get(), false);
});

test('equals: reactive on the RIGHT only', () => {
  const a = state(5);
  const r = equals(5, a);
  assert.equal(r.get(), true);
  a.set(6);
  assert.equal(r.get(), false);
});

test('equals: reactive on BOTH sides', () => {
  const a = state(1);
  const b = state(1);
  const r = equals(a, b);
  assert.equal(r.get(), true);
  a.set(2);
  assert.equal(r.get(), false);
  b.set(2);
  assert.equal(r.get(), true);
});

test('equals: pure value comparison returns a plain boolean', () => {
  assert.equal(equals(3, 3), true);
  assert.equal(equals(3, 4), false);
});

test('differs / like / unlike work on both sides', () => {
  const a = state(1);
  const b = state(1);
  assert.equal(differs(a, b).get(), false);
  b.set(2);
  assert.equal(differs(a, b).get(), true);

  const x = state('1');
  assert.equal(like(x, 1).get(), true);
  assert.equal(unlike(x, 1).get(), false);
});

test('bigger / smaller / atLeast / atMost on both sides', () => {
  const a = state(5);
  const b = state(3);
  assert.equal(bigger(a, b).get(), true);
  assert.equal(smaller(b, a).get(), true);
  assert.equal(atLeast(a, 5).get(), true);
  assert.equal(atMost(3, b).get(), true);
  b.set(10);
  assert.equal(bigger(a, b).get(), false);
});

test('and: mixes plain and reactive sources', () => {
  const a = state(true);
  const r = and(a, true, 1);
  assert.equal(r.get(), true);
  a.set(false);
  assert.equal(r.get(), false);
});

test('and: short-circuits when a plain source is falsy', () => {
  const a = state(true);
  const r = and(a, false);
  assert.equal(r, false);
});

test('or: mixes plain and reactive sources', () => {
  const a = state(false);
  const r = or(a, false, 0);
  assert.equal(r.get(), false);
  a.set(true);
  assert.equal(r.get(), true);
});

test('or: short-circuits when a plain source is truthy', () => {
  const a = state(false);
  const r = or(a, true);
  assert.equal(r, true);
});

test('not: works on plain values too', () => {
  assert.equal(not(false), true);
  assert.equal(not(1), false);
});

test('short aliases (eq/neq/gt/gte/lt/lte) point to long names', () => {
  assert.equal(eq, equals);
  assert.equal(neq, differs);
  assert.equal(gt, bigger);
  assert.equal(gte, atLeast);
  assert.equal(lt, smaller);
  assert.equal(lte, atMost);
});
