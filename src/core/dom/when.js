import { Renderable } from '../renderable/renderable.js';
import { Renderer } from '../renderable/renderer.js';
import { createAnchor } from './dom.js';
import { collectDependencies } from '../reactivity/tracker.js';
import { isReactiveSource, readSourceValue, subscribeSource } from '../reactivity/reactive-source.js';

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
  #depMap = new Map();
  #stableHandler = null;
  #sourceEvaluation = null;
  #lastPredicate = null;
  #updating = false;
  #pendingRecheck = false;
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
    this.#clearSourceSubscriptions();
    this.#sourceEvaluation = null;
    this.#lastPredicate = null;
    this.#updating = false;
    this.#pendingRecheck = false;
    this.#cleanup();
    if (this.#anchor) {
      this.#anchor.remove();
      this.#anchor = null;
    }
  }

  #wire() {
    if (!this.#stableHandler) {
      this.#stableHandler = () => this.#handleSourceChange();
    }
    const evaluation = this.#getSourceEvaluation();
    const newDeps = new Set(evaluation.deps);

    for (const [dep, unsub] of this.#depMap) {
      if (!newDeps.has(dep)) {
        unsub();
        this.#depMap.delete(dep);
      }
    }

    for (const dep of newDeps) {
      if (!this.#depMap.has(dep)) {
        const unsub = subscribeSource(dep, this.#stableHandler);
        if (unsub) this.#depMap.set(dep, unsub);
      }
    }
  }

  #handleSourceChange() {
    this.#sourceEvaluation = null;
    if (this.#updating) {
      this.#pendingRecheck = true;
      return;
    }
    this.#updating = true;
    try {
      this.#update();
      this.#wire();
      if (this.#pendingRecheck) {
        this.#pendingRecheck = false;
        this.#sourceEvaluation = null;
        this.#update();
        this.#wire();
      }
    } finally {
      this.#updating = false;
      this.#pendingRecheck = false;
    }
  }

  #clearSourceSubscriptions() {
    for (const unsub of this.#depMap.values()) unsub();
    this.#depMap.clear();
  }

  #evaluateSource() {
    if (typeof this.#source === 'function') {
      const { value, deps } = collectDependencies(() => this.#source());
      let resolved = value;
      if (isReactiveSource(resolved)) {
        if (!deps.includes(resolved)) deps.push(resolved);
        resolved = readSourceValue(resolved);
      }
      return { predicate: !!resolved, deps };
    }

    if (isReactiveSource(this.#source)) {
      return { predicate: !!readSourceValue(this.#source), deps: [this.#source] };
    }

    return { predicate: !!this.#source, deps: [] };
  }

  #getSourceEvaluation() {
    if (!this.#sourceEvaluation) {
      this.#sourceEvaluation = this.#evaluateSource();
    }
    return this.#sourceEvaluation;
  }

  #resolveSourceEvaluation() {
    if (!this.#mounted && this.#depMap.size === 0) {
      return this.#evaluateSource();
    }
    return this.#getSourceEvaluation();
  }

  readValue() {
    const predicate = this.#resolveSourceEvaluation().predicate;
    const value = predicate ? this.#renderTrue() : this.#renderFalse?.();
    if (Renderer.isRenderable(value) || Renderer.isDomNode(value)) return undefined;
    if (!isValidAttributeValue(value)) return undefined;
    return value;
  }

  subscribeValue(fn) {
    let unsubs = [];
    let closed = false;
    let attachQueued = false;
    const cleanup = () => {
      for (const unsub of unsubs) unsub();
      unsubs = [];
    };
    const scheduleAttach = () => {
      if (attachQueued || closed) return;
      attachQueued = true;
      queueMicrotask(() => {
        attachQueued = false;
        if (closed) return;
        attach();
      });
    };
    const attach = () => {
      cleanup();
      const evaluation = this.#evaluateSource();
      this.#sourceEvaluation = evaluation;
      for (const dep of evaluation.deps) {
        const unsub = subscribeSource(dep, () => {
          this.#sourceEvaluation = null;
          fn(this.readValue());
          scheduleAttach();
        });
        if (unsub) unsubs.push(unsub);
      }
    };

    attach();
    if (!unsubs.length) {
      this.#sourceEvaluation = null;
      cleanup();
      return null;
    }
    return () => {
      closed = true;
      cleanup();
      this.#sourceEvaluation = null;
    };
  }

  #cleanup() {
    for (const r of this.#mountedValues) Renderer.unmount(r);
    this.#mountedValues = [];
    for (const n of this.#mountedNodes) if (n.parentNode) n.remove();
    this.#mountedNodes = [];
  }

  #update() {
    const predicate = this.#getSourceEvaluation().predicate;
    if (this.#lastPredicate !== null && predicate === this.#lastPredicate) return;
    this.#lastPredicate = predicate;
    this.#cleanup();
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
    const predicate = this.#resolveSourceEvaluation().predicate;
    const value = predicate ? this.#renderTrue() : this.#renderFalse?.();
    return render(value);
  }
}

export function when(source, renderTrue, renderFalse) {
  if (typeof renderTrue !== 'function') {
    throw new Error('when(source, renderTrue, renderFalse?): renderTrue must be a function');
  }
  if (renderFalse != null && typeof renderFalse !== 'function') {
    throw new Error('when(source, renderTrue, renderFalse?): renderFalse must be a function');
  }
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
