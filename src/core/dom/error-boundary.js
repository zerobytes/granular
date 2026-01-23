import { Renderable } from '../renderable/renderable.js';
import { Renderer } from '../renderable/renderer.js';
import { createComment, clearBetween } from './dom.js';

export class ErrorBoundaryNode extends Renderable {
  #fallback;
  #onError;
  #child;
  #start = null;
  #end = null;
  #mounted = false;
  #mountedValues = [];

  constructor(options, child) {
    super();
    this.#fallback = options?.fallback ?? null;
    this.#onError = options?.onError ?? null;
    this.#child = child;
  }

  mountInto(parent, beforeNode) {
    if (this.#mounted) return;
    this.#mounted = true;
    this.#start = createComment('zb:error:start', 'error');
    this.#end = createComment('zb:error:end', 'error');
    parent.insertBefore(this.#start, beforeNode);
    parent.insertBefore(this.#end, beforeNode);
    this.#renderSafe();
  }

  unmount() {
    if (!this.#mounted) return;
    this.#mounted = false;
    this.#cleanup();
    if (this.#start && this.#end) {
      clearBetween(this.#start, this.#end);
      this.#start.remove();
      this.#end.remove();
    }
    this.#start = null;
    this.#end = null;
  }

  #cleanup() {
    for (const r of this.#mountedValues) Renderer.unmount(r);
    this.#mountedValues = [];
    if (this.#start && this.#end) clearBetween(this.#start, this.#end);
  }

  #renderValue(value) {
    const values = Renderer.normalize(value);
    this.#mountedValues = values;
    for (const r of values) {
      if (Renderer.isRenderable(r)) {
        r.mountInto(this.#end.parentNode, this.#end);
      } else if (Renderer.isDomNode(r)) {
        this.#end.parentNode.insertBefore(r, this.#end);
      }
    }
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
