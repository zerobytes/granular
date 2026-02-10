import { Renderable } from '../renderable/renderable.js';
import { Renderer } from '../renderable/renderer.js';
import { createAnchor } from './dom.js';

export class ErrorBoundaryNode extends Renderable {
  #fallback;
  #onError;
  #child;
  #anchor = null;
  #mounted = false;
  #mountedValues = [];
  #mountedNodes = [];

  constructor(options, child) {
    super();
    this.#fallback = options?.fallback ?? null;
    this.#onError = options?.onError ?? null;
    this.#child = child;
  }

  mountInto(parent, beforeNode) {
    if (this.#mounted) return;
    this.#mounted = true;
    this.#anchor = createAnchor('error');
    parent.insertBefore(this.#anchor, beforeNode);
    this.#renderSafe();
  }

  unmount() {
    if (!this.#mounted) return;
    this.#mounted = false;
    this.#cleanup();
    if (this.#anchor) {
      this.#anchor.remove();
      this.#anchor = null;
    }
  }

  #cleanup() {
    for (const r of this.#mountedValues) Renderer.unmount(r);
    this.#mountedValues = [];
    for (const n of this.#mountedNodes) if (n.parentNode) n.remove();
    this.#mountedNodes = [];
  }

  #renderValue(value) {
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

  #renderSafe() {
    this.#cleanup();
    try {
      const value = typeof this.#child === 'function' ? this.#child() : this.#child;
      this.#renderValue(value);
    } catch (error) {
      this.#handleError(error);
    }
  }

  #handleError(error) {
    try {
      if (typeof this.#onError === 'function') {
        this.#onError(error, { phase: 'render' });
      }
    } catch {
      // ignore errors from onError
    }
    try {
      if (this.#fallback) {
        const value = typeof this.#fallback === 'function' ? this.#fallback(error) : this.#fallback;
        this.#renderValue(value);
      }
    } catch {
      // ignore errors from fallback
    }
  }

  renderToString(render) {
    try {
      const value = typeof this.#child === 'function' ? this.#child() : this.#child;
      return render(value);
    } catch (error) {
      if (typeof this.#onError === 'function') {
        try {
          this.#onError(error, { phase: 'render' });
        } catch {}
      }
      if (this.#fallback) {
        const fallback = typeof this.#fallback === 'function' ? this.#fallback(error) : this.#fallback;
        return render(fallback);
      }
      return '';
    }
  }
}

export function ErrorBoundary(options, child) {
  return new ErrorBoundaryNode(options, child);
}
