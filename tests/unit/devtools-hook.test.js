import test from 'node:test';
import assert from 'node:assert/strict';
import { installDevtoolsHook, DEVTOOLS_HOOK_KEY, signal, after } from '../../src/index.js';

test('installDevtoolsHook: returns a hook with snapshot/attach/detach', () => {
  const hook = installDevtoolsHook();
  assert.ok(hook);
  assert.equal(typeof hook.attach, 'function');
  assert.equal(typeof hook.detach, 'function');
  assert.equal(typeof hook.snapshot, 'function');
  assert.equal(globalThis[DEVTOOLS_HOOK_KEY], hook);
});

test('installDevtoolsHook: snapshot exposes stats / events arrays', () => {
  const hook = installDevtoolsHook();
  hook.attach();
  hook.reset();
  const snap = hook.snapshot();
  assert.equal(typeof snap.stats, 'object');
  assert.equal(typeof snap.stats.schedules, 'number');
  assert.equal(typeof snap.stats.flushes, 'number');
  assert.ok(Array.isArray(snap.events));
  assert.ok(Array.isArray(snap.recentEvents));
  assert.ok(Array.isArray(snap.topByHost));
  hook.detach();
});

test('installDevtoolsHook: attach() turns profiler on, detach() leaves hook in place', () => {
  const hook = installDevtoolsHook();
  hook.attach();
  assert.equal(hook.isAttached(), true);
  hook.detach();
  assert.equal(hook.isAttached(), false);
  assert.equal(globalThis[DEVTOOLS_HOOK_KEY], hook);
});

test('installDevtoolsHook: idempotent', () => {
  const a = installDevtoolsHook();
  const b = installDevtoolsHook();
  assert.equal(a, b);
});
