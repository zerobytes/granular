import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { state, after } from '../../src/index.js';

test('property: state.set then state.get returns the same value (root replace)', () => {
  fc.assert(fc.property(
    fc.array(fc.record({
      a: fc.integer(),
      b: fc.string(),
      c: fc.boolean(),
    }), { maxLength: 20 }),
    (values) => {
      const s = state({ a: 0, b: '', c: false });
      for (const v of values) s.set(v);
      const snap = s.get();
      if (values.length === 0) {
        return snap.a === 0 && snap.b === '' && snap.c === false;
      }
      const last = values[values.length - 1];
      return snap.a === last.a && snap.b === last.b && snap.c === last.c;
    }
  ));
});

test('property: path-set is equivalent to root-replace with patched value', () => {
  fc.assert(fc.property(
    fc.record({ x: fc.integer(), y: fc.integer() }),
    fc.integer(),
    (initial, newX) => {
      const a = state({ ...initial });
      const b = state({ ...initial });
      a.set('x', newX);
      b.set({ ...initial, x: newX });
      const av = a.get(), bv = b.get();
      return av.x === bv.x && av.y === bv.y;
    }
  ));
});

test('property: subscribing to unrelated path does not fire when sibling changes', async () => {
  await fc.assert(fc.asyncProperty(
    fc.array(fc.integer({ min: 0, max: 100 }), { maxLength: 10 }),
    async (values) => {
      const s = state({ a: 0, b: 0 });
      let aCalls = 0;
      after(s.a).change(() => { aCalls++; });
      for (const v of values) s.set('b', v);
      await Promise.resolve();
      await Promise.resolve();
      return aCalls === 0;
    }
  ));
});
