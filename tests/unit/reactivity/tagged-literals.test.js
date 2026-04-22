import test from 'node:test';
import assert from 'node:assert/strict';
import { state, cls, tpl, resolve } from '../../../src/index.js';

test('tpl interpolates plain values into a static string', () => {
  const out = tpl`hello ${'world'} and ${42}`;
  assert.equal(out, 'hello world and 42');
});

test('tpl produces a reactive computed when given reactive values', () => {
  const name = state('alice');
  const greeting = tpl`hi ${name}!`;
  assert.equal(resolve(greeting), 'hi alice!');
  name.set('bob');
  assert.equal(resolve(greeting), 'hi bob!');
});

test('cls collapses internal whitespace and trims', () => {
  const out = cls`a b ${''} c`;
  assert.equal(out, 'a b c');
});

test('cls reacts to interpolated reactive values', () => {
  const variant = state('primary');
  const result = cls`btn btn-${variant}`;
  assert.equal(resolve(result), 'btn btn-primary');
  variant.set('secondary');
  assert.equal(resolve(result), 'btn btn-secondary');
});

test('cls accepts tuple [source, mapper] for conditional class', () => {
  const isOpen = state(false);
  const result = cls`menu ${[isOpen, (v) => v ? 'is-open' : '']}`;
  assert.equal(resolve(result), 'menu');
  isOpen.set(true);
  assert.equal(resolve(result), 'menu is-open');
});
