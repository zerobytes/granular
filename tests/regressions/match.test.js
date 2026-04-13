import test from 'node:test';
import assert from 'node:assert/strict';
import { Div, Span, match, signal, state } from '../../src/index.js';
import { installDom } from '../helpers/dom-env.js';

test('match swaps branches only when predicate value changes', () => {
  const cleanup = installDom();

  try {
    const root = document.createElement('div');
    const status = state('a');
    const name = state('Ana');
    let trueRenders = 0;
    let falseRenders = 0;

    const app = Div(
      match(
        [status, name],
        (nextStatus) => nextStatus === 'a',
        () => {
          trueRenders++;
          return Span(name);
        },
        () => {
          falseRenders++;
          return Span('off');
        }
      )
    );

    app.mountInto(root, null);
    assert.equal(root.textContent, 'Ana');
    assert.equal(trueRenders, 1);
    assert.equal(falseRenders, 0);

    name.set('Bia');
    assert.equal(root.textContent, 'Bia');
    assert.equal(trueRenders, 1);
    assert.equal(falseRenders, 0);

    status.set('b');
    assert.equal(root.textContent, 'off');
    assert.equal(trueRenders, 1);
    assert.equal(falseRenders, 1);

    name.set('Carla');
    assert.equal(root.textContent, 'off');
    assert.equal(trueRenders, 1);
    assert.equal(falseRenders, 1);

    status.set('a');
    assert.equal(root.textContent, 'Carla');
    assert.equal(trueRenders, 2);
    assert.equal(falseRenders, 1);

    app.unmount();
  } finally {
    cleanup();
  }
});

test('match accepts a single source and raw values in the source list', () => {
  const cleanup = installDom();

  try {
    const root = document.createElement('div');
    const age = signal(19);

    const app = Div(
      match(
        [age, 'admin'],
        (nextAge, role) => nextAge >= 18 && role === 'admin',
        () => Span('allowed'),
        () => Span('blocked')
      )
    );

    app.mountInto(root, null);
    assert.equal(root.textContent, 'allowed');

    age.set(17);
    assert.equal(root.textContent, 'blocked');

    app.unmount();
  } finally {
    cleanup();
  }
});
