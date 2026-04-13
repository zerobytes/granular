import test from 'node:test';
import assert from 'node:assert/strict';
import { Div, Span, H1, Input, signal, state, after, renderToString } from '../../../src/index.js';

// ─── Primitives ────────────────────────────────────────────────────────

test('renderToString converts a plain string to HTML-safe text', () => {
  const html = renderToString('hello <world>');
  assert.match(html, /hello &lt;world&gt;/);
});

test('renderToString converts null/false to empty string', () => {
  assert.equal(renderToString(null), '');
  assert.equal(renderToString(false), '');
});

test('renderToString converts a number to string', () => {
  const html = renderToString(42);
  assert.equal(html, '42');
});

// ─── Signal resolution ────────────────────────────────────────────────

test('renderToString resolves signals to their current value', () => {
  const s = signal('reactive');
  const html = renderToString(Span(s));
  assert.match(html, /reactive<\/span>/);
});

test('renderToString resolves state paths', () => {
  const s = state({ name: 'Ana' });
  const html = renderToString(Span(s.name));
  assert.match(html, /Ana<\/span>/);
});

test('renderToString resolves computed values', () => {
  const count = state(5);
  const doubled = after(count).compute((v) => v * 2);
  const html = renderToString(Span(doubled));
  assert.match(html, /10<\/span>/);
});

// ─── Element rendering ────────────────────────────────────────────────

test('renderToString renders element with attributes', () => {
  const html = renderToString(Div({ id: 'app', className: 'main' }, 'content'));
  assert.match(html, /id="app"/);
  assert.match(html, /class="main"/);
  assert.match(html, /content<\/div>/);
});

test('renderToString renders nested elements', () => {
  const html = renderToString(Div(H1('Title'), Span('body')));
  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /<span>body<\/span>/);
});

test('renderToString renders input with value attribute', () => {
  const html = renderToString(Input({ value: 'test' }));
  assert.match(html, /value="test"/);
});

// ─── Array children ───────────────────────────────────────────────────

test('renderToString joins array children', () => {
  const html = renderToString(Div([Span('a'), Span('b')]));
  assert.match(html, /<span>a<\/span>/);
  assert.match(html, /<span>b<\/span>/);
});

// ─── Signal as attribute ──────────────────────────────────────────────

test('renderToString resolves signal used as attribute value', () => {
  const cls = signal('active');
  const html = renderToString(Div({ className: cls }));
  assert.match(html, /class="active"/);
});
