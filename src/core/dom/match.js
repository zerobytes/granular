import { Renderable } from '../renderable/renderable.js';
import { Renderer } from '../renderable/renderer.js';
import { createAnchor } from './dom.js';
import { isReactiveSource, readSourceValue, subscribeSource } from '../reactivity/reactive-source.js';

function normalizeSources(sources) {
  return Array.isArray(sources) ? sources : [sources];
}

export class MatchNode extends Renderable {
  #sources;
  #predicate;
  #renderTrue;
  #renderFalse;
  #anchor = null;
  #mounted = false;
  #mountedValues = [];
  #mountedNodes = [];
  #predicateValue = null;
  #sourceUnsubs = [];

  constructor(sources, predicate, renderTrue, renderFalse) {
    super();
    this.#sources = normalizeSources(sources);
    this.#predicate = predicate;
    this.#renderTrue = renderTrue;
    this.#renderFalse = renderFalse;
  }

  mountInto(parent, beforeNode) {
    if (this.#mounted) return;
    this.#mounted = true;
    this.#anchor = createAnchor('match');
    parent.insertBefore(this.#anchor, beforeNode);
    this.#predicateValue = this.#evaluatePredicate();
    this.#mountBranch(this.#predicateValue);
    this.#wire();
  }

  unmount() {
    if (!this.#mounted) return;
    this.#mounted = false;
    this.#cleanup();
    this.#clearSourceSubscriptions();
    this.#predicateValue = null;
    if (this.#anchor) {
      this.#anchor.remove();
      this.#anchor = null;
    }
  }

  renderToString(render) {
    const predicate = this.#evaluatePredicate();
    return render(this.#resolveBranch(predicate));
  }

  #wire() {
    this.#clearSourceSubscriptions();
    const seen = new Set();
    for (const source of this.#sources) {
      if (!isReactiveSource(source) || seen.has(source)) continue;
      seen.add(source);
      const unsub = subscribeSource(source, () => this.#handleSourceChange());
      if (unsub) this.#sourceUnsubs.push(unsub);
    }
  }

  #clearSourceSubscriptions() {
    for (const unsub of this.#sourceUnsubs) unsub();
    this.#sourceUnsubs = [];
  }

  #readValues() {
    return this.#sources.map((source) => readSourceValue(source));
  }

  #evaluatePredicate() {
    return !!this.#predicate(...this.#readValues());
  }

  #resolveBranch(predicate) {
    return predicate ? this.#renderTrue?.() : this.#renderFalse?.();
  }

  #handleSourceChange() {
    const nextPredicate = this.#evaluatePredicate();
    if (nextPredicate === this.#predicateValue) return;
    this.#predicateValue = nextPredicate;
    this.#cleanup();
    this.#mountBranch(nextPredicate);
  }

  #cleanup() {
    for (const r of this.#mountedValues) Renderer.unmount(r);
    this.#mountedValues = [];
    for (const n of this.#mountedNodes) if (n.parentNode) n.remove();
    this.#mountedNodes = [];
  }

  #mountBranch(predicate) {
    const value = this.#resolveBranch(predicate);
    const values = Renderer.normalize(value);
    this.#mountedValues = values;

    const parent = this.#anchor.parentNode;
    if (!parent) return;

    const marker = document.createTextNode('');
    parent.insertBefore(marker, this.#anchor);

    for (const r of values) {
      if (Renderer.isRenderable(r)) {
        r.mountInto(parent, this.#anchor);
      } else if (Renderer.isDomNode(r)) {
        parent.insertBefore(r, this.#anchor);
      }
    }

    const nodes = [];
    let cur = marker.nextSibling;
    while (cur && cur !== this.#anchor) {
      nodes.push(cur);
      cur = cur.nextSibling;
    }
    marker.remove();
    this.#mountedNodes = nodes;
  }
}

export function match(sources, predicate, renderTrue, renderFalse) {
  if (typeof predicate !== 'function') {
    throw new Error('match(sources, predicate, renderTrue, renderFalse?): predicate must be a function');
  }
  if (typeof renderTrue !== 'function') {
    throw new Error('match(sources, predicate, renderTrue, renderFalse?): renderTrue must be a function');
  }
  if (renderFalse != null && typeof renderFalse !== 'function') {
    throw new Error('match(sources, predicate, renderTrue, renderFalse?): renderFalse must be a function');
  }
  return new MatchNode(sources, predicate, renderTrue, renderFalse);
}
