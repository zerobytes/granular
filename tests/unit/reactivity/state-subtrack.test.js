import test from 'node:test';
import assert from 'node:assert/strict';
import { state, after } from '../../../src/index.js';

test('state subscribers do not fire when their path value is unchanged on full set', () => {
  const s = state({ a: 1, b: 2, deep: { x: 10, y: 20 } });
  let aFires = 0;
  let bFires = 0;
  let xFires = 0;

  after(s.a).change(() => aFires++);
  after(s.b).change(() => bFires++);
  after(s.deep.x).change(() => xFires++);

  s.set({ a: 1, b: 99, deep: { x: 10, y: 20 } });

  assert.equal(aFires, 0, 'a should not fire because value did not change');
  assert.equal(bFires, 1, 'b should fire because value changed');
  assert.equal(xFires, 0, 'deep.x should not fire because value unchanged');
});

test('state notifies the subscriber for the changed path even with multiple siblings', () => {
  const s = state({ items: { 0: 'a', 1: 'b' } });
  let item0Fires = 0;
  let item1Fires = 0;
  after(s.items[0]).change(() => item0Fires++);
  after(s.items[1]).change(() => item1Fires++);

  s.set().items[0] = 'A2';

  assert.equal(item0Fires, 1);
  assert.equal(item1Fires, 0);
});

test('state subscribers fire on deep path changes when ancestor object is replaced', () => {
  const s = state({ user: { name: 'Alice', age: 30 } });
  let nameFires = 0;
  let ageFires = 0;
  after(s.user.name).change(() => nameFires++);
  after(s.user.age).change(() => ageFires++);

  s.set({ user: { name: 'Bob', age: 30 } });

  assert.equal(nameFires, 1);
  assert.equal(ageFires, 0);
});
