import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduler, profiler } from '../../../src/index.js';
import { FLUSH_HOOK } from '../../../src/core/reactivity/scheduler.js';

class FakeHost {
  constructor(name) {
    this.name = name;
  }
  [FLUSH_HOOK]() {}
}

test('profiler captures schedule and flush events when enabled', async () => {
  profiler.reset();
  profiler.enable();
  try {
    const a = new FakeHost('a');
    scheduler.schedule(a);
    await Promise.resolve();
    await Promise.resolve();

    const events = profiler.events();
    assert.ok(events.some((e) => e.type === 'schedule'));
    assert.ok(events.some((e) => e.type === 'flush:start'));
    assert.ok(events.some((e) => e.type === 'flush:end'));

    const stats = profiler.stats();
    assert.ok(stats.schedules >= 1);
    assert.ok(stats.flushes >= 1);
  } finally {
    profiler.disable();
    profiler.reset();
  }
});

test('profiler ignores events when disabled', async () => {
  profiler.reset();
  const a = new FakeHost('a');
  scheduler.schedule(a);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(profiler.events().length, 0);
  assert.equal(profiler.stats().flushes, 0);
});

test('profiler summarizeRecent groups flushes by host class name', async () => {
  profiler.reset();
  profiler.enable();
  try {
    class HostA { [FLUSH_HOOK]() {} }
    class HostB { [FLUSH_HOOK]() {} }
    for (let i = 0; i < 3; i++) {
      scheduler.schedule(new HostA());
      scheduler.schedule(new HostB());
    }
    await Promise.resolve();
    await Promise.resolve();
    const summary = profiler.summarizeRecent(60_000);
    const hosts = summary.map((s) => s.host).sort();
    assert.deepEqual(hosts, ['HostA', 'HostB']);
  } finally {
    profiler.disable();
    profiler.reset();
  }
});
