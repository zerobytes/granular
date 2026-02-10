import { Renderable } from '../renderable/renderable.js';
import { Renderer } from '../renderable/renderer.js';
import { createAnchor } from './dom.js';
import { isState, isStatePath, readState, subscribeState } from '../reactivity/state.js';
import { isSignal, readSignal, subscribeSignal } from '../reactivity/signal.js';

const WHEN = Symbol('g.when');

function isValidAttributeValue(value) {
  if (value == null) return true;
  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean') return true;
  if (type === 'object' && !Array.isArray(value)) return true;
  return false;
}

export class WhenNode extends Renderable {
  #source;
  #renderTrue;
  #renderFalse;
  #anchor = null;
  #mounted = false;
  #unsub = null;
  #mountedValues = [];
  #mountedNodes = [];

  constructor(source, renderTrue, renderFalse) {
    super();
    this.#source = source;
    this.#renderTrue = renderTrue;
    this.#renderFalse = renderFalse;
    Object.defineProperty(this, WHEN, { value: true });
  }

  mountInto(parent, beforeNode) {
    if (this.#mounted) return;
    this.#mounted = true;
    this.#anchor = createAnchor('when');
    parent.insertBefore(this.#anchor, beforeNode);

    this.#update();
    this.#wire();
  }

  unmount() {
    if (!this.#mounted) return;
    this.#mounted = false;
    if (this.#unsub) this.#unsub();
    this.#unsub = null;
    this.#cleanup();
    if (this.#anchor) {
      this.#anchor.remove();
      this.#anchor = null;
    }
  }

  #wire() {
    if (isState(this.#source) || isStatePath(this.#source)) {
      this.#unsub = subscribeState(this.#source, () => this.#update());
      return;
    }
    if (isSignal(this.#source)) {
      this.#unsub = subscribeSignal(this.#source, () => this.#update());
    }
  }

  #read() {
    if (isState(this.#source) || isStatePath(this.#source)) return !!readState(this.#source);
    if (isSignal(this.#source)) return !!readSignal(this.#source);
    return !!this.#source;
  }

  readValue() {
    const predicate = this.#read();
    const value = predicate ? this.#renderTrue() : this.#renderFalse?.();
    if (Renderer.isRenderable(value) || Renderer.isDomNode(value)) return undefined;
    if (!isValidAttributeValue(value)) return undefined;
    return value;
  }

  subscribeValue(fn) {
    if (isState(this.#source) || isStatePath(this.#source)) {
      return subscribeState(this.#source, () => fn(this.readValue()));
    }
    if (isSignal(this.#source)) {
      return subscribeSignal(this.#source, () => fn(this.readValue()));
    }
    return null;
  }

  #cleanup() {
    for (const r of this.#mountedValues) Renderer.unmount(r);
    this.#mountedValues = [];
    for (const n of this.#mountedNodes) if (n.parentNode) n.remove();
    this.#mountedNodes = [];
  }

  #update() {
    this.#cleanup();
    const predicate = this.#read();
    const value = predicate ? this.#renderTrue() : this.#renderFalse?.();
    const values = Renderer.normalize(value);
    this.#mountedValues = values;

    const parent = this.#anchor.parentNode;
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

  renderToString(render) {
    const predicate = this.#read();
    const value = predicate ? this.#renderTrue() : this.#renderFalse?.();
    return render(value);
  }
}

export function when(source, renderTrue, renderFalse) {
  return new WhenNode(source, renderTrue, renderFalse);
}

export function isWhen(value) {
  return !!value && value[WHEN] === true;
}

export function readWhenValue(value) {
  return value?.readValue?.();
}

export function subscribeWhenValue(value, fn) {
  return value?.subscribeValue?.(fn);
}
