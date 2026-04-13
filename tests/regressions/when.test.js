import test from 'node:test';
import assert from 'node:assert/strict';
import { Div, Span, signal, state, when } from '../../src/index.js';
import { installDom } from '../helpers/dom-env.js';

test('when supports raw truthy values, state-like sources and predicate functions', async () => {
  const cleanup = installDom();

  try {
    const root = document.createElement('div');

    const raw = Div(when('ok', () => Span('raw-yes'), () => Span('raw-no')));
    raw.mountInto(root, null);
    assert.equal(root.textContent, 'raw-yes');
    raw.unmount();

    const visible = state({ on: true });
    const stateLike = Div(when(visible.on, () => Span('state-yes'), () => Span('state-no')));
    stateLike.mountInto(root, null);
    assert.equal(root.textContent, 'state-yes');
    visible.on.set(false);
    assert.equal(root.textContent, 'state-no');
    stateLike.unmount();

    const enabled = signal(true);
    const label = signal('A');
    const predicate = Div(when(() => enabled.get() && label.get() === 'A', () => Span('fn-yes'), () => Span('fn-no')));
    predicate.mountInto(root, null);
    assert.equal(root.textContent, 'fn-yes');

    enabled.set(false);
    await Promise.resolve();
    assert.equal(root.textContent, 'fn-no');

    label.set('B');
    await Promise.resolve();
    assert.equal(root.textContent, 'fn-no');

    enabled.set(true);
    await Promise.resolve();
    assert.equal(root.textContent, 'fn-no');

    label.set('A');
    await Promise.resolve();
    assert.equal(root.textContent, 'fn-yes');
    predicate.unmount();
  } finally {
    cleanup();
  }
});
