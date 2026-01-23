import { Renderable } from '../renderable/renderable.js';
import { Renderer } from '../renderable/renderer.js';
import { createComment, clearBetween } from './dom.js';
import { isState, isStatePath, readState, subscribeState } from '../reactivity/state.js';
import { isSignal, readSignal, subscribeSignal } from '../reactivity/signal.js';

export class WhenNode extends Renderable {
  #source;
  #renderTrue;
  #renderFalse;
  #start = null;
  #end = null;
  #mounted = false;
  #unsub = null;
  #mountedValues = [];

  constructor(source, renderTrue, renderFalse) {
    super();
    this.#source = source;
    this.#renderTrue = renderTrue;
    this.#renderFalse = renderFalse;
  }

  mountInto(parent, beforeNode) {
    if (this.#mounted) return;
    this.#mounted = true;
    this.#start = createComment('zb:when:start', 'when');
    this.#end = createComment('zb:when:end', 'when');
    parent.insertBefore(this.#start, beforeNode);
    parent.insertBefore(this.#end, beforeNode);

    this.#update();
    this.#wire();
  }

  unmount() {
    if (!this.#mounted) return;
    this.#mounted = false;
    if (this.#unsub) this.#unsub();
    this.#unsub = null;
    this.#cleanup();
    if (this.#start && this.#end) {
      clearBetween(this.#start, this.#end);
      this.#start.remove();
      this.#end.remove();
    }
    this.#start = null;
    this.#end = null;
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

  #cleanup() {
    for (const r of this.#mountedValues) Renderer.unmount(r);
    this.#mountedValues = [];
    if (this.#start && this.#end) clearBetween(this.#start, this.#end);
  }

  #update() {
    this.#cleanup();
    const predicate = this.#read();
    const value = predicate ? this.#renderTrue() : this.#renderFalse?.();
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

  renderToString(render) {
    const predicate = this.#read();
    const value = predicate ? this.#renderTrue() : this.#renderFalse?.();
    return render(value);
  }
}

export function when(source, renderTrue, renderFalse) {
  return new WhenNode(source, renderTrue, renderFalse);
}
