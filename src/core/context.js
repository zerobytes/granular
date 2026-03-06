import { signal, readSignal, setSignal, subscribeSignal } from './reactivity/signal.js';
import { createStateFromAdapter } from './reactivity/state.js';
import { Renderable } from './renderable/renderable.js';

class ContextProvider extends Renderable {
  #child;
  #providerSignal;
  #consumers;
  #mountStack;
  #mountTimeConsumers = [];
  #mounted = false;

  constructor(child, providerSignal, consumers, mountStack) {
    super();
    this.#child = child;
    this.#providerSignal = providerSignal;
    this.#consumers = consumers;
    this.#mountStack = mountStack;
  }

  mountInto(parent, beforeNode) {
    if (this.#mounted) return;
    this.#mounted = true;
    for (const consumer of this.#consumers) {
      consumer._connect(this.#providerSignal);
    }
    this.#mountStack.push({ signal: this.#providerSignal, consumers: this.#mountTimeConsumers });
    this.#child.mountInto(parent, beforeNode);
    this.#mountStack.pop();
  }

  unmount() {
    if (!this.#mounted) return;
    this.#mounted = false;
    this.#child.unmount();
    for (const consumer of this.#consumers) {
      consumer._disconnect();
    }
    for (const consumer of this.#mountTimeConsumers) {
      consumer._disconnect();
    }
    this.#mountTimeConsumers = [];
  }

  renderToString(render) {
    for (const consumer of this.#consumers) {
      consumer._connect(this.#providerSignal);
    }
    this.#mountStack.push({ signal: this.#providerSignal, consumers: this.#mountTimeConsumers });
    const html = render(this.#child);
    this.#mountStack.pop();
    return html;
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
      if (activeProviderSignal === providerSignal) return;
      if (providerUnsub) { providerUnsub(); providerUnsub = null; }
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
 * Returns { scope, state }:
 * - scope(value?) - creates a new provider level. Returns a state with
 *     .get(), .set(), path access, and .serve(renderable) to wrap children.
 * - state() - returns a reactive state bound to the nearest ancestor provider.
 *
 * Usage:
 *   const sizeCtx = context([1, 2, 3]);
 *
 *   const Parent = (...children) => {
 *     const sizes = sizeCtx.scope();
 *     sizes.set([10, 20, 30]);
 *     return sizes.serve(Div(...children));
 *   };
 *
 *   const Child = () => {
 *     const sizes = sizeCtx.state();
 *     return Div(sizes[0]);
 *   };
 *
 *   Parent(Child());
 */
export function context(defaultValue) {
  const pending = [];
  const mountStack = [];
  const providerStack = [];

  const scope = (value) => {
    const providerSignal = signal(value !== undefined ? value : defaultValue);
    const scopeConsumers = [];
    providerStack.push({ signal: providerSignal, consumers: scopeConsumers });

    const adapter = {
      kind: 'state',
      get: () => readSignal(providerSignal),
      set: (next) => setSignal(providerSignal, next, true),
      subscribe: (fn) => subscribeSignal(providerSignal, fn),
      before: providerSignal.before,
    };

    const providerState = createStateFromAdapter(adapter);

    const serve = (renderable) => {
      providerStack.pop();
      const pendingConsumers = pending.splice(0);
      for (const consumer of pendingConsumers) {
        consumer._connect(providerSignal);
      }
      const allConsumers = [...scopeConsumers, ...pendingConsumers];
      return new ContextProvider(renderable, providerSignal, allConsumers, mountStack);
    };

    return new Proxy(providerState, {
      get(target, prop) {
        if (prop === 'serve') return serve;
        return Reflect.get(target, prop);
      },
    });
  };

  const state = () => {
    const consumer = createContextConsumer(defaultValue);
    if (mountStack.length > 0) {
      const top = mountStack[mountStack.length - 1];
      consumer._connect(top.signal);
      top.consumers.push(consumer);
    } else if (providerStack.length > 0) {
      const top = providerStack[providerStack.length - 1];
      consumer._connect(top.signal);
      top.consumers.push(consumer);
    } else {
      pending.push(consumer);
    }
    return consumer.state;
  };

  return { scope, state };
}
