import { DirtyHost } from '../reactivity/dirty-host.js';
import { Renderer } from '../renderable/renderer.js';

function createProxy(host) {
  return new Proxy(host, {
    get: (target, prop) => {
      if (prop === 'onCleanup') return target.onCleanup.bind(target);
      if (prop === '$') {
        return (name) => target[name];
      }
      if (typeof prop === 'string' && prop.startsWith('$')) {
        return target[prop.slice(1)];
      }
      const value = target[prop];
      if (typeof value === 'function') return value.bind(target);
      return value;
    },
    set: (target, prop, value) => {
      target[prop] = value;
      return true;
    },
  });
}

class FunctionComponentInstance extends DirtyHost {
  #root = null;
  #rootValues = [];
  #cleanups = [];

  constructor(renderFn, props) {
    super();
    this.props = props || {};
    const proxy = createProxy(this);
    const root = renderFn.call(proxy, props);
    this.#root = root;
    this.#rootValues = Renderer.normalize(root);
  }

  mountInto(parent, beforeNode) {
    for (const r of this.#rootValues) {
      if (Renderer.isRenderable(r)) {
        r.mountInto(parent, beforeNode);
        continue;
      }
      if (Renderer.isDomNode(r)) {
        parent.insertBefore(r, beforeNode);
      }
    }
  }

  unmount() {
    for (const fn of this.#cleanups) fn();
    this.#cleanups = [];
    for (const r of this.#rootValues) {
      if (Renderer.isRenderable(r)) {
        r.unmount();
        continue;
      }
      if (Renderer.isDomNode(r)) {
        r.remove();
      }
    }
  }

  renderToString(render) {
    return render(this.#root);
  }

  onCleanup(fn) {
    if (typeof fn !== 'function') return;
    this.#cleanups.push(fn);
  }
}

export function component(renderFn) {
  if (typeof renderFn !== 'function') {
    throw new Error('component(fn): fn must be a function');
  }
  const factory = (props) => new FunctionComponentInstance(renderFn, props);
  factory.__zbFactory = true;
  return factory;
}
