import { Renderable } from '../renderable/renderable.js';
import { Renderer } from '../renderable/renderer.js';

function resolveTarget(target) {
  if (!target && typeof document !== 'undefined') return document.body;
  if (typeof target === 'string') return document.querySelector(target);
  return target;
}

export class PortalNode extends Renderable {
  #target;
  #content;
  #mounted = false;
  #mountedValues = [];

  constructor(target, content) {
    super();
    this.#target = target;
    this.#content = content;
  }

  mountInto(_parent, _beforeNode) {
    if (this.#mounted) return;
    this.#mounted = true;
    const targetEl = resolveTarget(this.#target);
    if (!targetEl) throw new Error('portal: target not found');
    const value = typeof this.#content === 'function' ? this.#content() : this.#content;
    const values = Renderer.normalize(value);
    this.#mountedValues = values;
    for (const r of values) {
      if (Renderer.isRenderable(r)) {
        r.mountInto(targetEl, null);
      } else if (Renderer.isDomNode(r)) {
        targetEl.appendChild(r);
      }
    }
  }

  unmount() {
    if (!this.#mounted) return;
    this.#mounted = false;
    for (const r of this.#mountedValues) Renderer.unmount(r);
    this.#mountedValues = [];
  }

  renderToString(render) {
    const value = typeof this.#content === 'function' ? this.#content() : this.#content;
    return render(value);
  }
}

export function portal(target, content) {
  if (content === undefined) {
    return new PortalNode(null, target);
  }
  return new PortalNode(target, content);
}
