import { Renderable } from './renderable.js';
import { Renderer } from './renderer.js';
import { ElementNode } from '../dom/element.js';
import { isSignal, readSignal } from '../reactivity/signal.js';
import { isState, isStatePath, isComputed, readState } from '../reactivity/state.js';

function isRenderableLike(value) {
  return !!value && typeof value === 'object' && typeof value.renderToString === 'function';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderValue(value, render) {
  if (value == null || value === false) return '';
  if (Array.isArray(value)) return value.map((v) => render(v)).join('');
  if (isSignal(value)) return render(readSignal(value));
  if (isState(value) || isStatePath(value) || isComputed(value)) return render(readState(value));
  if (value instanceof Renderable && typeof value.renderToString === 'function') {
    return value.renderToString(render);
  }
  if (value instanceof ElementNode) return value.renderToString(render);
  if (isRenderableLike(value)) return value.renderToString(render);
  if (Renderer.isDomNode(value)) {
    return value.outerHTML || '';
  }
  return escapeHtml(Renderer.toText(value));
}

export function renderToString(value) {
  const render = (v) => renderValue(v, render);
  render.escape = escapeHtml;
  return render(value);
}

export function hydrate(target, value) {
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) throw new Error('hydrate(target): target not found');
  el.textContent = '';
  const values = Renderer.normalize(value);
  for (const r of values) {
    if (Renderer.isRenderable(r)) {
      r.mountInto(el, null);
    } else if (Renderer.isDomNode(r)) {
      el.appendChild(r);
    }
  }
}
