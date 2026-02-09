import { signal, readSignal, setSignal, subscribeSignal } from './reactivity/signal.js';
import { createStateFromAdapter } from './reactivity/state.js';
import { Renderable } from './renderable/renderable.js';

class ContextProvider extends Renderable {
  #child;
  #providerSignal;
  #consumers;
  #mounted = false;

  constructor(child, providerSignal, consumers) {
    super();
    this.#child = child;
    this.#providerSignal = providerSignal;
    this.#consumers = consumers;
  }

  mountInto(parent, beforeNode) {
    if (this.#mounted) return;
    this.#mounted = true;
    for (const consumer of this.#consumers) {
      consumer._connect(this.#providerSignal);
    }
    this.#child.mountInto(parent, beforeNode);
  }

  unmount() {
    if (!this.#mounted) return;
    this.#mounted = false;
    this.#child.unmount();
    for (const consumer of this.#consumers) {
      consumer._disconnect();
    }
  }

  renderToString(render) {
    for (const consumer of this.#consumers) {
      consumer._connect(this.#providerSignal);
    }
    return render(this.#child);
  }
}

function createContextConsumer(defaultValue) {
  const localSignal = signal(defaultValue);
  const subscribers = new Set();
  let activeProviderSignal = null;
  let providerUnsub = null;
  let localUnsub = null;

  const notify = (...args) => {
    for (const fn of subscribers) fn(...args);
  };

  localUnsub = subscribeSignal(localSignal, notify);

  const getActive = () => activeProviderSignal || localSignal;

  const adapter = {
    kind: 'state',
    get: () => readSignal(getActive()),
    set: (next) => setSignal(getActive(), next, true),
    subscribe: (fn) => {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    before: localSignal.before,
  };

  const consumerState = createStateFromAdapter(adapter);

  return {
    state: consumerState,
    _connect(providerSignal) {
      activeProviderSignal = providerSignal;
      if (localUnsub) { localUnsub(); localUnsub = null; }
      providerUnsub = subscribeSignal(providerSignal, notify);
      const newVal = readSignal(providerSignal);
      const oldVal = readSignal(localSignal);
      if (newVal !== oldVal) {
        notify(newVal, oldVal);
      }
    },
    _disconnect() {
      if (providerUnsub) { providerUnsub(); providerUnsub = null; }
      activeProviderSignal = null;
      localUnsub = subscribeSignal(localSignal, notify);
    },
  };
}

/**
 * Creates a context for sharing reactive state across a component tree
 * without prop drilling.
 *
 * Returns { serve, state }:
 * - serve(renderable, value?) — wraps a renderable as a context provider.
 * - state() — returns a reactive state bound to the nearest ancestor provider.
 *
 * Usage:
 *   const sizeCtx = context([1, 2, 3]);
 *
 *   const Parent = (...children) =>
 *     sizeCtx.serve(Div(...children));
 *
 *   const Child = () => {
 *     const sizes = sizeCtx.state();
 *     sizes.set([4, 5, 6]);
 *     return Div(sizes[0]);
 *   };
 *
 *   Parent(Child());
 */
export function context(defaultValue) {
  const pending = [];

  const serve = (renderable, value) => {
    const providerSignal = signal(value !== undefined ? value : defaultValue);
    const consumers = pending.splice(0, pending.length);
    return new ContextProvider(renderable, providerSignal, consumers);
  };

  const state = () => {
    const consumer = createContextConsumer(defaultValue);
    pending.push(consumer);
    return consumer.state;
  };

  return { serve, state };
}
