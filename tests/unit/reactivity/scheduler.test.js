import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduler } from '../../../src/index.js';
import { FLUSH_HOOK } from '../../../src/core/reactivity/scheduler.js';

class FakeHost {
  constructor(name) {
    this.name = name;
    this.flushCount = 0;
  }
  [FLUSH_HOOK]() {
    this.flushCount++;
  }
}

test('scheduler batches multiple hosts into a single microtask', async () => {
  const a = new FakeHost('a');
  const b = new FakeHost('b');
  const c = new FakeHost('c');

  scheduler.schedule(a);
  scheduler.schedule(b);
  scheduler.schedule(c);

  assert.equal(a.flushCount, 0, 'should not flush synchronously');

  await Promise.resolve();
  await Promise.resolve();

  assert.equal(a.flushCount, 1);
  assert.equal(b.flushCount, 1);
  assert.equal(c.flushCount, 1);
});

test('scheduler dedupes the same host scheduled twice in one tick', async () => {
  const h = new FakeHost('h');

  scheduler.schedule(h);
  scheduler.schedule(h);
  scheduler.schedule(h);

  await Promise.resolve();
  await Promise.resolve();

  assert.equal(h.flushCount, 1);
});

test('scheduler reflushes when a host is dirty after first flush', async () => {
  const h = new FakeHost('h');
  scheduler.schedule(h);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(h.flushCount, 1);

  scheduler.schedule(h);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(h.flushCount, 2);
});

test('scheduler runs sync priority immediately', () => {
  const h = new FakeHost('h');
  scheduler.schedule(h, 'sync');
  assert.equal(h.flushCount, 1);
});

test('scheduler propagates errors but continues with remaining hosts', async () => {
  const errorOriginal = console.error;
  const captured = [];
  console.error = (...args) => captured.push(args);
  try {
    const a = new FakeHost('a');
    const b = new FakeHost('b');
    a[FLUSH_HOOK] = () => { throw new Error('boom'); };

    scheduler.schedule(a);
    scheduler.schedule(b);

    await Promise.resolve();
    await Promise.resolve();

    assert.equal(b.flushCount, 1);
    assert.ok(captured.length > 0, 'should log the error');
  } finally {
    console.error = errorOriginal;
  }
});
