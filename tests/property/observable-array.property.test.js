import test from 'node:test';
import fc from 'fast-check';
import { observableArray } from '../../src/index.js';

test('property: push/pop preserves length invariants', () => {
  fc.assert(fc.property(
    fc.array(fc.oneof(
      fc.record({ op: fc.constant('push'), value: fc.integer() }),
      fc.record({ op: fc.constant('pop') }),
      fc.record({ op: fc.constant('shift') }),
      fc.record({ op: fc.constant('unshift'), value: fc.integer() }),
    ), { maxLength: 50 }),
    (ops) => {
      const arr = observableArray([]);
      const ref = [];
      for (const op of ops) {
        if (op.op === 'push') { arr.push(op.value); ref.push(op.value); }
        else if (op.op === 'pop') { arr.pop(); ref.pop(); }
        else if (op.op === 'shift') { arr.shift(); ref.shift(); }
        else if (op.op === 'unshift') { arr.unshift(op.value); ref.unshift(op.value); }
      }
      if (arr.length !== ref.length) return false;
      for (let i = 0; i < ref.length; i++) {
        if (arr[i] !== ref[i]) return false;
      }
      return true;
    }
  ));
});

test('property: splice on observableArray matches plain array splice', () => {
  fc.assert(fc.property(
    fc.array(fc.integer(), { minLength: 0, maxLength: 20 }),
    fc.nat(20),
    fc.nat(5),
    fc.array(fc.integer(), { maxLength: 5 }),
    (initial, start, deleteCount, items) => {
      const arr = observableArray(initial.slice());
      const ref = initial.slice();
      arr.splice(start, deleteCount, ...items);
      ref.splice(start, deleteCount, ...items);
      if (arr.length !== ref.length) return false;
      for (let i = 0; i < ref.length; i++) {
        if (arr[i] !== ref[i]) return false;
      }
      return true;
    }
  ));
});
