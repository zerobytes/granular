import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { signal } from '../../src/index.js';

test('property: signal.get always returns the last set value', () => {
  fc.assert(fc.property(fc.array(fc.anything({ maxDepth: 2 })), (values) => {
    const s = signal(undefined);
    for (const v of values) s.set(v);
    if (values.length === 0) return s.get() === undefined;
    return Object.is(s.get(), values[values.length - 1]);
  }));
});

test('property: subscribers receive notifications equal to distinct value transitions', () => {
  fc.assert(fc.property(fc.array(fc.integer({ min: 0, max: 5 }), { maxLength: 30 }), (values) => {
    const s = signal(values[0] ?? 0);
    let calls = 0;
    s.subscribe(() => { calls++; });
    let expected = 0;
    let prev = s.get();
    for (let i = (values.length > 0 ? 1 : 0); i < values.length; i++) {
      if (!Object.is(prev, values[i])) expected++;
      prev = values[i];
      s.set(values[i]);
    }
    return calls === expected;
  }));
});

test('property: unsubscribe halts notifications', () => {
  fc.assert(fc.property(fc.integer({ min: 0, max: 100 }), fc.integer({ min: 0, max: 100 }), (a, b) => {
    fc.pre(a !== b);
    const s = signal(a);
    let calls = 0;
    const off = s.subscribe(() => { calls++; });
    s.set(b);
    off();
    s.set(a);
    s.set(b);
    return calls === 1;
  }));
});
