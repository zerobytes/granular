import test from 'node:test';
import assert from 'node:assert/strict';
import { Div, H3, Input, after, renderToString, state } from '../../src/index.js';

test('renderToString resolves computed children and formatted input values', () => {
  const count = state(3);
  const doubled = after(count).compute((value) => value * 2);
  const cssClass = after(count).compute((value) => `count-${value}`);

  const html = renderToString(
    Div(
      H3({ className: cssClass }, doubled),
      Input({ value: doubled }),
    ),
  );

  assert.match(html, /class="count-3"/);
  assert.match(html, />6<\/h3>/);
  assert.match(html, /value="6"/);
});
