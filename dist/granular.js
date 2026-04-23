// src/core/renderable/renderable.js
var Renderable = class {
  /**
   * Mounts the instance into the DOM.
   * @param {Node} parent
   * @param {Node|null} beforeNode
   */
  mountInto() {
    throw new Error("Renderable.mountInto() must be implemented");
  }
  /**
   * Unmounts and releases DOM/resources owned by the instance.
   */
  unmount() {
    throw new Error("Renderable.unmount() must be implemented");
  }
};

// src/core/dom/dom.js
function createAnchor(label) {
  return document.createComment(`g:a:${label}`);
}

// src/core/reactivity/tracker.js
var activeCollector = null;
function collectDependencies(fn) {
  const prev = activeCollector;
  const collector = /* @__PURE__ */ new Map();
  activeCollector = collector;
  try {
    return { value: fn(), deps: Array.from(collector.values()) };
  } finally {
    activeCollector = prev;
  }
}
function trackDependency(key, value) {
  if (!activeCollector || key == null || value == null) return;
  activeCollector.set(key, value);
}

// src/core/reactivity/dev-hooks.js
var onCoerce = null;
var onUntrackedRead = null;
function setDevHooks(hooks) {
  onCoerce = hooks?.onCoerce ?? null;
  onUntrackedRead = hooks?.onUntrackedRead ?? null;
}
function notifyCoerce(kind, source, hint) {
  if (onCoerce) onCoerce(kind, source, hint);
}

// src/core/reactivity/signal.js
var SIGNAL = /* @__PURE__ */ Symbol("g.signal");
var SIGNAL_MAP = /* @__PURE__ */ Symbol("g.signal.map");
function isObject(value) {
  return value !== null && typeof value === "object";
}
function signal(initial, options) {
  const state2 = {
    [SIGNAL]: true,
    value: initial,
    subs: /* @__PURE__ */ new Set(),
    before: /* @__PURE__ */ new Set()
  };
  const onEmpty = options?.onEmpty;
  const onSubscribe = options?.onSubscribe;
  const notify = (prev) => {
    for (const fn of state2.subs) fn(state2.value, prev);
  };
  const patchObject = (source, next) => {
    if (!isObject(next) || Array.isArray(next)) return false;
    const keys = Object.keys(next);
    let changed = false;
    for (const key of keys) {
      if (isObject(source[key]) && !Array.isArray(source[key])) {
        if (!source[key]) source[key] = {};
        changed = patchObject(source[key], next[key]) || changed;
        continue;
      }
      if (next[key] === source[key]) continue;
      source[key] = next[key];
      changed = true;
    }
    return changed;
  };
  const api = {
    get() {
      return state2.value;
    },
    set(next, force = false) {
      const prev = state2.value;
      if (!force && prev === next) return true;
      for (const fn of state2.before) {
        const res = fn(prev, next);
        if (res === false) return false;
      }
      state2.value = next;
      notify(prev);
      return true;
    },
    patch(next) {
      if (!isObject(next) || Array.isArray(next)) {
        return api.set(next, true);
      }
      const prev = state2.value;
      const source = structuredClone(prev);
      const changed = patchObject(source, next);
      if (!changed) return false;
      for (const fn of state2.before) {
        const res = fn(prev, source);
        if (res === false) return false;
      }
      state2.value = source;
      notify(prev);
      return true;
    },
    subscribe(fn) {
      state2.subs.add(fn);
      if (onSubscribe) onSubscribe();
      return () => {
        state2.subs.delete(fn);
        if (onEmpty && state2.subs.size === 0) onEmpty();
      };
    },
    before(fn) {
      state2.before.add(fn);
      return () => state2.before.delete(fn);
    }
  };
  let proxy = null;
  const track = () => trackDependency(proxy, proxy);
  proxy = new Proxy(api, {
    get(_target, prop) {
      if (prop === SIGNAL) return true;
      if (prop === "value") return state2.value;
      if (prop === "get") {
        return () => {
          track();
          return api.get();
        };
      }
      if (prop === "set") return api.set;
      if (prop === "patch") return api.patch;
      if (prop === "subscribe") return api.subscribe;
      if (prop === "before") return api.before;
      if (prop === Symbol.toPrimitive) return (hint) => {
        track();
        notifyCoerce("signal", proxy, hint);
        return state2.value;
      };
      if (prop === "valueOf") return () => {
        track();
        notifyCoerce("signal", proxy, "valueOf");
        return state2.value;
      };
      if (prop === "toString") return () => {
        track();
        notifyCoerce("signal", proxy, "string");
        return String(state2.value);
      };
      const value = state2.value;
      if (Array.isArray(value) && prop === "map") {
        return (fn) => {
          const out = value.map(fn);
          Object.defineProperty(out, SIGNAL_MAP, { value: { signal: proxy, mapFn: fn } });
          return out;
        };
      }
      if (isObject(value)) {
        const v = value[prop];
        if (typeof v === "function") return v.bind(value);
        return v;
      }
      return void 0;
    }
  });
  return proxy;
}
function isSignal(value) {
  return !!value && value[SIGNAL] === true;
}
function subscribeSignal(sig, fn) {
  return sig?.subscribe?.(fn);
}
function readSignal(sig) {
  return sig?.get?.();
}
function setSignal(sig, next, force = false) {
  return sig?.set?.(next, force);
}
function patchSignal(sig, next) {
  return sig?.patch?.(next);
}
function getMappedArrayMeta(value) {
  if (!Array.isArray(value)) return null;
  return value[SIGNAL_MAP] || null;
}

// src/core/reactivity/state.js
var STATE = /* @__PURE__ */ Symbol("g.state");
var STATE_META = /* @__PURE__ */ Symbol("g.state.meta");
var TRACKED_STATE_PATHS = /* @__PURE__ */ new WeakMap();
var _pathCacheMax = 256;
function isObject2(value) {
  return value !== null && typeof value === "object";
}
function splitPath(path) {
  if (!path) return [];
  if (Array.isArray(path)) return path;
  return String(path).split(".").map((p) => p.trim()).filter(Boolean);
}
function getAtPath(obj, path) {
  let cur = obj;
  for (const key of path) {
    if (!cur) return void 0;
    cur = cur[key];
  }
  return cur;
}
function resolveValue(adapter, path, root) {
  const currentRoot = arguments.length < 3 ? adapter.get() : root;
  const value = getAtPath(currentRoot, path);
  const defaults = adapter.defaults;
  if (!defaults) return value;
  const shouldDefault = adapter.defaultsWhen(value);
  if (!shouldDefault) return value;
  const fallback = getAtPath(defaults, path);
  if (fallback === void 0) return value;
  if (typeof fallback === "function") {
    return fallback({ value, path, root: currentRoot });
  }
  return fallback;
}
function pathKey(path) {
  return path.join("\0");
}
function getTrackedStatePath(adapter, path) {
  let cache = TRACKED_STATE_PATHS.get(adapter);
  if (!cache) {
    cache = /* @__PURE__ */ new Map();
    TRACKED_STATE_PATHS.set(adapter, cache);
  }
  const key = pathKey(path);
  let proxy = cache.get(key);
  if (proxy) {
    cache.delete(key);
    cache.set(key, proxy);
    return proxy;
  }
  proxy = createStateProxy(adapter, path);
  cache.set(key, proxy);
  if (cache.size > _pathCacheMax) {
    cache.delete(cache.keys().next().value);
  }
  return proxy;
}
function trackStateAccess(adapter, path) {
  const proxy = getTrackedStatePath(adapter, path);
  trackDependency(proxy, proxy);
}
function setAtPath(obj, path, value) {
  if (!path.length) return value;
  const root = Array.isArray(obj) ? obj.slice() : { ...obj || {} };
  let cur = root;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    const next = cur[key];
    const cloned = Array.isArray(next) ? next.slice() : { ...next || {} };
    cur[key] = cloned;
    cur = cloned;
  }
  cur[path[path.length - 1]] = value;
  return root;
}
function createPathTrie() {
  const root = { subs: null, children: null, path: [] };
  const getOrCreate = (path) => {
    let node = root;
    for (let i = 0; i < path.length; i++) {
      const seg = path[i];
      if (!node.children) node.children = /* @__PURE__ */ new Map();
      let child = node.children.get(seg);
      if (!child) {
        child = { subs: null, children: null, path: path.slice(0, i + 1) };
        node.children.set(seg, child);
      }
      node = child;
    }
    return node;
  };
  const add = (path, fn) => {
    const node = getOrCreate(path);
    if (!node.subs) node.subs = /* @__PURE__ */ new Set();
    node.subs.add(fn);
    return () => {
      node.subs.delete(fn);
      if (node.subs.size === 0) node.subs = null;
    };
  };
  const notifyNode = (node, next, prev) => {
    if (!node.subs || node.subs.size === 0) return;
    if (node.path.length > 0) {
      const nextValue = getAtPath(next, node.path);
      const prevValue = getAtPath(prev, node.path);
      if (nextValue === prevValue) return;
    }
    for (const fn of node.subs) fn(next, prev);
  };
  const notifyDescendants = (node, next, prev) => {
    notifyNode(node, next, prev);
    if (node.children) {
      for (const child of node.children.values()) {
        notifyDescendants(child, next, prev);
      }
    }
  };
  const notifyAffected = (changedPath, next, prev) => {
    let node = root;
    for (let i = 0; i < changedPath.length; i++) {
      const seg = changedPath[i];
      if (!node.children) return;
      const child = node.children.get(seg);
      if (!child) return;
      if (i < changedPath.length - 1) {
        notifyNode(child, next, prev);
      } else {
        notifyDescendants(child, next, prev);
      }
      node = child;
    }
  };
  const notifyAll = (next, prev) => {
    notifyDescendants(root, next, prev);
  };
  return { add, notifyAffected, notifyAll };
}
var ARRAY_MUTATORS = {
  push: (arr, args) => {
    const a = arr.slice();
    a.push(...args);
    return a;
  },
  pop: (arr) => arr.slice(0, -1),
  shift: (arr) => arr.slice(1),
  unshift: (arr, args) => {
    const a = args.slice();
    a.push(...arr);
    return a;
  },
  splice: (arr, args) => {
    const a = arr.slice();
    a.splice(...args);
    return a;
  },
  sort: (arr, args) => arr.slice().sort(args[0]),
  reverse: (arr) => arr.slice().reverse(),
  fill: (arr, args) => arr.slice().fill(...args),
  copyWithin: (arr, args) => arr.slice().copyWithin(...args)
};
var ARRAY_RETURN = {
  push: (arr, args) => arr.length + args.length,
  pop: (arr) => arr[arr.length - 1],
  shift: (arr) => arr[0],
  splice: (arr, args) => {
    const start = Number(args[0]) || 0;
    const dc = args.length > 1 ? Number(args[1]) || 0 : arr.length - start;
    return arr.slice(start, start + dc);
  }
};
function createSetterProxy(adapter, basePath) {
  return new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "increment") {
          return () => {
            const current = getAtPath(adapter.get(), basePath);
            const next = (Number(current) || 0) + 1;
            adapter.set(setAtPath(adapter.get(), basePath, next), basePath);
          };
        }
        if (prop === "decrement") {
          return () => {
            const current = getAtPath(adapter.get(), basePath);
            const next = (Number(current) || 0) - 1;
            adapter.set(setAtPath(adapter.get(), basePath, next), basePath);
          };
        }
        if (prop === "mutate") {
          return (...args) => adapter.mutate?.(...args);
        }
        if (prop in ARRAY_MUTATORS) {
          return (...args) => {
            const current = getAtPath(adapter.get(), basePath);
            if (!Array.isArray(current)) return void 0;
            const retFn = ARRAY_RETURN[prop];
            const ret = retFn ? retFn(current, args) : void 0;
            const next = ARRAY_MUTATORS[prop](current, args);
            adapter.set(setAtPath(adapter.get(), basePath, next), basePath);
            return ret !== void 0 ? ret : next;
          };
        }
        if (typeof prop === "string") {
          return createSetterProxy(adapter, basePath.concat(prop));
        }
        return void 0;
      },
      set(_t, prop, value) {
        const path = basePath.concat(String(prop));
        adapter.set(setAtPath(adapter.get(), path, value), path);
        return true;
      }
    }
  );
}
function createStateProxy(adapter, path = []) {
  const meta = { adapter, path };
  let proxy = null;
  proxy = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === STATE) return true;
        if (prop === STATE_META) return meta;
        const isApiProp = prop === "get" || prop === "set" || prop === "patch" || prop === "subscribe" || prop === "before" || prop === "mutate";
        let dataOwns = false;
        if (isApiProp) {
          const val = resolveValue(adapter, path);
          dataOwns = isObject2(val) && Object.prototype.hasOwnProperty.call(val, prop);
        }
        if (prop === "get" && !dataOwns) {
          return (p) => {
            const fullPath = p === void 0 ? path : path.concat(splitPath(p));
            trackStateAccess(adapter, fullPath);
            return resolveValue(adapter, fullPath);
          };
        }
        if (prop === "set" && !dataOwns) {
          return (...args) => {
            if (args.length === 0) return createSetterProxy(adapter, path);
            if (args.length === 1) {
              return adapter.set(setAtPath(adapter.get(), path, args[0]), path);
            }
            const [p, v] = args;
            if (typeof p === "string") {
              const full = path.concat(splitPath(p));
              return adapter.set(setAtPath(adapter.get(), full, v), full);
            }
            return adapter.set(setAtPath(adapter.get(), path, p), path);
          };
        }
        if (prop === "patch" && !dataOwns) {
          return adapter.patch;
        }
        if (prop === "subscribe" && !dataOwns) {
          return (fn) => adapter.subscribe(fn);
        }
        if (prop === "before" && !dataOwns) {
          return adapter.before;
        }
        if (prop === "mutate" && !dataOwns) {
          return (...args) => adapter.mutate?.(...args);
        }
        if (prop === Symbol.toPrimitive) return (hint) => {
          trackStateAccess(adapter, path);
          notifyCoerce("state", proxy, hint);
          return resolveValue(adapter, path);
        };
        if (prop === "valueOf") return () => {
          trackStateAccess(adapter, path);
          notifyCoerce("state", proxy, "valueOf");
          return resolveValue(adapter, path);
        };
        if (prop === "toString") return () => {
          trackStateAccess(adapter, path);
          notifyCoerce("state", proxy, "string");
          return String(resolveValue(adapter, path));
        };
        const ownDesc = Object.getOwnPropertyDescriptor(_t, prop);
        if (ownDesc && !ownDesc.configurable) return ownDesc.value;
        const current = resolveValue(adapter, path);
        if (Array.isArray(current) && prop === "map") {
          return (fn) => {
            const out = current.map(fn);
            Object.defineProperty(out, STATE_META, { value: { adapter, path, mapFn: fn } });
            return out;
          };
        }
        if (isObject2(current) && typeof prop === "string") {
          return createStateProxy(adapter, path.concat(prop));
        }
        return void 0;
      },
      set(_t, prop, value) {
        if (typeof prop === "string") {
          throw new Error(`Direct mutation is not allowed. Use .set().${prop} = value or .set("${path.concat(prop).join(".")}", value).`);
        }
        return false;
      }
    }
  );
  return proxy;
}
function state(initial) {
  const rootSignal = signal(initial);
  const rootSubs = /* @__PURE__ */ new Set();
  const trie = createPathTrie();
  let _changedPath = null;
  subscribeSignal(rootSignal, (next, prev) => {
    const cp = _changedPath;
    _changedPath = null;
    for (const fn of rootSubs) fn(next, prev);
    if (cp && cp.length > 0) {
      trie.notifyAffected(cp, next, prev);
    } else {
      trie.notifyAll(next, prev);
    }
  });
  const adapter = {
    kind: "state",
    get: () => rootSignal.value,
    set: (next, changedPath) => {
      _changedPath = changedPath || null;
      return setSignal(rootSignal, next, true);
    },
    patch: (next) => patchSignal(rootSignal, next),
    subscribe: (fn, path) => {
      if (!path || path.length === 0) {
        rootSubs.add(fn);
        return () => rootSubs.delete(fn);
      }
      return trie.add(path, fn);
    },
    before: rootSignal.before,
    mutate: (optimistic, mutation, options = {}) => mutateAdapter(adapter, optimistic, mutation, options)
  };
  return createStateFromAdapter(adapter);
}
function createStateFromAdapter(adapter) {
  const proxy = createStateProxy(adapter, []);
  Object.defineProperty(proxy, STATE, { value: true });
  return proxy;
}
function cloneForSnapshot(value, options) {
  if (typeof options.clone === "function") return options.clone(value);
  return value;
}
async function mutateAdapter(adapter, optimistic, mutation, options = {}) {
  if (typeof optimistic !== "function" || typeof mutation !== "function") {
    throw new Error("mutate(optimistic, mutation, options?): invalid arguments");
  }
  const prev = cloneForSnapshot(adapter.get(), options);
  optimistic();
  try {
    const result = await mutation();
    return result;
  } catch (err) {
    if (typeof options.rollback === "function") {
      options.rollback(err, prev);
    } else {
      adapter.set(prev);
    }
    throw err;
  }
}
function isState(value) {
  return !!value && value[STATE] === true;
}
function isComputed(value) {
  const meta = value?.[STATE_META];
  return !!meta && meta.adapter?.kind === "computed";
}
function isStatePath(value) {
  return !!value && value[STATE_META];
}
function readState(value) {
  const meta = value?.[STATE_META];
  if (!meta) return void 0;
  trackStateAccess(meta.adapter, meta.path);
  return resolveValue(meta.adapter, meta.path);
}
function readStateFromRoot(value, root) {
  const meta = value?.[STATE_META];
  if (!meta) return void 0;
  return resolveValue(meta.adapter, meta.path, root);
}
function subscribeState(value, fn) {
  const meta = value?.[STATE_META];
  if (!meta) return null;
  return meta.adapter.subscribe((nextRoot, prevRoot) => {
    const next = resolveValue(meta.adapter, meta.path, nextRoot);
    const prev = resolveValue(meta.adapter, meta.path, prevRoot);
    if (next === prev) return;
    fn(next, prev);
  }, meta.path);
}
function readStateMeta(meta) {
  if (!meta) return void 0;
  return resolveValue(meta.adapter, meta.path);
}
function subscribeStateMeta(meta, fn) {
  if (!meta) return null;
  return meta.adapter.subscribe((nextRoot, prevRoot) => {
    const next = resolveValue(meta.adapter, meta.path, nextRoot);
    const prev = resolveValue(meta.adapter, meta.path, prevRoot);
    if (next === prev) return;
    fn(next, prev);
  }, meta.path);
}
function setStateValue(value, next) {
  const meta = value?.[STATE_META];
  if (!meta) return;
  return meta.adapter.set(setAtPath(meta.adapter.get(), meta.path, next), meta.path);
}
function getMappedMeta(value) {
  const meta = value?.[STATE_META];
  if (!meta || !meta.mapFn) return null;
  return meta;
}

// src/core/renderable/renderer.js
function readReactive(value) {
  if (isState(value) || isStatePath(value) || isComputed(value)) return readState(value);
  if (isSignal(value)) return readSignal(value);
  return value;
}
function subscribeReactive(value, cb) {
  if (isState(value) || isStatePath(value) || isComputed(value)) return subscribeState(value, cb);
  if (isSignal(value)) return subscribeSignal(value, cb);
  return null;
}
var ReactiveSlotNode = class extends Renderable {
  #source;
  #anchor = null;
  #parent = null;
  #mounted = false;
  #unsub = null;
  #current = [];
  constructor(source) {
    super();
    this.#source = source;
  }
  mountInto(parent, beforeNode) {
    if (this.#mounted) return;
    this.#mounted = true;
    this.#anchor = createAnchor("slot");
    parent.insertBefore(this.#anchor, beforeNode);
    this.#parent = parent;
    this.#update();
    this.#unsub = subscribeReactive(this.#source, () => this.#update());
  }
  #update() {
    for (const { renderables: renderables2, nodes: nodes2 } of this.#current) {
      for (const r of renderables2) Renderer.unmount(r);
      for (const n of nodes2) if (n.parentNode) n.remove();
    }
    this.#current = [];
    const value = readReactive(this.#source);
    const renderables = Renderer.normalize(value);
    const marker = document.createTextNode("");
    this.#parent.insertBefore(marker, this.#anchor);
    for (const r of renderables) {
      if (Renderer.isRenderable(r)) {
        r.mountInto(this.#parent, this.#anchor);
      } else if (Renderer.isDomNode(r)) {
        this.#parent.insertBefore(r, this.#anchor);
      }
    }
    const nodes = [];
    let cur = marker.nextSibling;
    while (cur && cur !== this.#anchor) {
      nodes.push(cur);
      cur = cur.nextSibling;
    }
    marker.remove();
    this.#current = [{ renderables, nodes }];
  }
  unmount() {
    if (!this.#mounted) return;
    this.#mounted = false;
    if (this.#unsub) this.#unsub();
    this.#unsub = null;
    for (const { renderables, nodes } of this.#current) {
      for (const r of renderables) Renderer.unmount(r);
      for (const n of nodes) if (n.parentNode) n.remove();
    }
    this.#current = [];
    if (this.#anchor?.parentNode) this.#anchor.remove();
    this.#anchor = null;
    this.#parent = null;
  }
};
var ReactiveTextNode = class extends Renderable {
  #source;
  #node = null;
  #mounted = false;
  #unsub = null;
  constructor(source) {
    super();
    this.#source = source;
  }
  mountInto(parent, beforeNode) {
    if (this.#mounted) return;
    this.#mounted = true;
    this.#node = document.createTextNode("");
    parent.insertBefore(this.#node, beforeNode);
    this.#sync();
    this.#wire();
  }
  unmount() {
    if (!this.#mounted) return;
    this.#mounted = false;
    if (this.#unsub) this.#unsub();
    this.#unsub = null;
    if (this.#node && this.#node.parentNode) this.#node.remove();
    this.#node = null;
  }
  #read() {
    const s = this.#source;
    if (isState(s) || isStatePath(s) || isComputed(s)) return readState(s);
    if (isSignal(s)) return readSignal(s);
    return s;
  }
  #wire() {
    const s = this.#source;
    if (isState(s) || isStatePath(s) || isComputed(s)) {
      this.#unsub = subscribeState(s, () => this.#sync());
      return;
    }
    if (isSignal(s)) {
      this.#unsub = subscribeSignal(s, () => this.#sync());
    }
  }
  #sync() {
    if (!this.#node) return;
    this.#node.textContent = Renderer.toText(this.#read());
  }
  renderToString() {
    return Renderer.toText(this.#read());
  }
};
var Renderer = class _Renderer {
  static isRenderableLike(value) {
    return !!value && typeof value === "object" && typeof value.mountInto === "function" && typeof value.unmount === "function";
  }
  /**
   * @param {unknown} value
   * @returns {value is Node}
   */
  static isDomNode(value) {
    return !!value && typeof value === "object" && typeof value.nodeType === "number";
  }
  /**
   * @param {unknown} value
   * @returns {value is Renderable}
   */
  static isRenderable(value) {
    return value instanceof Renderable || _Renderer.isRenderableLike(value);
  }
  /**
   * Converts a non-renderable value into string for text rendering.
   * @param {unknown} value
   * @returns {string}
   */
  static toText(value) {
    if (value == null || value === false) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number") return String(value);
    if (typeof value === "bigint") return String(value);
    if (typeof value === "boolean") return value ? "true" : "";
    try {
      return String(value);
    } catch {
      return "";
    }
  }
  /**
   * Normalizes a value into a flat list of renderables:
   * - Renderable instances
   * - DOM Nodes
   * - ReactiveSlotNode when reactive value resolves to Renderable/DOM/array (uses render pipeline)
   * - ReactiveTextNode when reactive value is primitive (text)
   * - TextNodes created from primitives/objects
   *
   * @param {unknown} value
   * @returns {(Renderable|Node)[]}
   */
  static normalize(value) {
    if (value == null || value === false) return [];
    if (Array.isArray(value)) return value.flatMap((v) => _Renderer.normalize(v));
    if (_Renderer.isRenderable(value) || _Renderer.isDomNode(value)) return (
      /** @type {(Renderable|Node)[]} */
      [value]
    );
    if (isSignal(value) || isState(value) || isStatePath(value) || isComputed(value)) {
      const unwrapped = readReactive(value);
      const isComplex = unwrapped != null && typeof unwrapped === "object" && (_Renderer.isRenderable(unwrapped) || _Renderer.isDomNode(unwrapped) || Array.isArray(unwrapped) || isSignal(unwrapped) || isState(unwrapped) || isStatePath(unwrapped) || isComputed(unwrapped));
      if (isComplex) return [new ReactiveSlotNode(value)];
      return [new ReactiveTextNode(value)];
    }
    return [document.createTextNode(_Renderer.toText(value))];
  }
  /**
   * Unmounts a renderable value if applicable.
   * @param {unknown} value
   */
  static unmount(value) {
    if (_Renderer.isRenderable(value)) value.unmount();
  }
};

// src/core/bootstrap.js
async function bootstrap(ComponentClass, target) {
  const el = typeof target === "string" ? document.querySelector(target) : target;
  if (!el) throw new Error("bootstrap target not found");
  el.textContent = "";
  if (typeof ComponentClass !== "function") {
    throw new Error("bootstrap: component must be a function or class");
  }
  let instance = null;
  try {
    instance = new ComponentClass(el);
  } catch {
    instance = null;
  }
  if (instance) {
    if (typeof instance.attach === "function") {
      await instance.attach(el);
      return instance;
    }
    if (typeof instance.mountInto === "function") {
      instance.mountInto(el, null);
      return instance;
    }
  }
  const root = ComponentClass(el);
  if (root === void 0 || root === null) {
    return {
      unmount() {
      }
    };
  }
  const values = Renderer.normalize(root);
  for (const r of values) {
    if (Renderer.isRenderable(r)) {
      r.mountInto(el, null);
    } else if (Renderer.isDomNode(r)) {
      el.appendChild(r);
    }
  }
  return {
    unmount() {
      for (const r of values) {
        if (Renderer.isRenderable(r)) {
          r.unmount();
        } else if (Renderer.isDomNode(r)) {
          r.remove();
        }
      }
    }
  };
}

// src/core/events/event-hub.js
var EventHub = class {
  #before = /* @__PURE__ */ new Map();
  // type -> Set<fn>
  #after = /* @__PURE__ */ new Map();
  // type -> Set<fn>
  #afterAny = /* @__PURE__ */ new Set();
  /**
   * @param {'before'|'after'} phase
   * @param {string} type
   * @param {(payload: any, ctx: any) => (void|boolean)} fn
   * @returns {() => void}
   */
  on(phase, type, fn) {
    const map = phase === "before" ? this.#before : this.#after;
    if (phase === "after" && type === "*") {
      this.#afterAny.add(fn);
      return () => this.#afterAny.delete(fn);
    }
    let set2 = map.get(type);
    if (!set2) {
      set2 = /* @__PURE__ */ new Set();
      map.set(type, set2);
    }
    set2.add(fn);
    return () => set2.delete(fn);
  }
  /**
   * Emits a before event. Returns false when cancelled.
   * @param {string} type
   * @param {any} payload
   * @param {any} ctx
   * @returns {boolean}
   */
  emitBefore(type, payload, ctx) {
    const set2 = this.#before.get(type);
    if (!set2) return true;
    for (const fn of set2) {
      const r = fn(payload, ctx);
      if (r === false) return false;
    }
    return true;
  }
  /**
   * Emits an after event.
   * @param {string} type
   * @param {any} payload
   * @param {any} ctx
   */
  emitAfter(type, payload, ctx) {
    const set2 = this.#after.get(type);
    if (set2) {
      for (const fn of set2) fn(payload, ctx);
    }
    for (const fn of this.#afterAny) fn(payload, ctx);
  }
  /**
   * Returns a fluent API for registering hooks.
   * @param {'before'|'after'} phase
   */
  phase(phase) {
    const hub = this;
    const api = {
      /**
       * Registers a handler for a given type.
       * @param {string} type
       * @param {(payload: any, ctx: any) => (void|boolean)} fn
       */
      on(type, fn) {
        return hub.on(phase, type, fn);
      },
      /**
       * Registers a handler for any type.
       * @param {(payload: any, ctx: any) => (void|boolean)} fn
       */
      any(fn) {
        return hub.on(phase, "*", fn);
      }
    };
    return new Proxy(api, {
      get(target, prop) {
        if (typeof prop !== "string") return target[prop];
        if (prop in target) return target[prop];
        return (fn) => hub.on(phase, prop, fn);
      }
    });
  }
};

// src/core/collections/observable-array.js
var ObservableArrayMeta = /* @__PURE__ */ new WeakMap();
function isObservableArray(value) {
  return !!value && typeof value === "object" && ObservableArrayMeta.has(value);
}
function clampIndex(index, length) {
  if (index < 0) return Math.max(0, length + index);
  return Math.min(index, length);
}
function observableArray(initial = []) {
  const target = Array.isArray(initial) ? initial.slice() : [];
  const subs = /* @__PURE__ */ new Set();
  const hub = new EventHub();
  const notify = (patch, ctx) => {
    for (const fn of subs) fn(patch, ctx);
    hub.emitAfter(patch.type, patch, ctx || { array: proxy });
  };
  const proxy = new Proxy(target, {
    get(t, prop, receiver) {
      if (prop === "subscribe") {
        return (fn) => {
          subs.add(fn);
          return () => subs.delete(fn);
        };
      }
      if (prop === "reset") {
        return (nextArray) => {
          const prevItems = t.slice();
          const nextItems = Array.isArray(nextArray) ? nextArray.slice() : [];
          const ctx = { array: proxy, op: "reset", args: [nextArray], prevLength: t.length, nextLength: nextItems.length };
          const patch = { type: "reset", items: nextItems, prevItems };
          if (!hub.emitBefore("reset", patch, ctx)) return;
          t.length = 0;
          if (Array.isArray(nextArray)) t.push(...nextArray);
          notify({ type: "reset", items: t.slice(), prevItems }, ctx);
        };
      }
      if (prop === "after") {
        return () => hub.phase("after");
      }
      if (prop === "before") {
        return () => hub.phase("before");
      }
      trackDependency(proxy, proxy);
      const value = Reflect.get(t, prop, receiver);
      if (typeof value !== "function") return value;
      if (prop === "push") {
        return (...items) => {
          const index = t.length;
          const ctx = { array: proxy, op: "push", args: items, prevLength: t.length, nextLength: t.length + items.length };
          const patch = { type: "insert", index, items: items.slice() };
          if (items.length && !hub.emitBefore("insert", patch, ctx)) return t.length;
          const result = Array.prototype.push.apply(t, items);
          if (items.length) notify({ type: "insert", index, items }, ctx);
          return result;
        };
      }
      if (prop === "pop") {
        return () => {
          if (t.length === 0) return void 0;
          const index = t.length - 1;
          const removed = [t[index]];
          const ctx = { array: proxy, op: "pop", args: [], prevLength: t.length, nextLength: t.length - 1 };
          const patch = { type: "remove", index, count: 1, items: removed };
          if (!hub.emitBefore("remove", patch, ctx)) return void 0;
          const result = Array.prototype.pop.apply(t);
          notify({ type: "remove", index, count: 1, items: removed }, ctx);
          return result;
        };
      }
      if (prop === "unshift") {
        return (...items) => {
          const ctx = { array: proxy, op: "unshift", args: items, prevLength: t.length, nextLength: t.length + items.length };
          const patch = { type: "insert", index: 0, items: items.slice() };
          if (items.length && !hub.emitBefore("insert", patch, ctx)) return t.length;
          const result = Array.prototype.unshift.apply(t, items);
          if (items.length) notify({ type: "insert", index: 0, items }, ctx);
          return result;
        };
      }
      if (prop === "shift") {
        return () => {
          if (t.length === 0) return void 0;
          const removed = [t[0]];
          const ctx = { array: proxy, op: "shift", args: [], prevLength: t.length, nextLength: t.length - 1 };
          const patch = { type: "remove", index: 0, count: 1, items: removed };
          if (!hub.emitBefore("remove", patch, ctx)) return void 0;
          const result = Array.prototype.shift.apply(t);
          notify({ type: "remove", index: 0, count: 1, items: removed }, ctx);
          return result;
        };
      }
      if (prop === "splice") {
        return (start, deleteCount, ...items) => {
          const lenBefore = t.length;
          const index = clampIndex(Number(start) || 0, lenBefore);
          const dc = deleteCount === void 0 ? lenBefore - index : Math.max(0, Number(deleteCount) || 0);
          const ctx = { array: proxy, op: "splice", args: [start, deleteCount, ...items], prevLength: t.length, nextLength: t.length - dc + items.length };
          if (dc) {
            const removePatch = { type: "remove", index, count: dc, items: t.slice(index, index + dc) };
            if (!hub.emitBefore("remove", removePatch, ctx)) return [];
          }
          if (items.length) {
            const insertPatch = { type: "insert", index, items: items.slice() };
            if (!hub.emitBefore("insert", insertPatch, ctx)) return [];
          }
          const removed = Array.prototype.splice.apply(t, [index, dc, ...items]);
          if (dc) notify({ type: "remove", index, count: dc, items: removed }, ctx);
          if (items.length) notify({ type: "insert", index, items }, ctx);
          return removed;
        };
      }
      if (prop === "sort") {
        return (compareFn) => {
          const prevItems = t.slice();
          const ctx = { array: proxy, op: "sort", args: [compareFn], prevLength: t.length, nextLength: t.length };
          const patch = { type: "reset", items: null, prevItems };
          if (!hub.emitBefore("reset", patch, ctx)) return proxy;
          Array.prototype.sort.call(t, compareFn);
          patch.items = t.slice();
          notify(patch, ctx);
          return proxy;
        };
      }
      if (prop === "reverse") {
        return () => {
          const prevItems = t.slice();
          const ctx = { array: proxy, op: "reverse", args: [], prevLength: t.length, nextLength: t.length };
          const patch = { type: "reset", items: null, prevItems };
          if (!hub.emitBefore("reset", patch, ctx)) return proxy;
          Array.prototype.reverse.call(t);
          patch.items = t.slice();
          notify(patch, ctx);
          return proxy;
        };
      }
      if (prop === "fill") {
        return (value2, start, end) => {
          const prevItems = t.slice();
          const ctx = { array: proxy, op: "fill", args: [value2, start, end], prevLength: t.length, nextLength: t.length };
          const patch = { type: "reset", items: null, prevItems };
          if (!hub.emitBefore("reset", patch, ctx)) return proxy;
          Array.prototype.fill.call(t, value2, start, end);
          patch.items = t.slice();
          notify(patch, ctx);
          return proxy;
        };
      }
      if (prop === "copyWithin") {
        return (target2, start, end) => {
          const prevItems = t.slice();
          const ctx = { array: proxy, op: "copyWithin", args: [target2, start, end], prevLength: t.length, nextLength: t.length };
          const patch = { type: "reset", items: null, prevItems };
          if (!hub.emitBefore("reset", patch, ctx)) return proxy;
          Array.prototype.copyWithin.call(t, target2, start, end);
          patch.items = t.slice();
          notify(patch, ctx);
          return proxy;
        };
      }
      return value.bind(t);
    },
    set(t, prop, value, receiver) {
      if (prop === "length") {
        const prev = t.length;
        const next = Number(value) || 0;
        const prevItems2 = t.slice();
        const removed = next < prev ? t.slice(next, prev) : [];
        const ctx2 = { array: proxy, op: "length", args: [next], prevLength: prev, nextLength: next };
        if (next < prev) {
          const patch2 = { type: "remove", index: next, count: prev - next, items: removed };
          if (!hub.emitBefore("remove", patch2, ctx2)) return true;
          const ok2 = Reflect.set(t, prop, next, receiver);
          if (ok2) notify(patch2, ctx2);
          return ok2;
        }
        if (next > prev) {
          const nextItems2 = t.slice();
          nextItems2.length = next;
          const patch2 = { type: "reset", items: nextItems2, prevItems: prevItems2 };
          if (!hub.emitBefore("reset", patch2, ctx2)) return true;
          const ok2 = Reflect.set(t, prop, next, receiver);
          if (ok2) notify({ type: "reset", items: t.slice(), prevItems: prevItems2 }, ctx2);
          return ok2;
        }
        return Reflect.set(t, prop, next, receiver);
      }
      const index = typeof prop === "string" && /^\d+$/.test(prop) ? Number(prop) : null;
      if (index == null) return Reflect.set(t, prop, value, receiver);
      const lenBefore = t.length;
      const prevValue = index < t.length ? t[index] : void 0;
      const ctx = { array: proxy, op: "set", args: [prop, value], prevLength: t.length, nextLength: t.length };
      if (index < lenBefore) {
        const patch2 = { type: "set", index, value, prev: prevValue };
        if (!hub.emitBefore("set", patch2, ctx)) return true;
        const ok2 = Reflect.set(t, prop, value, receiver);
        if (!ok2) return false;
        notify(patch2, ctx);
        return true;
      }
      if (index === lenBefore) {
        const patch2 = { type: "insert", index, items: [value] };
        ctx.nextLength = lenBefore + 1;
        if (!hub.emitBefore("insert", patch2, ctx)) return true;
        const ok2 = Reflect.set(t, prop, value, receiver);
        if (!ok2) return false;
        ctx.nextLength = t.length;
        notify(patch2, ctx);
        return true;
      }
      const prevItems = t.slice(0, lenBefore);
      const nextItems = t.slice();
      nextItems[index] = value;
      ctx.nextLength = Math.max(lenBefore, index + 1);
      const patch = { type: "reset", items: nextItems, prevItems };
      if (!hub.emitBefore("reset", patch, ctx)) return true;
      const ok = Reflect.set(t, prop, value, receiver);
      if (!ok) return false;
      notify({ type: "reset", items: t.slice(), prevItems }, ctx);
      return true;
    }
  });
  ObservableArrayMeta.set(proxy, { target, subs });
  return proxy;
}

// src/core/dom/input-format.js
var tokenMatchers = {
  d: (char) => /[0-9]/.test(char),
  a: (char) => /[A-Za-z]/.test(char),
  "*": (char) => /[A-Za-z0-9]/.test(char),
  s: (char) => /[^A-Za-z0-9]/.test(char)
};
var isToken = (char) => Object.prototype.hasOwnProperty.call(tokenMatchers, char);
function collectPatternValues(input, pattern) {
  const values = [];
  let patternIndex = 0;
  for (const char of input) {
    while (patternIndex < pattern.length && !isToken(pattern[patternIndex])) {
      patternIndex += 1;
    }
    if (patternIndex >= pattern.length) break;
    const token = pattern[patternIndex];
    if (tokenMatchers[token]?.(char)) {
      values.push(char);
      patternIndex += 1;
    }
  }
  return values;
}
function applyPattern(input, pattern) {
  const values = collectPatternValues(input, pattern);
  let visual = "";
  let valueIndex = 0;
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];
    if (isToken(char)) {
      if (valueIndex >= values.length) break;
      visual += values[valueIndex];
      valueIndex += 1;
      continue;
    }
    if (valueIndex === 0) continue;
    if (valueIndex < values.length) visual += char;
  }
  return { raw: values.join(""), visual };
}
function normalizeInputFormat(format) {
  if (format == null) return null;
  if (typeof format === "function") return { format, mode: "both" };
  if (typeof format === "string") return { pattern: format, mode: "both" };
  if (typeof format === "object") return { mode: "both", ...format };
  return null;
}
function applyInputFormat(inputValue, format) {
  const normalized = normalizeInputFormat(format);
  const rawInput = String(inputValue ?? "");
  if (!normalized) {
    return { value: rawInput, visual: rawInput, raw: rawInput };
  }
  if (typeof normalized.format === "function") {
    let formatted = rawInput;
    try {
      formatted = normalized.format(rawInput);
    } catch {
    }
    if (formatted && typeof formatted === "object") {
      const value = formatted.value ?? formatted.visual ?? "";
      const visual = formatted.visual ?? formatted.value ?? "";
      const raw = formatted.raw ?? value ?? "";
      return { value: String(value), visual: String(visual), raw: String(raw) };
    }
    return { value: String(formatted ?? ""), visual: String(formatted ?? ""), raw: String(formatted ?? "") };
  }
  if (normalized.pattern) {
    const { raw, visual } = applyPattern(rawInput, String(normalized.pattern));
    return { value: visual, visual, raw };
  }
  if (normalized.regex) {
    const match2 = rawInput.match(normalized.regex);
    const formatted = match2 ? match2[0] : "";
    return { value: formatted, visual: formatted, raw: formatted };
  }
  return { value: rawInput, visual: rawInput, raw: rawInput };
}

// src/core/reactivity/reactive-source.js
function isReactiveSource(value) {
  return isSignal(value) || isState(value) || isStatePath(value) || isObservableArray(value);
}
function readSourceValue(value) {
  if (isSignal(value)) return readSignal(value);
  if (isState(value) || isStatePath(value)) return readState(value);
  if (isObservableArray(value)) return value;
  return value;
}
function subscribeSource(value, fn) {
  if (isSignal(value)) return subscribeSignal(value, fn);
  if (isState(value) || isStatePath(value)) return subscribeState(value, fn);
  if (isObservableArray(value)) return value.subscribe(fn);
  return null;
}

// src/core/dom/when.js
var WHEN = /* @__PURE__ */ Symbol("g.when");
function isValidAttributeValue(value) {
  if (value == null) return true;
  const type = typeof value;
  if (type === "string" || type === "number" || type === "boolean") return true;
  if (type === "object" && !Array.isArray(value)) return true;
  return false;
}
var WhenNode = class extends Renderable {
  #source;
  #renderTrue;
  #renderFalse;
  #anchor = null;
  #mounted = false;
  #depMap = /* @__PURE__ */ new Map();
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
    this.#anchor = createAnchor("when");
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
    if (typeof this.#source === "function") {
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
    if (Renderer.isRenderable(value) || Renderer.isDomNode(value)) return void 0;
    if (!isValidAttributeValue(value)) return void 0;
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
    const marker = document.createTextNode("");
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
};
function when(source, renderTrue, renderFalse) {
  if (typeof renderTrue !== "function") {
    throw new Error("when(source, renderTrue, renderFalse?): renderTrue must be a function");
  }
  if (renderFalse != null && typeof renderFalse !== "function") {
    throw new Error("when(source, renderTrue, renderFalse?): renderFalse must be a function");
  }
  return new WhenNode(source, renderTrue, renderFalse);
}
function isWhen(value) {
  return !!value && value[WHEN] === true;
}
function readWhenValue(value) {
  return value?.readValue?.();
}
function subscribeWhenValue(value, fn) {
  return value?.subscribeValue?.(fn);
}

// src/core/internal/symbols.js
var INTERNAL = Object.freeze({
  instrumentBoundProp: /* @__PURE__ */ Symbol("g.instrumentBoundProp"),
  subscribeProp: /* @__PURE__ */ Symbol("g.subscribeProp"),
  noValue: /* @__PURE__ */ Symbol("g.noValue")
});

// src/core/reactivity/observe.js
function freezeValue(value) {
  if (!value || typeof value !== "object") return value;
  try {
    return Object.freeze(value);
  } catch {
    return value;
  }
}
function normalizeTargets(targets) {
  if (targets.length === 1 && Array.isArray(targets[0]) && !isObservableArray(targets[0])) return targets[0];
  return targets;
}
function readTargetValue(target) {
  if (isState(target) || isStatePath(target)) return readState(target);
  if (isSignal(target)) return readSignal(target);
  if (isObservableArray(target)) return target;
  return void 0;
}
function subscribeAfterTarget(target, fn) {
  if (isState(target) || isStatePath(target)) {
    return subscribeState(target, (next, prev) => fn(freezeValue(next), freezeValue(prev), null));
  }
  if (isSignal(target)) {
    return subscribeSignal(target, (next, prev) => fn(freezeValue(next), freezeValue(prev), null));
  }
  if (isObservableArray(target)) {
    return target.after().any((patch, ctx) => {
      const prevLen = ctx?.prevLength ?? target.length;
      const nextLen = ctx?.nextLength ?? target.length;
      const { next, prev } = makeArraySnapshots(target, patch, ctx, "after");
      fn(next, prev, { patch, prevLength: prevLen, nextLength: nextLen, array: target });
    });
  }
  throw new Error("after(x).change: unsupported target");
}
function subscribeBeforeTarget(target, fn) {
  if (isState(target) || isStatePath(target)) {
    return target.before?.((prevRoot, nextRoot) => {
      const prev = readStateFromRoot(target, prevRoot);
      const next = nextRoot !== void 0 ? readStateFromRoot(target, nextRoot) : prev;
      if (next === prev) return true;
      const res = fn(freezeValue(next), freezeValue(prev), null);
      return res !== false;
    });
  }
  if (isSignal(target)) {
    return target.before((prev, next) => fn(freezeValue(next), freezeValue(prev), null));
  }
  if (isObservableArray(target)) {
    return target.before().any((patch, ctx) => {
      const prevLen = target.length;
      const nextLen = ctx?.nextLength ?? prevLen;
      const { next, prev } = makeArraySnapshots(target, patch, ctx, "before");
      const res = fn(next, prev, { patch, prevLength: prevLen, nextLength: nextLen, array: target });
      return res !== false;
    });
  }
  throw new Error("before(x).change: unsupported target");
}
function createComputedState(signalOptions) {
  const rootSignal = signal(void 0, signalOptions);
  const adapter = {
    kind: "computed",
    get: () => readSignal(rootSignal),
    set: () => {
      throw new Error("Computed values are read-only.");
    },
    subscribe: (fn) => subscribeSignal(rootSignal, fn),
    before: void 0
  };
  const proxy = createStateFromAdapter(adapter);
  const setValue = (next) => setSignal(rootSignal, next, true);
  return { value: proxy, setValue };
}
function applyPatch(baseArray, patch, ctx) {
  if (!Array.isArray(baseArray)) return [];
  const out = baseArray.slice();
  if (!patch || !patch.type) return out;
  if (patch.type === "insert") {
    out.splice(patch.index, 0, ...patch.items || []);
    return out;
  }
  if (patch.type === "remove") {
    out.splice(patch.index, patch.count || 0);
    return out;
  }
  if (patch.type === "set") {
    out[patch.index] = patch.value;
    return out;
  }
  if (patch.type === "reset") {
    return Array.isArray(patch.items) ? patch.items.slice() : [];
  }
  return out;
}
function applyInversePatch(baseArray, patch, ctx) {
  if (!Array.isArray(baseArray)) return [];
  const out = baseArray.slice();
  if (!patch || !patch.type) return out;
  if (patch.type === "insert") {
    out.splice(patch.index, (patch.items || []).length);
    return out;
  }
  if (patch.type === "remove") {
    const items = patch.items || [];
    out.splice(patch.index, 0, ...items);
    return out;
  }
  if (patch.type === "set") {
    out[patch.index] = patch.prev;
    return out;
  }
  if (patch.type === "reset") {
    return Array.isArray(patch.prevItems) ? patch.prevItems.slice() : [];
  }
  return out;
}
function makeArraySnapshots(target, patch, ctx, phase) {
  const cached = { prev: null, next: null };
  const prev = () => {
    if (cached.prev) return cached.prev;
    cached.prev = phase === "after" ? applyInversePatch(target, patch, ctx) : target.slice();
    return cached.prev;
  };
  const next = () => {
    if (cached.next) return cached.next;
    cached.next = phase === "after" ? target.slice() : applyPatch(target, patch, ctx);
    return cached.next;
  };
  return { prev, next };
}
function valueForTarget(target) {
  if (isObservableArray(target)) return () => target.slice();
  return readTargetValue(target);
}
function capture({ name, subscription }, ...targets) {
  const list2 = normalizeTargets(targets);
  if (!list2.length) {
    throw new Error(`${name}(...targets): at least one target is required`);
  }
  const isSingleTarget = list2.length === 1;
  return {
    change(fn) {
      const unsubs = list2.map((target, index) => {
        let lastValue = INTERNAL.noValue;
        return subscription(target, (next, prev, ctx) => {
          const values = { next: [], prev: [], ctx: [] };
          list2.map((target2, index2) => {
            if (index2 === index) {
              values.next[index2] = next;
              values.prev[index2] = prev;
              values.ctx[index2] = ctx;
              return;
            }
            if (lastValue === INTERNAL.noValue) {
              lastValue = valueForTarget(target2);
            }
            values.next[index2] = lastValue;
            values.prev[index2] = lastValue;
            values.ctx[index2] = null;
          });
          if (isSingleTarget) {
            return fn(values.next[0], values.prev[0], values.ctx[0]);
          }
          return fn(values.next, values.prev, values.ctx);
        });
      });
      return () => {
        for (const unsub of unsubs) {
          if (typeof unsub === "function") unsub();
        }
      };
    },
    compute(fn, options = {}) {
      let disposed = false;
      let pendingAutoDispose = false;
      const keepAlive = options.keepAlive === true;
      let doDispose = null;
      const signalOptions = keepAlive ? void 0 : {
        onEmpty() {
          if (disposed) return;
          pendingAutoDispose = true;
          queueMicrotask(() => {
            if (!pendingAutoDispose || disposed) return;
            doDispose?.();
          });
        },
        onSubscribe() {
          pendingAutoDispose = false;
        }
      };
      const { value, setValue } = createComputedState(signalOptions);
      let runId = 0;
      let lastHash = void 0;
      let lastComputedValue = void 0;
      let scheduled = null;
      let lastValues = list2.map(valueForTarget);
      const equals2 = typeof options.equals === "function" ? options.equals : Object.is;
      const handleError = (err) => {
        if (typeof options.onError === "function") {
          options.onError(err);
          return;
        }
        if (typeof console !== "undefined" && typeof console.error === "function") {
          console.error(err);
        }
      };
      const computeNow = (nextValues, prevValues, ctxs) => {
        if (disposed || pendingAutoDispose) return;
        const current = ++runId;
        if (typeof options.hash === "function") {
          let nextHash = void 0;
          try {
            nextHash = isSingleTarget ? options.hash(nextValues[0], prevValues[0], ctxs[0]) : options.hash(nextValues, prevValues, ctxs);
          } catch (err) {
            handleError(err);
            return;
          }
          if (nextHash === lastHash) return;
          lastHash = nextHash;
        }
        let result;
        try {
          result = isSingleTarget ? fn(nextValues[0], prevValues[0], ctxs[0]) : fn(nextValues, prevValues, ctxs);
        } catch (err) {
          handleError(err);
          return;
        }
        if (result && typeof result.then === "function") {
          result.then((next) => {
            if (current !== runId || disposed) return;
            if (equals2(lastComputedValue, next)) return;
            lastComputedValue = next;
            setValue(next);
          }).catch((err) => handleError(err));
          return;
        }
        if (equals2(lastComputedValue, result)) return;
        lastComputedValue = result;
        setValue(result);
      };
      const scheduleRun = (nextValues, prevValues, ctxs) => {
        if (disposed || pendingAutoDispose) return;
        const delay = Math.max(0, options.debounce ?? 0);
        if (!delay) {
          computeNow(nextValues, prevValues, ctxs);
          return;
        }
        if (scheduled) clearTimeout(scheduled);
        scheduled = setTimeout(() => {
          scheduled = null;
          computeNow(nextValues, prevValues, ctxs);
        }, delay);
      };
      scheduleRun(lastValues, lastValues, list2.map(() => null));
      const unsubs = list2.map((target, index) => {
        return subscription(target, (next, prev, ctx) => {
          const values = { next: [], prev: [], ctx: [] };
          list2.map((target2, index2) => {
            if (index2 === index) {
              values.next[index2] = next;
              values.prev[index2] = prev;
              values.ctx[index2] = ctx;
              return;
            }
            values.next[index2] = valueForTarget(target2);
            values.prev[index2] = lastValues[index2];
            values.ctx[index2] = null;
          });
          lastValues = values.next;
          scheduleRun(values.next, values.prev, values.ctx);
        });
      });
      doDispose = () => {
        if (disposed) return;
        disposed = true;
        pendingAutoDispose = false;
        runId++;
        if (scheduled) clearTimeout(scheduled);
        for (const unsub of unsubs) {
          if (typeof unsub === "function") unsub();
        }
      };
      Object.defineProperty(value, "dispose", {
        value: () => doDispose(),
        enumerable: false
      });
      return value;
    }
  };
}
function after(...targets) {
  return capture({ name: "after", subscription: subscribeAfterTarget }, ...targets);
}
function before(...targets) {
  return capture({ name: "before", subscription: subscribeBeforeTarget }, ...targets);
}
function set(target, value) {
  if (isState(target) || isStatePath(target)) {
    setStateValue(target, value);
    return;
  }
  if (isSignal(target)) {
    setSignal(target, value);
    return;
  }
  if (isObservableArray(target)) {
    if (typeof target.reset !== "function") {
      throw new Error("set(array, value): observableArray must implement reset");
    }
    target.reset(value);
    return;
  }
  throw new Error("set(target, value): unsupported target");
}
function resolveValue2(value) {
  return typeof value === "function" ? value() : value;
}
function subscribe(target, selector, listener, equalityFn) {
  if (typeof selector !== "function") {
    throw new Error("subscribe(target, selector, listener?): selector must be a function");
  }
  if (listener === void 0) {
    return after(target).compute((next) => selector(resolveValue2(next)));
  }
  if (typeof listener !== "function") {
    throw new Error("subscribe(target, selector, listener): listener must be a function");
  }
  const eq2 = typeof equalityFn === "function" ? equalityFn : Object.is;
  let prevSelected = selector(resolveValue2(readTargetValue(target)));
  return after(target).change((next) => {
    const nextSelected = selector(resolveValue2(next));
    if (eq2(prevSelected, nextSelected)) return;
    const p = prevSelected;
    prevSelected = nextSelected;
    listener(nextSelected, p);
  });
}

// src/core/dom/list.js
function longestIncreasingSubsequence(arr) {
  if (arr.length === 0) return [];
  const tails = [];
  const tailsIdx = [];
  const prev = new Array(arr.length).fill(-1);
  for (let i = 0; i < arr.length; i++) {
    const x = arr[i];
    if (x === -1) continue;
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = lo + hi >> 1;
      if (tails[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = x;
    tailsIdx[lo] = i;
    prev[i] = lo > 0 ? tailsIdx[lo - 1] : -1;
  }
  const result = new Array(tails.length);
  let k = tails.length - 1;
  let cursor = tailsIdx[k];
  while (k >= 0 && cursor !== -1) {
    result[k--] = cursor;
    cursor = prev[cursor];
  }
  return result;
}
var ListNode = class extends Renderable {
  #items;
  #renderItem;
  #key;
  #anchor = null;
  #mounted = false;
  #unsub = null;
  #itemRefs = [];
  nodeType = "granular-list-node";
  constructor(items, renderItem, options = {}) {
    super();
    this.#items = items;
    this.#renderItem = renderItem;
    this.#key = typeof options?.key === "function" ? options.key : null;
  }
  #isStateSource() {
    return isState(this.#items) || isStatePath(this.#items);
  }
  mountInto(parent, beforeNode) {
    if (this.#mounted) return;
    this.#mounted = true;
    this.#anchor = createAnchor("list");
    parent.insertBefore(this.#anchor, beforeNode);
    const initial = this.#readItems();
    this.#mountAll(initial);
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
  renderToString(render) {
    const items = this.#readItems();
    return items.map((item, index) => {
      const itemState = state(item);
      const indexSignal = signal(index);
      return render(this.#renderItem(itemState, indexSignal));
    }).join("");
  }
  #readItems() {
    if (isObservableArray(this.#items)) return this.#items;
    if (isSignal(this.#items)) return readSignal(this.#items) || [];
    if (this.#isStateSource()) return readState(this.#items) || [];
    return Array.isArray(this.#items) ? this.#items : [];
  }
  #createItemState(index, item) {
    if (this.#isStateSource() && !this.#key) return this.#items[String(index)];
    return state(item);
  }
  #wire() {
    if (isObservableArray(this.#items)) {
      this.#unsub = this.#items.subscribe((patch) => {
        if (!this.#mounted) return;
        if (patch.type === "reset") {
          this.#reset(patch.items);
          return;
        }
        if (patch.type === "insert") {
          if (patch.items.length > 1) {
            this.#insertBatch(patch.index, patch.items);
          } else if (patch.items.length === 1) {
            this.#insert(patch.index, patch.items[0]);
          }
          this.#updateIndices(patch.index + patch.items.length);
          return;
        }
        if (patch.type === "remove") {
          this.#remove(patch.index, patch.count);
          this.#updateIndices(patch.index);
          return;
        }
        if (patch.type === "set") {
          this.#set(patch.index, patch.value);
        }
      });
      return;
    }
    if (isSignal(this.#items)) {
      this.#unsub = subscribeSignal(this.#items, () => {
        this.#reset(this.#readItems());
      });
      return;
    }
    if (this.#isStateSource()) {
      let scheduled = false;
      this.#unsub = subscribeState(this.#items, () => {
        if (scheduled) return;
        scheduled = true;
        queueMicrotask(() => {
          scheduled = false;
          if (!this.#mounted) return;
          const next = readState(this.#items);
          this.#reset(Array.isArray(next) ? next : []);
        });
      });
    }
  }
  #mountAll(items) {
    this.#itemRefs = [];
    for (let i = 0; i < items.length; i++) {
      this.#insert(i, items[i]);
    }
  }
  #cleanup() {
    for (const it of this.#itemRefs) {
      if (it.syncUnsub) it.syncUnsub();
      for (const r of it.renderables) Renderer.unmount(r);
      for (const n of it.nodes) if (n.parentNode) n.remove();
    }
    this.#itemRefs = [];
  }
  #wireSyncToObservableArray(ref) {
    if (!isObservableArray(this.#items)) return;
    ref.syncUnsub = after(ref.state).change((next) => {
      const i = readSignal(ref.index);
      if (this.#itemRefs[i] !== ref) return;
      if (this.#items[i] === next) return;
      this.#items[i] = next;
    });
  }
  #reset(items) {
    if (this.#key && this.#itemRefs.length > 0) {
      this.#reconcileKeyed(items);
      return;
    }
    if (items.length === this.#itemRefs.length) {
      const skipSet = this.#isStateSource();
      if (!skipSet) {
        for (let i = 0; i < items.length; i++) {
          const ref = this.#itemRefs[i];
          if (ref?.state) ref.state.set(items[i]);
        }
      }
      return;
    }
    this.#cleanup();
    this.#mountAll(items);
  }
  #reconcileKeyed(nextItems) {
    const oldByKey = /* @__PURE__ */ new Map();
    for (let i = 0; i < this.#itemRefs.length; i++) {
      const ref = this.#itemRefs[i];
      oldByKey.set(ref.key, { ref, oldIndex: i });
    }
    const nextRefs = new Array(nextItems.length);
    const oldIndexes = new Array(nextItems.length);
    const reusedKeys = /* @__PURE__ */ new Set();
    for (let i = 0; i < nextItems.length; i++) {
      const item = nextItems[i];
      const key = this.#key(item, i);
      const existing = oldByKey.get(key);
      if (existing) {
        existing.ref.state?.set(item);
        nextRefs[i] = existing.ref;
        oldIndexes[i] = existing.oldIndex;
        reusedKeys.add(key);
      } else {
        nextRefs[i] = null;
        oldIndexes[i] = -1;
      }
    }
    for (const ref of this.#itemRefs) {
      if (!reusedKeys.has(ref.key)) {
        if (ref.syncUnsub) ref.syncUnsub();
        for (const r of ref.renderables) Renderer.unmount(r);
        for (const n of ref.nodes) if (n.parentNode) n.remove();
      }
    }
    const lis = new Set(longestIncreasingSubsequence(oldIndexes));
    const parent = this.#anchor.parentNode;
    for (let i = nextItems.length - 1; i >= 0; i--) {
      const refNode = i + 1 < nextRefs.length ? this.#firstNodeOfRef(nextRefs[i + 1]) : this.#anchor;
      if (nextRefs[i] === null) {
        const item = nextItems[i];
        const key = this.#key(item, i);
        nextRefs[i] = this.#createRef(i, item, key);
        this.#mountRefBefore(nextRefs[i], parent, refNode);
      } else if (!lis.has(i)) {
        for (const n of nextRefs[i].nodes) parent.insertBefore(n, refNode);
      }
    }
    this.#itemRefs = nextRefs;
    for (let i = 0; i < this.#itemRefs.length; i++) {
      const ref = this.#itemRefs[i];
      if (ref.index) setSignal(ref.index, i);
    }
  }
  #firstNodeOfRef(ref) {
    if (!ref || !ref.nodes.length) return this.#anchor;
    return ref.nodes[0];
  }
  #createRef(index, item, key) {
    const itemState = this.#createItemState(index, item);
    const indexSignal = signal(index);
    const rendered = this.#renderItem ? this.#renderItem(itemState, indexSignal) : item;
    const renderables = Renderer.normalize(rendered);
    return { nodes: [], renderables, state: itemState, index: indexSignal, key };
  }
  #mountRefBefore(ref, parent, refNode) {
    const marker = document.createTextNode("");
    parent.insertBefore(marker, refNode);
    for (const r of ref.renderables) {
      if (Renderer.isRenderable(r)) {
        r.mountInto(parent, refNode);
      } else if (Renderer.isDomNode(r)) {
        parent.insertBefore(r, refNode);
      }
    }
    const nodes = [];
    let cur = marker.nextSibling;
    while (cur && cur !== refNode) {
      nodes.push(cur);
      cur = cur.nextSibling;
    }
    marker.remove();
    ref.nodes = nodes;
    this.#wireSyncToObservableArray(ref);
  }
  #refNodeAt(index) {
    for (let i = index; i < this.#itemRefs.length; i++) {
      if (this.#itemRefs[i].nodes.length) return this.#itemRefs[i].nodes[0];
    }
    return this.#anchor;
  }
  #insert(index, item) {
    const refNode = this.#refNodeAt(index);
    const parent = this.#anchor.parentNode;
    const marker = document.createTextNode("");
    parent.insertBefore(marker, refNode);
    const itemState = this.#createItemState(index, item);
    const indexSignal = signal(index);
    const rendered = this.#renderItem ? this.#renderItem(itemState, indexSignal) : item;
    const renderables = Renderer.normalize(rendered);
    for (const r of renderables) {
      if (Renderer.isRenderable(r)) {
        r.mountInto(parent, refNode);
      } else if (Renderer.isDomNode(r)) {
        parent.insertBefore(r, refNode);
      }
    }
    const nodes = [];
    let cur = marker.nextSibling;
    while (cur && cur !== refNode) {
      nodes.push(cur);
      cur = cur.nextSibling;
    }
    marker.remove();
    const ref = {
      nodes,
      renderables,
      state: itemState,
      index: indexSignal,
      key: this.#key ? this.#key(item, index) : null
    };
    this.#itemRefs.splice(index, 0, ref);
    this.#wireSyncToObservableArray(ref);
  }
  #insertBatch(index, items) {
    const refNode = this.#refNodeAt(index);
    const parent = this.#anchor.parentNode;
    const fragment = document.createDocumentFragment();
    const newRefs = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const idx = index + i;
      const itemState = this.#createItemState(idx, item);
      const indexSignal = signal(idx);
      const rendered = this.#renderItem ? this.#renderItem(itemState, indexSignal) : item;
      const renderables = Renderer.normalize(rendered);
      const startLen = fragment.childNodes.length;
      for (const r of renderables) {
        if (Renderer.isRenderable(r)) {
          r.mountInto(fragment, null);
        } else if (Renderer.isDomNode(r)) {
          fragment.appendChild(r);
        }
      }
      const nodes = [];
      for (let j = startLen; j < fragment.childNodes.length; j++) {
        nodes.push(fragment.childNodes[j]);
      }
      newRefs.push({
        nodes,
        renderables,
        state: itemState,
        index: indexSignal,
        key: this.#key ? this.#key(item, idx) : null
      });
    }
    parent.insertBefore(fragment, refNode);
    this.#itemRefs.splice(index, 0, ...newRefs);
    for (const ref of newRefs) this.#wireSyncToObservableArray(ref);
  }
  #remove(index, count) {
    const removed = this.#itemRefs.splice(index, count);
    for (const it of removed) {
      if (it.syncUnsub) it.syncUnsub();
      for (const r of it.renderables) Renderer.unmount(r);
      for (const n of it.nodes) if (n.parentNode) n.remove();
    }
  }
  #set(index, item) {
    const ref = this.#itemRefs[index];
    if (ref && ref.state) {
      ref.state.set(item);
      return;
    }
    this.#remove(index, 1);
    this.#insert(index, item);
  }
  #updateIndices(fromIndex) {
    for (let i = fromIndex; i < this.#itemRefs.length; i++) {
      const ref = this.#itemRefs[i];
      if (ref.index) setSignal(ref.index, i);
    }
  }
};
function list(items, renderItem, options) {
  return new ListNode(items, renderItem, options);
}

// src/core/dom/element.js
var voidElements = /* @__PURE__ */ new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr"
]);
var _tplCache = /* @__PURE__ */ new Map();
var _tplCacheMax = 512;
function getTemplate(html) {
  let tpl2 = _tplCache.get(html);
  if (tpl2) {
    _tplCache.delete(html);
    _tplCache.set(html, tpl2);
    return tpl2;
  }
  tpl2 = document.createElement("template");
  tpl2.innerHTML = html;
  _tplCache.set(html, tpl2);
  if (_tplCache.size > _tplCacheMax) {
    _tplCache.delete(_tplCache.keys().next().value);
  }
  return tpl2;
}
function setTemplateCacheSize(max) {
  _tplCacheMax = max;
  while (_tplCache.size > _tplCacheMax) {
    _tplCache.delete(_tplCache.keys().next().value);
  }
}
function escapeHtml(str) {
  if (str.indexOf("&") < 0 && str.indexOf("<") < 0 && str.indexOf(">") < 0) return str;
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(str) {
  if (str.indexOf("&") < 0 && str.indexOf('"') < 0) return str;
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
var ElementNode = class _ElementNode extends Renderable {
  tagName;
  props;
  children;
  #el = null;
  #unsubs = [];
  #styleUnsubs = [];
  #mounted = false;
  constructor(tagName, props = {}, children = []) {
    super();
    this.tagName = tagName;
    this.props = props || {};
    this.children = Array.isArray(children) ? children : [children];
    if (voidElements.has(tagName.toLowerCase())) this.children = [];
  }
  mountInto(parent, beforeNode) {
    if (this.#mounted) return;
    this.#mounted = true;
    const html = this.#tryCompileTemplate();
    if (html !== null) {
      const tpl2 = getTemplate(html);
      const el = tpl2.content.firstChild.cloneNode(true);
      this.#el = el;
      this.#applyDynamicProps(el);
      this.#bindTemplateChildren(el);
      parent.insertBefore(el, beforeNode);
    } else {
      const el = document.createElement(this.tagName);
      this.#el = el;
      this.#applyProps(el);
      this.#appendChildren(el);
      parent.insertBefore(el, beforeNode);
    }
  }
  unmount() {
    if (!this.#mounted) return;
    this.#mounted = false;
    for (const unsub of this.#unsubs) unsub();
    this.#unsubs = [];
    for (const unsub of this.#styleUnsubs) unsub();
    this.#styleUnsubs = [];
    this.#cleanupChildren();
    this.#el?.remove();
    this.#el = null;
  }
  #tryCompileTemplate() {
    const props = this.props;
    if (props) {
      if (props.textContent != null || props.innerHTML != null || props.format) return null;
    }
    const tag = this.tagName;
    let attrStr = "";
    if (props) {
      let first = true;
      for (const key in props) {
        const value = props[key];
        if (key === "node" || key === "children" || key === "content" || key === "format") continue;
        if (key === "style" || key === "textContent" || key === "innerHTML") continue;
        if (key.startsWith("on") && typeof value === "function") continue;
        if (isSignal(value) || isState(value) || isStatePath(value) || isWhen(value) || isComputed(value)) continue;
        if (key === "className" || key === "class") {
          if (value != null && value !== false) {
            attrStr += (first ? ' class="' : '" class="') + escapeAttr(String(value));
            first = false;
          }
          continue;
        }
        if (key === "htmlFor") {
          if (value != null && value !== false) {
            attrStr += (first ? ' for="' : '" for="') + escapeAttr(String(value));
            first = false;
          }
          continue;
        }
        if (value === true) {
          attrStr += " " + key;
          continue;
        }
        if (value === false || value == null) continue;
        attrStr += (first ? " " : '" ') + key + '="' + escapeAttr(String(value));
        first = false;
      }
      if (!first) attrStr += '"';
    }
    if (voidElements.has(tag.toLowerCase())) return "<" + tag + attrStr + ">";
    let childHtml = "";
    let lastWasText = false;
    for (let i = 0, len = this.children.length; i < len; i++) {
      const child = this.children[i];
      if (child == null || child === false) continue;
      if (child instanceof _ElementNode) {
        const r = child.#tryCompileTemplate();
        if (r === null) return null;
        childHtml += r;
        lastWasText = false;
      } else if (isSignal(child) || isState(child) || isStatePath(child)) {
        if (lastWasText) childHtml += "<!---->";
        childHtml += " ";
        lastWasText = true;
      } else if (typeof child === "string") {
        if (lastWasText) childHtml += "<!---->";
        childHtml += escapeHtml(child);
        lastWasText = true;
      } else if (typeof child === "number") {
        if (lastWasText) childHtml += "<!---->";
        childHtml += String(child);
        lastWasText = true;
      } else {
        return null;
      }
    }
    return "<" + tag + attrStr + ">" + childHtml + "</" + tag + ">";
  }
  #applyDynamicProps(el) {
    const props = this.props;
    if (!props) return;
    for (const key in props) {
      const rawValue = props[key];
      if (key === "style") {
        this.#applyStyle(el, rawValue);
        continue;
      }
      if (key.startsWith("on") && typeof rawValue === "function") {
        this.#setProp(el, key, rawValue);
        continue;
      }
      if (isWhen(rawValue)) {
        this.#applyPropAsWhen({ el, key, rawValue, formatConfig: null });
        continue;
      }
      if (isSignal(rawValue)) {
        this.#applyPropAsSignal({ el, key, rawValue, formatConfig: null });
        continue;
      }
      if (isState(rawValue) || isStatePath(rawValue) || isComputed(rawValue)) {
        this.#applyPropAsState({ el, key, rawValue, formatConfig: null });
        continue;
      }
    }
    if (props.node && (isState(props.node) || isStatePath(props.node))) {
      props.node.set(el);
    }
  }
  #bindTemplateChildren(el) {
    let domIdx = 0;
    let lastWasText = false;
    for (const child of this.children) {
      if (child == null || child === false) continue;
      const isEl = child instanceof _ElementNode;
      if (!isEl && lastWasText) domIdx++;
      if (isEl) {
        const childEl = el.childNodes[domIdx];
        child.#el = childEl;
        child.#mounted = true;
        child.#applyDynamicProps(childEl);
        child.#bindTemplateChildren(childEl);
        this.#unsubs.push(() => child.unmount());
        domIdx++;
        lastWasText = false;
      } else if (isSignal(child)) {
        this.#bindReactiveChild(el, domIdx, child, readSignal, subscribeSignal);
        domIdx++;
        lastWasText = true;
      } else if (isState(child) || isStatePath(child)) {
        this.#bindReactiveChild(el, domIdx, child, readState, subscribeState);
        domIdx++;
        lastWasText = true;
      } else if (typeof child === "string" || typeof child === "number") {
        domIdx++;
        lastWasText = true;
      }
    }
  }
  #bindReactiveChild(el, domIdx, child, read, subscribe2) {
    const placeholder = el.childNodes[domIdx];
    const initial = read(child);
    const isComplex = (v) => v != null && typeof v === "object";
    if (!isComplex(initial)) {
      let tn = placeholder;
      let anchor = null;
      let dynState = null;
      tn.nodeValue = Renderer.toText(initial);
      const unsub = subscribe2(child, () => {
        const next = read(child);
        if (anchor) {
          this.#renderDynamic(next, anchor, dynState);
        } else if (isComplex(next)) {
          anchor = createAnchor("r");
          tn.parentNode.replaceChild(anchor, tn);
          tn = null;
          dynState = { kind: "static", renderables: [], nodes: [] };
          this.#renderDynamic(next, anchor, dynState);
        } else {
          tn.nodeValue = Renderer.toText(next);
        }
      });
      if (unsub) this.#unsubs.push(() => {
        unsub();
        if (dynState) this.#cleanupDynamic(dynState);
      });
    } else {
      const anchor = createAnchor("r");
      placeholder.parentNode.replaceChild(anchor, placeholder);
      const dynState = { kind: "static", renderables: [], nodes: [] };
      this.#renderDynamic(initial, anchor, dynState);
      const unsub = subscribe2(child, () => {
        this.#renderDynamic(read(child), anchor, dynState);
      });
      if (unsub) this.#unsubs.push(() => {
        unsub();
        this.#cleanupDynamic(dynState);
      });
    }
  }
  renderToString(render) {
    const tag = this.tagName;
    const props = this.props || {};
    const lower = tag.toLowerCase();
    const attrParts = [];
    let innerHtml = null;
    let textContent = null;
    for (const [key, rawValue] of Object.entries(props)) {
      if (key === "node") continue;
      if (key === "children" || key === "content") continue;
      if (key === "format") continue;
      if (key.startsWith("on") && typeof rawValue === "function") continue;
      let value = rawValue;
      if (isWhen(value)) value = readWhenValue(value);
      if (isSignal(value)) value = readSignal(value);
      if (isState(value) || isStatePath(value) || isComputed(value)) value = readState(value);
      if (key === "style") {
        if (value && typeof value === "object") {
          const styles = [];
          for (const [k, v] of Object.entries(value)) {
            if (v == null || v === false) continue;
            const name = k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
            styles.push(`${name}:${v}`);
          }
          if (styles.length) attrParts.push(`style="${styles.join(";")}"`);
        } else if (typeof value === "string") {
          attrParts.push(`style="${render.escape(value)}"`);
        }
        continue;
      }
      if (key === "className" || key === "class") {
        if (value != null && value !== false) attrParts.push(`class="${render.escape(String(value))}"`);
        continue;
      }
      if (key === "htmlFor") {
        if (value != null && value !== false) attrParts.push(`for="${render.escape(String(value))}"`);
        continue;
      }
      if (key === "value" && lower === "input" && props.format != null) {
        const resolvedFormat = isSignal(props.format) ? readSignal(props.format) : isState(props.format) || isStatePath(props.format) || isComputed(props.format) ? readState(props.format) : props.format;
        const formatConfig = normalizeInputFormat(resolvedFormat);
        const formatMode = formatConfig?.mode ?? "both";
        const formatted = applyInputFormat(value ?? "", formatConfig);
        value = formatMode === "value-only" ? formatted.raw ?? formatted.value ?? "" : formatted.visual ?? formatted.value ?? "";
      }
      if (key === "textContent") {
        textContent = value == null ? "" : String(value);
        continue;
      }
      if (key === "innerHTML") {
        innerHtml = value == null ? "" : String(value);
        continue;
      }
      if (value === true) {
        attrParts.push(`${key}`);
        continue;
      }
      if (value === false || value == null) {
        continue;
      }
      attrParts.push(`${key}="${render.escape(String(value))}"`);
    }
    const attrs = attrParts.length ? ` ${attrParts.join(" ")}` : "";
    if (voidElements.has(lower)) {
      return `<${tag}${attrs}>`;
    }
    if (innerHtml != null) {
      return `<${tag}${attrs}>${innerHtml}</${tag}>`;
    }
    if (textContent != null) {
      return `<${tag}${attrs}>${render.escape(textContent)}</${tag}>`;
    }
    const children = Array.isArray(this.children) ? this.children : [this.children];
    const html = children.map((child) => render(child)).join("");
    return `<${tag}${attrs}>${html}</${tag}>`;
  }
  #cleanupChildren() {
    if (!this.#el) return;
    for (const child of Array.from(this.#el.childNodes)) child.remove();
  }
  #applyProps(el) {
    const props = this.props || {};
    const tagName = this.tagName.toLowerCase();
    let formatBound = false;
    let valueBound = false;
    const { formatConfig } = this.#getFormatConfig();
    for (const [key, rawValue] of Object.entries(props)) {
      if (key === "value") valueBound = true;
      if (key === "node") continue;
      if (key === "children" || key === "content") continue;
      if (key === "format") continue;
      if (key === "style") {
        this.#applyStyle(el, rawValue);
        continue;
      }
      const propCtx = { el, key, rawValue, formatConfig };
      if (isWhen(rawValue)) {
        this.#applyPropAsWhen(propCtx);
        continue;
      }
      if (isSignal(rawValue)) {
        if (key === "value" && formatConfig) formatBound = true;
        this.#applyPropAsSignal(propCtx);
        continue;
      }
      if (isState(rawValue) || isStatePath(rawValue)) {
        if (key === "value" && formatConfig) formatBound = true;
        this.#applyPropAsState(propCtx);
        continue;
      }
      if (key === "value" && formatConfig) {
        const { visualValue } = this.#formatValue(rawValue);
        this.#setProp(el, key, visualValue);
        formatBound = true;
        continue;
      }
      if ((key === "onInput" || key === "onChange") && typeof rawValue === "function" && formatConfig) {
        const handler = (ev) => {
          rawValue?.(ev, ev?.target?.rawValue);
        };
        this.#setProp(el, key, handler);
        continue;
      }
      if (key === "onInput" && !formatBound) {
        const onInput = (ev) => {
          if (formatConfig) {
            this.#applyPropsBaseOnInputFormatted(ev);
          }
          rawValue?.(ev);
        };
        this.#setProp(el, key, onInput);
        continue;
      }
      this.#setProp(el, key, rawValue);
    }
    if (!valueBound && formatConfig) {
      const onInput = (ev) => {
        const { visualValue } = this.#applyPropsBaseOnInputFormatted({ target: el });
        this.#setProp(el, "value", visualValue);
      };
      onInput();
      this.#applyPropsAddInputEventListeners(el, onInput, true);
      formatBound = true;
    }
    if (props.node && (isState(props.node) || isStatePath(props.node))) {
      props.node.set(this.#el);
    }
    if (formatConfig && !formatBound) {
      const onInput = (ev) => {
        this.#applyPropsBaseOnInputFormatted(ev);
      };
      this.#applyPropsAddInputEventListeners(el, onInput, true);
    }
  }
  #getFormatConfig() {
    const props = this.props || {};
    const tagName = this.tagName.toLowerCase();
    const resolveFormat = (value) => {
      if (isSignal(value)) return readSignal(value);
      if (isState(value) || isStatePath(value)) return readState(value);
      return value;
    };
    const formatConfig = tagName === "input" ? normalizeInputFormat(resolveFormat(props.format)) : null;
    const formatMode = formatConfig?.mode ?? "both";
    return { formatConfig, formatMode };
  }
  #formatValue(next) {
    const { formatConfig, formatMode } = this.#getFormatConfig();
    const formatted = applyInputFormat(next ?? "", formatConfig);
    const visualValue = formatMode === "value-only" ? formatted.raw ?? formatted.value ?? "" : formatted.visual ?? formatted.value ?? "";
    const stateValue = formatMode === "visual-only" ? formatted.raw ?? formatted.value ?? "" : formatted.value ?? formatted.visual ?? "";
    return { formatted, visualValue, stateValue };
  }
  #applyPropsBaseOnInputFormatted(ev) {
    const { formatted, visualValue, stateValue } = this.#formatValue(ev.target.value ?? "");
    const rawValue = formatted?.raw ?? stateValue;
    ev.target.value = visualValue;
    ev.target.rawValue = rawValue;
    return { visualValue, stateValue, rawValue };
  }
  #applyPropsAddInputEventListeners(el, onInput, capture2) {
    el.addEventListener("input", onInput, capture2);
    el.addEventListener("change", onInput, capture2);
    this.#unsubs.push(() => {
      el.removeEventListener("input", onInput, capture2);
      el.removeEventListener("change", onInput, capture2);
    });
  }
  #applyPropsSubscribeUpdate({ key, el, rawValue, read, subscribe: subscribe2, formatConfig }) {
    const update = () => {
      const nextValue = read(rawValue);
      if (key === "value" && formatConfig) {
        const { visualValue } = this.#formatValue(nextValue);
        this.#setProp(el, key, visualValue);
        return;
      }
      this.#setProp(el, key, nextValue);
    };
    update();
    const unsub = subscribe2(rawValue, update);
    if (unsub) this.#unsubs.push(unsub);
    return update;
  }
  #applyPropAsWhen(props) {
    this.#applyPropsSubscribeUpdate({ ...props, read: readWhenValue, subscribe: subscribeWhenValue });
  }
  #applyPropAsSignal({ el, key, rawValue, formatConfig }) {
    const update = this.#applyPropsSubscribeUpdate({ key, el, rawValue, formatConfig, read: readSignal, subscribe: subscribeSignal });
    if (key === "value") {
      if (formatConfig) {
        const onInput = (ev) => {
          const { stateValue } = this.#applyPropsBaseOnInputFormatted(ev);
          if (isComputed(rawValue)) return;
          const ok = rawValue.set?.(stateValue);
          if (ok === false) update();
        };
        this.#applyPropsAddInputEventListeners(el, onInput, true);
      } else {
        const onInput = (ev) => {
          if (isComputed(rawValue)) return;
          const ok = rawValue.set?.(ev.target?.value ?? "");
          if (ok === false) update();
        };
        this.#applyPropsAddInputEventListeners(el, onInput);
      }
    }
    if (key === "checked") {
      const onChange = (ev) => {
        if (isComputed(rawValue)) return;
        const ok = rawValue.set?.(!!ev.target?.checked);
        if (ok === false) update();
      };
      el.addEventListener("change", onChange);
      this.#unsubs.push(() => el.removeEventListener("change", onChange));
    }
  }
  #applyPropAsState({ el, key, rawValue, formatConfig }) {
    const update = this.#applyPropsSubscribeUpdate({ key, el, rawValue, formatConfig, read: readState, subscribe: subscribeState });
    if (key === "value") {
      if (formatConfig) {
        const onInput = (ev) => {
          const { stateValue } = this.#applyPropsBaseOnInputFormatted(ev);
          if (isComputed(rawValue)) return;
          const ok = rawValue.set?.(stateValue);
          if (ok === false) update();
        };
        this.#applyPropsAddInputEventListeners(el, onInput, true);
      } else {
        const onInput = (ev) => {
          if (isComputed(rawValue)) return;
          const ok = rawValue.set?.(ev.target?.value ?? "");
          if (ok === false) update();
        };
        this.#applyPropsAddInputEventListeners(el, onInput);
      }
    }
    if (key === "checked") {
      const onChange = (ev) => {
        if (isComputed(rawValue)) return;
        const ok = rawValue.set?.(!!ev.target?.checked);
        if (ok === false) update();
      };
      el.addEventListener("change", onChange);
      this.#unsubs.push(() => el.removeEventListener("change", onChange));
    }
  }
  #setProp(el, key, value) {
    if (isWhen(value)) value = readWhenValue(value);
    if (isSignal(value)) value = readSignal(value);
    if (isState(value) || isStatePath(value)) value = readState(value);
    if (key === "style") {
      if (value && typeof value === "object") {
        Object.assign(el.style, value);
        return;
      }
      if (typeof value === "string") {
        el.style.cssText = value;
        return;
      }
    }
    if (key.startsWith("on") && typeof value === "function") {
      const eventName = key.substring(2).toLowerCase();
      el.addEventListener(eventName, value);
      this.#unsubs.push(() => el.removeEventListener(eventName, value));
      return;
    }
    if (key === "className" || key === "class") {
      el.className = value ?? "";
      return;
    }
    if (key === "htmlFor") {
      el.setAttribute("for", value ?? "");
      return;
    }
    if (key === "value") {
      try {
        el.value = value ?? "";
      } catch {
      }
      return;
    }
    if (key === "checked") {
      try {
        el.checked = !!value;
      } catch {
      }
      return;
    }
    if (key === "contentEditable") {
      try {
        el.contentEditable = value ? "true" : "false";
      } catch {
      }
      return;
    }
    if (key === "textContent") {
      el.textContent = value ?? "";
      return;
    }
    if (key === "innerHTML") {
      el.innerHTML = value ?? "";
      return;
    }
    if (value === false || value == null) {
      el.removeAttribute(key);
      if (key in el) {
        try {
          el[key] = false;
        } catch {
        }
      }
      return;
    }
    if (value === true) {
      el.setAttribute(key, "");
      if (key in el) {
        try {
          el[key] = true;
        } catch {
        }
      }
      return;
    }
    el.setAttribute(key, value);
    if (key in el) {
      try {
        el[key] = value;
      } catch {
      }
    }
  }
  #applyStyle(el, styleValue) {
    const cleanupStyleSubs = () => {
      for (const unsub of this.#styleUnsubs) unsub();
      this.#styleUnsubs = [];
    };
    const applyValue = (value) => {
      if (typeof value === "string") {
        cleanupStyleSubs();
        el.style.cssText = value;
        return;
      }
      if (value && typeof value === "object") {
        cleanupStyleSubs();
        applyObject(value);
      }
    };
    const applyObject = (styleObj) => {
      if (!styleObj || typeof styleObj !== "object") return;
      for (const [k, v] of Object.entries(styleObj)) {
        if (typeof v === "function") {
          try {
            el.style[k] = v();
          } catch {
            el.style[k] = "";
          }
          continue;
        }
        if (isSignal(v)) {
          const update = () => {
            try {
              el.style[k] = readSignal(v) ?? "";
            } catch {
              el.style[k] = "";
            }
          };
          update();
          const unsub = subscribeSignal(v, update);
          if (unsub) this.#styleUnsubs.push(unsub);
          continue;
        }
        if (isState(v) || isStatePath(v)) {
          const update = () => {
            try {
              el.style[k] = readState(v) ?? "";
            } catch {
              el.style[k] = "";
            }
          };
          update();
          const unsub = subscribeState(v, update);
          if (unsub) this.#styleUnsubs.push(unsub);
          continue;
        } else {
          el.style[k] = v ?? "";
        }
      }
    };
    cleanupStyleSubs();
    if (isSignal(styleValue)) {
      const update = () => applyValue(readSignal(styleValue));
      update();
      const unsub = subscribeSignal(styleValue, update);
      if (unsub) this.#unsubs.push(unsub);
      return;
    }
    if (isState(styleValue) || isStatePath(styleValue)) {
      const update = () => applyValue(readState(styleValue));
      update();
      const unsub = subscribeState(styleValue, update);
      if (unsub) this.#unsubs.push(unsub);
      return;
    }
    if (typeof styleValue === "function") {
      try {
        applyValue(styleValue());
      } catch {
        return;
      }
      return;
    }
    applyValue(styleValue);
  }
  #appendChildren(el) {
    const content = Object.prototype.hasOwnProperty.call(this.props, "content") ? this.props.content : null;
    const children = this.children.length ? this.children : content != null ? [content] : [];
    for (const child of children) this.#mountChild(el, child, null);
  }
  #mountChild(parent, child, beforeNode) {
    if (child == null || child === false) return;
    const mapped = getMappedArrayMeta(child) || getMappedMeta(child);
    if (mapped) {
      const anchor = createAnchor("map");
      parent.insertBefore(anchor, beforeNode);
      const dynState = { kind: "static", renderables: [], nodes: [] };
      const update = () => {
        const src = mapped.path ? readStateMeta(mapped) : readSignal(mapped.signal);
        const list2 = Array.isArray(src) ? src.map(mapped.mapFn) : [];
        this.#renderDynamic(list2, anchor, dynState);
      };
      update();
      const unsub = mapped.path ? subscribeStateMeta(mapped, update) : subscribeSignal(mapped.signal, update);
      if (unsub) this.#unsubs.push(() => {
        unsub();
        this.#cleanupDynamic(dynState);
        anchor.remove();
      });
      return;
    }
    if (isSignal(child)) {
      const anchor = createAnchor("sig");
      parent.insertBefore(anchor, beforeNode);
      const dynState = { kind: "static", renderables: [], nodes: [] };
      const update = () => this.#renderDynamic(readSignal(child), anchor, dynState);
      update();
      const unsub = subscribeSignal(child, update);
      if (unsub) this.#unsubs.push(() => {
        unsub();
        this.#cleanupDynamic(dynState);
        anchor.remove();
      });
      return;
    }
    if (isState(child) || isStatePath(child)) {
      const anchor = createAnchor("st");
      parent.insertBefore(anchor, beforeNode);
      const dynState = { kind: "static", renderables: [], nodes: [] };
      const update = () => this.#renderDynamic(readState(child), anchor, dynState);
      update();
      const unsub = subscribeState(child, update);
      if (unsub) this.#unsubs.push(() => {
        unsub();
        this.#cleanupDynamic(dynState);
        anchor.remove();
      });
      return;
    }
    if (isObservableArray(child)) {
      const anchor = createAnchor("ol");
      parent.insertBefore(anchor, beforeNode);
      const dynState = { kind: "list", items: [], unsub: null, source: child };
      this.#renderDynamic(child, anchor, dynState);
      this.#unsubs.push(() => {
        this.#cleanupDynamic(dynState);
        anchor.remove();
      });
      return;
    }
    if (Array.isArray(child)) {
      for (const item of child) this.#mountChild(parent, item, beforeNode);
      return;
    }
    if (Renderer.isRenderable(child)) {
      child.mountInto(parent, beforeNode);
      this.#unsubs.push(() => child.unmount());
      return;
    }
    if (Renderer.isDomNode(child)) {
      parent.insertBefore(child, beforeNode);
      return;
    }
    parent.insertBefore(document.createTextNode(Renderer.toText(child)), beforeNode);
  }
  #cleanupDynamic(dynState) {
    if (dynState.kind === "static") {
      for (const r of dynState.renderables) Renderer.unmount(r);
      dynState.renderables = [];
      for (const n of dynState.nodes) if (n.parentNode) n.remove();
      dynState.nodes = [];
      return;
    }
    if (dynState.kind === "list") {
      dynState.unsub?.();
      for (const it of dynState.items) {
        for (const r of it.renderables) Renderer.unmount(r);
        for (const n of it.nodes) if (n.parentNode) n.remove();
      }
      dynState.items = [];
    }
  }
  #collectNodes(marker, anchor) {
    const nodes = [];
    let cur = marker.nextSibling;
    while (cur && cur !== anchor) {
      nodes.push(cur);
      cur = cur.nextSibling;
    }
    marker.remove();
    return nodes;
  }
  #mountAndCollect(renderables, parent, anchor) {
    const marker = document.createTextNode("");
    parent.insertBefore(marker, anchor);
    for (const r of renderables) {
      if (Renderer.isRenderable(r)) {
        r.mountInto(parent, anchor);
      } else if (Renderer.isDomNode(r)) {
        parent.insertBefore(r, anchor);
      }
    }
    return this.#collectNodes(marker, anchor);
  }
  #renderDynamic(value, anchor, dynState) {
    if (isObservableArray(value)) {
      if (dynState.kind === "list" && dynState.source === value) return;
      this.#cleanupDynamic(dynState);
      dynState.kind = "list";
      dynState.source = value;
      const parent = anchor.parentNode;
      const items = [];
      const refNodeAt = (idx) => {
        for (let i = idx; i < items.length; i++) {
          if (items[i].nodes.length) return items[i].nodes[0];
        }
        return anchor;
      };
      const makeItemMount = (idx, rawItem) => {
        const refNode = refNodeAt(idx);
        const renderables2 = Renderer.normalize(rawItem);
        const nodes = this.#mountAndCollect(renderables2, parent, refNode);
        items.splice(idx, 0, { renderables: renderables2, nodes });
      };
      const removeItemMount = (idx, count) => {
        const removed = items.splice(idx, count);
        for (const it of removed) {
          for (const r of it.renderables) Renderer.unmount(r);
          for (const n of it.nodes) if (n.parentNode) n.remove();
        }
      };
      const setItemMount = (idx, rawItem) => {
        removeItemMount(idx, 1);
        makeItemMount(idx, rawItem);
      };
      for (let i = 0; i < value.length; i++) makeItemMount(i, value[i]);
      const unsub = value.subscribe((patch) => {
        if (!this.#mounted) return;
        if (patch.type === "reset") {
          removeItemMount(0, items.length);
          for (let i = 0; i < patch.items.length; i++) makeItemMount(i, patch.items[i]);
          return;
        }
        if (patch.type === "insert") {
          for (let i = 0; i < patch.items.length; i++) makeItemMount(patch.index + i, patch.items[i]);
          return;
        }
        if (patch.type === "remove") {
          removeItemMount(patch.index, patch.count);
          return;
        }
        if (patch.type === "set") setItemMount(patch.index, patch.value);
      });
      dynState.items = items;
      dynState.unsub = unsub;
      return;
    }
    if (Array.isArray(value)) {
      this.#cleanupDynamic(dynState);
      dynState.kind = "static";
      const renderables2 = Renderer.normalize(value);
      dynState.renderables = renderables2;
      dynState.nodes = this.#mountAndCollect(renderables2, anchor.parentNode, anchor);
      return;
    }
    this.#cleanupDynamic(dynState);
    dynState.kind = "static";
    const renderables = Renderer.normalize(value);
    dynState.renderables = renderables;
    dynState.nodes = this.#mountAndCollect(renderables, anchor.parentNode, anchor);
  }
};

// src/core/reactivity/resolve.js
function resolve(value) {
  if (isSignal(value)) return readSignal(value);
  if (isState(value) || isStatePath(value)) return readState(value);
  return value;
}

// src/core/reactivity/computed.js
function asComputed(value) {
  if (isComputed(value)) return value;
  if (isSignal(value)) {
    const current = readSignal(value);
    if (typeof current === "function") {
      return (...args) => {
        const next = readSignal(value);
        if (typeof next === "function") return next(...args);
        return void 0;
      };
    }
    return after(value).compute((next) => next);
  }
  if (isState(value) || isStatePath(value)) {
    const current = readState(value);
    if (typeof current === "function") {
      return (...args) => {
        const next = readState(value);
        if (typeof next === "function") return next(...args);
        return void 0;
      };
    }
    return after(value).compute((next) => next);
  }
  if (typeof value === "function") return value;
  return after(state(value)).compute((next) => next);
}
function computed(input) {
  if (isSignal(input) || isState(input) || isStatePath(input)) {
    return asComputed(input);
  }
  if (!input || typeof input !== "object") {
    return asComputed(input);
  }
  const cache = /* @__PURE__ */ new Map();
  return new Proxy(input, {
    get(target, prop) {
      if (typeof prop === "symbol") return target[prop];
      if (cache.has(prop)) return cache.get(prop);
      const value = target[prop];
      const resolved = asComputed(value);
      cache.set(prop, resolved);
      return resolved;
    }
  });
}

// src/core/reactivity/helpers.js
function liftBinary(a, b, fn) {
  const aReactive = isReactiveSource(a);
  const bReactive = isReactiveSource(b);
  if (!aReactive && !bReactive) return fn(a, b);
  if (aReactive && bReactive) {
    return after(a, b).compute(([av, bv]) => fn(av, bv));
  }
  if (aReactive) {
    return after(a).compute((av) => fn(av, b));
  }
  return after(b).compute((bv) => fn(a, bv));
}
function liftUnary(a, fn) {
  if (!isReactiveSource(a)) return fn(a);
  return after(a).compute((av) => fn(av));
}
function equals(a, b) {
  return liftBinary(a, b, (x, y) => x === y);
}
function differs(a, b) {
  return liftBinary(a, b, (x, y) => x !== y);
}
function like(a, b) {
  return liftBinary(a, b, (x, y) => x == y);
}
function unlike(a, b) {
  return liftBinary(a, b, (x, y) => x != y);
}
function bigger(a, b) {
  return liftBinary(a, b, (x, y) => x > y);
}
function smaller(a, b) {
  return liftBinary(a, b, (x, y) => x < y);
}
function atLeast(a, b) {
  return liftBinary(a, b, (x, y) => x >= y);
}
function atMost(a, b) {
  return liftBinary(a, b, (x, y) => x <= y);
}
function not(a) {
  return liftUnary(a, (x) => !x);
}
function and(...sources) {
  if (sources.length === 0) return true;
  for (const s of sources) {
    if (!isReactiveSource(s) && !s) return false;
  }
  const reactive = sources.filter(isReactiveSource);
  if (reactive.length === 0) return sources.every(Boolean);
  if (reactive.length === 1) {
    return after(reactive[0]).compute((v) => Boolean(v) && sources.every((s) => isReactiveSource(s) ? true : Boolean(s)));
  }
  return after(...reactive).compute((values) => {
    for (let i = 0, j = 0; i < sources.length; i++) {
      const s = sources[i];
      const v = isReactiveSource(s) ? values[j++] : s;
      if (!v) return false;
    }
    return true;
  });
}
function or(...sources) {
  if (sources.length === 0) return false;
  for (const s of sources) {
    if (!isReactiveSource(s) && s) return true;
  }
  const reactive = sources.filter(isReactiveSource);
  if (reactive.length === 0) return sources.some(Boolean);
  if (reactive.length === 1) {
    return after(reactive[0]).compute((v) => Boolean(v) || sources.some((s) => isReactiveSource(s) ? false : Boolean(s)));
  }
  return after(...reactive).compute((values) => {
    for (let i = 0, j = 0; i < sources.length; i++) {
      const s = sources[i];
      const v = isReactiveSource(s) ? values[j++] : s;
      if (v) return true;
    }
    return false;
  });
}
function derive(fn) {
  if (typeof fn !== "function") {
    throw new TypeError("derive() expects a function as argument.");
  }
  const { value: initial, deps: initialDeps } = collectDependencies(fn);
  const sig = signal(initial);
  const trackedDeps = /* @__PURE__ */ new Set();
  const unsubs = /* @__PURE__ */ new Map();
  const wireDep = (dep) => {
    if (trackedDeps.has(dep)) return;
    if (!isReactiveSource(dep)) return;
    const unsub = subscribeSource(dep, recompute);
    if (typeof unsub === "function") {
      trackedDeps.add(dep);
      unsubs.set(dep, unsub);
    }
  };
  function recompute() {
    const { value, deps } = collectDependencies(fn);
    setSignal(sig, value);
    for (const dep of deps) wireDep(dep);
  }
  for (const dep of initialDeps) wireDep(dep);
  const dispose = () => {
    for (const unsub of unsubs.values()) {
      try {
        unsub();
      } catch {
      }
    }
    unsubs.clear();
    trackedDeps.clear();
  };
  const wrapped = new Proxy(sig, {
    get(target, prop, receiver) {
      if (prop === "dispose") return dispose;
      return Reflect.get(target, prop, receiver);
    }
  });
  return wrapped;
}
var eq = equals;
var neq = differs;
var gt = bigger;
var gte = atLeast;
var lt = smaller;
var lte = atMost;

// src/core/reactivity/concat.js
function isObject3(value) {
  return value !== null && typeof value === "object";
}
function isReactive(value) {
  return isSignal(value) || isState(value) || isStatePath(value) || isComputed(value);
}
function isTuple(value) {
  if (!Array.isArray(value) || value.length !== 2) return false;
  const source = value[0];
  const mapper = value[1];
  if (isReactive(source)) return typeof mapper === "function" || typeof mapper === "string";
  return typeof mapper === "function" || typeof mapper === "string";
}
function normalizeParts(values, out = []) {
  for (const value of values) {
    if (isTuple(value)) {
      out.push(value);
      continue;
    }
    if (Array.isArray(value)) {
      normalizeParts(value, out);
      continue;
    }
    out.push(value);
  }
  return out;
}
function extractOptions(parts) {
  if (!parts.length) return { parts, options: { separator: "", filterFalsy: false } };
  const last = parts[parts.length - 1];
  if (isObject3(last) && !Array.isArray(last) && !isReactive(last) && (Object.prototype.hasOwnProperty.call(last, "separator") || Object.prototype.hasOwnProperty.call(last, "filterFalsy"))) {
    const options = {
      separator: last.separator ?? "",
      filterFalsy: last.filterFalsy ?? false
    };
    return { parts: parts.slice(0, -1), options };
  }
  return { parts, options: { separator: "", filterFalsy: false } };
}
function collectTargets(value, targets) {
  if (isReactive(value)) targets.push(value);
  if (Array.isArray(value) && value.length) {
    const source = value[0];
    if (isReactive(source)) targets.push(source);
  }
}
function resolvePart(part) {
  if (Array.isArray(part)) {
    const source = part[0];
    const mapper = part[1];
    const value = resolve(source);
    if (typeof mapper === "function") return mapper(value);
    if (typeof mapper === "string") return value ? mapper : "";
    return value;
  }
  if (typeof part === "function") return part();
  return resolve(part);
}
function concat(...input) {
  const normalized = normalizeParts(input);
  const { parts, options } = extractOptions(normalized);
  const targets = [];
  for (const part of parts) collectTargets(part, targets);
  const build = () => {
    const values = parts.map(resolvePart).map((value) => value == null ? "" : String(value));
    const filtered = options.filterFalsy ? values.filter(Boolean) : values;
    return filtered.join(options.separator);
  };
  if (!targets.length) return build();
  return after(targets).compute(build);
}
function tpl(strings, ...values) {
  const parts = [];
  for (let i = 0; i < strings.length; i++) {
    if (strings[i] !== "") parts.push(strings[i]);
    if (i < values.length) parts.push(values[i]);
  }
  return concat(...parts, { separator: "", filterFalsy: false });
}
function cls(strings, ...values) {
  const parts = [];
  for (let i = 0; i < strings.length; i++) {
    if (strings[i] !== "") parts.push(strings[i]);
    if (i < values.length) parts.push(values[i]);
  }
  const built = concat(...parts, { separator: "", filterFalsy: false });
  if (typeof built === "string") return built.replace(/\s+/g, " ").trim();
  return after(built).compute((str) => String(str ?? "").replace(/\s+/g, " ").trim());
}

// src/core/reactivity/persist.js
function isStoreLike(value) {
  return !!value && typeof value === "object" && typeof value.getState === "function" && typeof value.setState === "function" && typeof value.subscribe === "function";
}
function isStateLike(value) {
  return isState(value) || isStatePath(value);
}
function getAtPath2(obj, path) {
  let cur = obj;
  for (const key of path) {
    if (!cur) return void 0;
    cur = cur[key];
  }
  return cur;
}
function setAtPath2(obj, path, value) {
  if (!path.length) return value;
  const root = Array.isArray(obj) ? obj.slice() : { ...obj || {} };
  let cur = root;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    const next = cur[key];
    const cloned = Array.isArray(next) ? next.slice() : { ...next || {} };
    cur[key] = cloned;
    cur = cloned;
  }
  cur[path[path.length - 1]] = value;
  return root;
}
function normalizePaths(paths) {
  if (!paths || !paths.length) return null;
  return paths.map((p) => String(p).split(".").map((s) => s.trim()).filter(Boolean));
}
function pickPaths(value, pathList) {
  if (!pathList) return value;
  let next = value;
  for (const path of pathList) {
    const v = getAtPath2(value, path);
    next = setAtPath2(next, path, v);
  }
  return next;
}
function defaultSerialize(value) {
  return JSON.stringify(value, (_key, v) => {
    if (typeof v === "function") return void 0;
    if (typeof v === "symbol") return void 0;
    return v;
  });
}
function defaultDeserialize(text) {
  return JSON.parse(text);
}
function readSnapshot(target, pathList) {
  if (isStateLike(target)) return pickPaths(readState(target), pathList);
  if (isObservableArray(target)) return pickPaths(target.slice(), pathList);
  if (isStoreLike(target)) return pickPaths(target.getState(), pathList);
  throw new Error("persist(target): unsupported target");
}
function applySnapshot(target, snapshot) {
  if (isStateLike(target)) {
    setStateValue(target, snapshot);
    return;
  }
  if (isObservableArray(target)) {
    target.reset(Array.isArray(snapshot) ? snapshot : []);
    return;
  }
  if (isStoreLike(target)) {
    target.setState(snapshot, true);
    return;
  }
  throw new Error("persist(target): unsupported target");
}
function subscribeChanges(target, fn) {
  if (isStateLike(target)) return after(target).change(fn);
  if (isObservableArray(target)) return after(target).change(fn);
  if (isStoreLike(target)) return target.subscribe(fn);
  throw new Error("persist(target): unsupported target");
}
function safeStorage(storage) {
  try {
    if (!storage || typeof storage.getItem !== "function") return null;
    return storage;
  } catch {
    return null;
  }
}
function persist(target, options = {}) {
  const key = options.key;
  if (!key) throw new Error("persist(target): options.key is required");
  const storage = safeStorage(options.storage ?? (typeof localStorage !== "undefined" ? localStorage : null));
  const pathList = normalizePaths(options.paths);
  const serialize = options.serialize || defaultSerialize;
  const deserialize = options.deserialize || defaultDeserialize;
  const version = options.version ?? 1;
  const migrate = options.migrate || null;
  const reconcile = options.reconcile || null;
  const throttleMs = Math.max(0, options.throttle ?? 0);
  if (!storage) throw new Error("persist(target): no storage available");
  const raw = storage.getItem(key);
  if (raw != null) {
    let payload = null;
    try {
      payload = deserialize(raw);
    } catch {
      payload = null;
    }
    if (payload != null) {
      let data = payload;
      let v = null;
      if (payload && typeof payload === "object" && "data" in payload && "v" in payload) {
        data = payload.data;
        v = payload.v;
      }
      if (v != null && v !== version && typeof migrate === "function") {
        data = migrate(data, v);
      }
      if (typeof reconcile === "function") {
        data = reconcile(data);
      }
      if (data !== void 0) {
        applySnapshot(target, data);
      }
    }
  }
  let scheduled = false;
  let lastTimer = null;
  const write = () => {
    scheduled = false;
    const snapshot = readSnapshot(target, pathList);
    const payload = { v: version, data: snapshot };
    try {
      storage?.setItem?.(key, serialize(payload));
    } catch {
      return;
    }
  };
  if (!raw) {
    write();
  }
  const scheduleWrite = () => {
    if (!storage) return;
    if (throttleMs <= 0) {
      write();
      return;
    }
    if (scheduled) return;
    scheduled = true;
    lastTimer = setTimeout(write, throttleMs);
  };
  const unsubscribe = subscribeChanges(target, scheduleWrite);
  Object.defineProperty(target, "persistDispose", {
    value: () => {
      if (lastTimer) clearTimeout(lastTimer);
      if (typeof unsubscribe === "function") unsubscribe();
    },
    enumerable: false
  });
  return target;
}

// src/core/forms/form.js
function isObject4(value) {
  return value !== null && typeof value === "object";
}
function cloneValue(value) {
  if (!isObject4(value)) return value;
  if (Array.isArray(value)) return value.map(cloneValue);
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = cloneValue(v);
  }
  return out;
}
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (!isObject4(a) || !isObject4(b)) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}
function mergeErrors(target, value) {
  if (value == null || value === true) return target;
  if (value === false) {
    target._form = true;
    return target;
  }
  if (typeof value === "string") {
    target._form = value;
    return target;
  }
  if (isObject4(value)) {
    for (const [k, v] of Object.entries(value)) {
      target[k] = v;
    }
    return target;
  }
  return target;
}
function form(initial) {
  const initialSnapshot = cloneValue(initial);
  const values = state(cloneValue(initial));
  const meta = state({});
  const errors = state({});
  const touched = state({});
  const dirty = state(false);
  const validators = /* @__PURE__ */ new Set();
  let runId = 0;
  const runValidators = () => {
    const current = ++runId;
    const nextErrors = {};
    const snapshot = values.get();
    const tasks = [];
    for (const validator of validators) {
      try {
        const result = validator(snapshot);
        if (result && typeof result.then === "function") {
          tasks.push(
            result.then((value) => {
              mergeErrors(nextErrors, value);
            })
          );
        } else {
          mergeErrors(nextErrors, result);
        }
      } catch (err) {
        mergeErrors(nextErrors, err?.message || true);
      }
    }
    if (tasks.length) {
      Promise.all(tasks).then(() => {
        if (current !== runId) return;
        errors.set(nextErrors);
      });
      return;
    }
    errors.set(nextErrors);
  };
  after(values).change(() => {
    const isDirty = !deepEqual(values.get(), initialSnapshot);
    if (dirty.get() !== isDirty) dirty.set(isDirty);
    if (validators.size) runValidators();
  });
  const reset = () => {
    values.set(cloneValue(initialSnapshot));
    touched.set({});
    errors.set({});
    dirty.set(false);
    meta.set({});
  };
  return {
    values,
    meta,
    errors,
    touched,
    dirty,
    validators,
    reset
  };
}

// src/core/forms/schema.js
function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function getAt(obj, path) {
  if (!path) return obj;
  const keys = String(path).split(".");
  let cur = obj;
  for (const k of keys) {
    if (cur == null) return void 0;
    cur = cur[k];
  }
  return cur;
}
function setAt(obj, path, value) {
  const keys = String(path).split(".");
  const root = isPlainObject(obj) ? { ...obj } : {};
  let cur = root;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    cur[k] = isPlainObject(cur[k]) ? { ...cur[k] } : {};
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
  return root;
}
function defaultMessage(rule, params) {
  switch (rule) {
    case "required":
      return "This field is required";
    case "min":
      return `Must be at least ${params}`;
    case "max":
      return `Must be at most ${params}`;
    case "minLength":
      return `Must be at least ${params} characters`;
    case "maxLength":
      return `Must be at most ${params} characters`;
    case "pattern":
      return "Invalid format";
    case "email":
      return "Invalid email address";
    case "url":
      return "Invalid URL";
    case "oneOf":
      return `Must be one of: ${(params || []).join(", ")}`;
    default:
      return "Invalid value";
  }
}
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
var URL_RE = /^(https?:\/\/)?[^\s.]+\.[^\s]{2,}$/i;
function applyRule(rule, value, params) {
  switch (rule) {
    case "required":
      if (value === void 0 || value === null) return false;
      if (typeof value === "string" && value.trim() === "") return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    case "min":
      return typeof value === "number" ? value >= params : true;
    case "max":
      return typeof value === "number" ? value <= params : true;
    case "minLength":
      return value == null ? true : String(value).length >= params;
    case "maxLength":
      return value == null ? true : String(value).length <= params;
    case "pattern":
      return value == null || value === "" ? true : new RegExp(params).test(String(value));
    case "email":
      return value == null || value === "" ? true : EMAIL_RE.test(String(value));
    case "url":
      return value == null || value === "" ? true : URL_RE.test(String(value));
    case "oneOf":
      return value == null ? true : (params || []).includes(value);
    default:
      return true;
  }
}
function fieldRules(fieldSchema) {
  const rules = [];
  if (!fieldSchema || typeof fieldSchema !== "object") return rules;
  const messages = fieldSchema.messages || {};
  const opts2 = fieldSchema.rules || fieldSchema;
  const known = ["required", "min", "max", "minLength", "maxLength", "pattern", "email", "url", "oneOf"];
  for (const rule of known) {
    if (opts2[rule] === void 0 || opts2[rule] === false) continue;
    rules.push({ rule, params: opts2[rule], message: messages[rule] });
  }
  if (Array.isArray(fieldSchema.validate)) {
    for (const fn of fieldSchema.validate) rules.push({ rule: "custom", fn, message: messages.custom });
  } else if (typeof fieldSchema.validate === "function") {
    rules.push({ rule: "custom", fn: fieldSchema.validate, message: messages.custom });
  }
  return rules;
}
function buildInitialValues(schema) {
  const out = {};
  for (const [path, def] of Object.entries(schema)) {
    if (def && Object.prototype.hasOwnProperty.call(def, "initial")) {
      const target = setAt(out, path, def.initial);
      Object.assign(out, target);
    }
  }
  return out;
}
function formSchema(schema, options = {}) {
  const initial = options.initial ? { ...buildInitialValues(schema), ...options.initial } : buildInitialValues(schema);
  const f = form(initial);
  const fieldRulesMap = /* @__PURE__ */ new Map();
  for (const [path, def] of Object.entries(schema)) {
    fieldRulesMap.set(path, fieldRules(def));
  }
  const schemaValidator = (snapshot) => {
    const errs = {};
    for (const [path, rules] of fieldRulesMap) {
      const value = getAt(snapshot, path);
      for (const r of rules) {
        let ok = true;
        if (r.rule === "custom") {
          try {
            ok = r.fn(value, snapshot) !== false && !(typeof r.fn(value, snapshot) === "string");
          } catch {
            ok = false;
          }
          const result = (() => {
            try {
              return r.fn(value, snapshot);
            } catch (e) {
              return e?.message || false;
            }
          })();
          if (typeof result === "string") {
            errs[path] = result;
            break;
          }
          if (result === false) {
            errs[path] = r.message || defaultMessage("custom");
            break;
          }
        } else {
          ok = applyRule(r.rule, value, r.params);
          if (!ok) {
            errs[path] = r.message || defaultMessage(r.rule, r.params);
            break;
          }
        }
      }
    }
    return errs;
  };
  f.validators.add(schemaValidator);
  const touchedState = f.touched;
  const errorsState = f.errors;
  const valuesState = f.values;
  const setValue = (path, value) => {
    valuesState.set(setAt(valuesState.get(), path, value));
  };
  const setTouched = (path, isTouched = true) => {
    touchedState.set(setAt(touchedState.get(), path, isTouched));
  };
  const field = (path) => ({
    value: after(valuesState).compute(() => getAt(valuesState.get(), path)),
    error: after(errorsState, touchedState).compute(([errs, touched]) => {
      const wasTouched = getAt(touched, path);
      if (!wasTouched && !options.validateOnMount) return null;
      return errs[path] ?? null;
    }),
    touched: after(touchedState).compute(() => Boolean(getAt(touchedState.get(), path))),
    setValue: (value) => setValue(path, value),
    setTouched: (v = true) => setTouched(path, v),
    valid: after(errorsState).compute((errs) => !errs[path])
  });
  const errorMessage = (path) => after(errorsState, touchedState).compute(([errs, touched]) => {
    const wasTouched = getAt(touched, path);
    if (!wasTouched && !options.validateOnMount) return null;
    return errs[path] ?? null;
  });
  const valid = after(errorsState).compute((errs) => Object.keys(errs).length === 0);
  const validate = () => {
    const errs = schemaValidator(valuesState.get());
    errorsState.set(errs);
    return Object.keys(errs).length === 0;
  };
  const touchAll = () => {
    const next = {};
    for (const path of fieldRulesMap.keys()) {
      Object.assign(next, setAt(next, path, true));
    }
    touchedState.set(next);
  };
  const submit = (handler) => async (event) => {
    if (event && typeof event.preventDefault === "function") event.preventDefault();
    touchAll();
    const ok = validate();
    if (!ok) return { ok: false, errors: errorsState.get() };
    const result = await handler(valuesState.get());
    return { ok: true, result };
  };
  if (options.validateOnMount) validate();
  return {
    ...f,
    field,
    errorMessage,
    valid,
    validate,
    touchAll,
    submit,
    setValue,
    setTouched
  };
}

// src/core/dom/match.js
function normalizeSources(sources) {
  return Array.isArray(sources) ? sources : [sources];
}
var MatchNode = class extends Renderable {
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
    this.#anchor = createAnchor("match");
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
    const seen = /* @__PURE__ */ new Set();
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
    const marker = document.createTextNode("");
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
};
function match(sources, predicate, renderTrue, renderFalse) {
  if (typeof predicate !== "function") {
    throw new Error("match(sources, predicate, renderTrue, renderFalse?): predicate must be a function");
  }
  if (typeof renderTrue !== "function") {
    throw new Error("match(sources, predicate, renderTrue, renderFalse?): renderTrue must be a function");
  }
  if (renderFalse != null && typeof renderFalse !== "function") {
    throw new Error("match(sources, predicate, renderTrue, renderFalse?): renderFalse must be a function");
  }
  return new MatchNode(sources, predicate, renderTrue, renderFalse);
}

// src/core/dom/error-boundary.js
var ErrorBoundaryNode = class extends Renderable {
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
    this.#anchor = createAnchor("error");
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
    const marker = document.createTextNode("");
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
      const value = typeof this.#child === "function" ? this.#child() : this.#child;
      this.#renderValue(value);
    } catch (error) {
      this.#handleError(error);
    }
  }
  #handleError(error) {
    try {
      if (typeof this.#onError === "function") {
        this.#onError(error, { phase: "render" });
      }
    } catch {
    }
    try {
      if (this.#fallback) {
        const value = typeof this.#fallback === "function" ? this.#fallback(error) : this.#fallback;
        this.#renderValue(value);
      }
    } catch {
    }
  }
  renderToString(render) {
    try {
      const value = typeof this.#child === "function" ? this.#child() : this.#child;
      return render(value);
    } catch (error) {
      if (typeof this.#onError === "function") {
        try {
          this.#onError(error, { phase: "render" });
        } catch {
        }
      }
      if (this.#fallback) {
        const fallback = typeof this.#fallback === "function" ? this.#fallback(error) : this.#fallback;
        return render(fallback);
      }
      return "";
    }
  }
};
function ErrorBoundary(options, child) {
  return new ErrorBoundaryNode(options, child);
}

// src/core/dom/virtual-list.js
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function isNumber(value) {
  return typeof value === "number" && !Number.isNaN(value);
}
var VirtualListNode = class extends Renderable {
  #items;
  #renderItem;
  #direction;
  #overscan;
  #itemSize;
  #container = null;
  #spacer = null;
  #itemsEl = null;
  #mounted = false;
  #unsub = null;
  #resizeObserver = null;
  #viewportSize = 0;
  #startIndex = 0;
  #endIndex = -1;
  #mountedValues = [];
  #measuring = false;
  constructor(items, options = {}) {
    super();
    this.#items = items;
    this.#renderItem = options.render;
    this.#direction = options.direction === "horizontal" ? "horizontal" : "vertical";
    this.#overscan = isNumber(options.overscan) ? Math.max(0, options.overscan) : 2;
    this.#itemSize = isNumber(options.itemSize) ? options.itemSize : null;
  }
  mountInto(parent, beforeNode) {
    if (this.#mounted) return;
    if (typeof this.#renderItem !== "function") {
      throw new Error("virtualList(items, options): options.render is required");
    }
    this.#mounted = true;
    const container = document.createElement("div");
    container.style.position = "relative";
    container.style.overflow = "auto";
    container.style.width = "100%";
    container.style.height = "100%";
    container.style.contain = "layout paint";
    const spacer = document.createElement("div");
    spacer.style.position = "relative";
    spacer.style.width = this.#direction === "horizontal" ? "0px" : "100%";
    spacer.style.height = this.#direction === "horizontal" ? "100%" : "0px";
    const itemsEl = document.createElement("div");
    itemsEl.style.position = "absolute";
    itemsEl.style.top = "0";
    itemsEl.style.left = "0";
    itemsEl.style.willChange = "transform";
    if (this.#direction === "horizontal") {
      itemsEl.style.display = "flex";
      itemsEl.style.flexDirection = "row";
    }
    container.appendChild(spacer);
    container.appendChild(itemsEl);
    parent.insertBefore(container, beforeNode);
    this.#container = container;
    this.#spacer = spacer;
    this.#itemsEl = itemsEl;
    container.addEventListener("scroll", this.#onScroll);
    this.#observeResize(parent);
    this.#updateViewport(parent);
    this.#render();
    this.#wire();
  }
  unmount() {
    if (!this.#mounted) return;
    this.#mounted = false;
    if (this.#unsub) this.#unsub();
    this.#unsub = null;
    if (this.#container) {
      this.#container.removeEventListener("scroll", this.#onScroll);
    }
    if (this.#resizeObserver) {
      this.#resizeObserver.disconnect();
      this.#resizeObserver = null;
    }
    this.#cleanup();
    this.#container?.remove();
    this.#container = null;
    this.#spacer = null;
    this.#itemsEl = null;
  }
  #readItems() {
    if (isObservableArray(this.#items)) return this.#items;
    if (isSignal(this.#items)) return readSignal(this.#items) || [];
    if (isState(this.#items) || isStatePath(this.#items)) return readState(this.#items) || [];
    return Array.isArray(this.#items) ? this.#items : [];
  }
  #wire() {
    if (isObservableArray(this.#items)) {
      this.#unsub = this.#items.subscribe(() => this.#render());
      return;
    }
    if (isSignal(this.#items)) {
      this.#unsub = subscribeSignal(this.#items, () => this.#render());
      return;
    }
    if (isState(this.#items) || isStatePath(this.#items)) {
      this.#unsub = subscribeState(this.#items, () => this.#render());
    }
  }
  #observeResize(parent) {
    if (typeof ResizeObserver === "undefined") return;
    this.#resizeObserver = new ResizeObserver(() => {
      this.#updateViewport(parent);
      this.#render();
    });
    this.#resizeObserver.observe(parent);
  }
  #updateViewport(parent) {
    const rect = parent?.getBoundingClientRect?.();
    if (!rect) return;
    this.#viewportSize = this.#direction === "horizontal" ? rect.width : rect.height;
  }
  #measureItemSize() {
    if (this.#itemSize != null) return;
    if (!this.#itemsEl) return;
    const first = this.#itemsEl.firstElementChild;
    if (!first) return;
    const rect = first.getBoundingClientRect();
    const size = this.#direction === "horizontal" ? rect.width : rect.height;
    if (isNumber(size) && size > 0) this.#itemSize = size;
  }
  #cleanup() {
    for (const r of this.#mountedValues) Renderer.unmount(r);
    this.#mountedValues = [];
    if (this.#itemsEl) this.#itemsEl.replaceChildren();
  }
  #renderRange(items, start, end, offset) {
    if (!this.#itemsEl) return;
    this.#cleanup();
    const slice = items.slice(start, end + 1);
    const values = [];
    for (let i = 0; i < slice.length; i++) {
      const index = start + i;
      const value = this.#renderItem(slice[i], index);
      const normalized = Renderer.normalize(value);
      for (const r of normalized) values.push(r);
    }
    this.#mountedValues = values;
    for (const r of values) {
      if (Renderer.isRenderable(r)) {
        r.mountInto(this.#itemsEl, null);
      } else if (Renderer.isDomNode(r)) {
        this.#itemsEl.appendChild(r);
      }
    }
    if (this.#direction === "horizontal") {
      this.#itemsEl.style.transform = `translateX(${offset}px)`;
    } else {
      this.#itemsEl.style.transform = `translateY(${offset}px)`;
    }
  }
  #render() {
    if (!this.#mounted || !this.#container) return;
    const items = this.#readItems();
    const count = items.length;
    if (!this.#spacer) return;
    if (count === 0) {
      this.#spacer.style.width = this.#direction === "horizontal" ? "0px" : "100%";
      this.#spacer.style.height = this.#direction === "horizontal" ? "100%" : "0px";
      this.#cleanup();
      return;
    }
    if (this.#itemSize == null && !this.#measuring) {
      this.#measuring = true;
      this.#renderRange(items, 0, 0, 0);
      requestAnimationFrame(() => {
        this.#measureItemSize();
        this.#measuring = false;
        this.#render();
      });
      return;
    }
    const size = this.#itemSize || 1;
    const viewport = this.#viewportSize || (this.#direction === "horizontal" ? this.#container.clientWidth : this.#container.clientHeight);
    const scrollPos = this.#direction === "horizontal" ? this.#container.scrollLeft : this.#container.scrollTop;
    const visibleCount = Math.ceil(viewport / size);
    const start = clamp(Math.floor(scrollPos / size) - this.#overscan, 0, Math.max(0, count - 1));
    const end = clamp(start + visibleCount + this.#overscan * 2 - 1, 0, count - 1);
    const offset = start * size;
    const total = count * size;
    if (this.#direction === "horizontal") {
      this.#spacer.style.width = `${total}px`;
      this.#spacer.style.height = "100%";
    } else {
      this.#spacer.style.height = `${total}px`;
      this.#spacer.style.width = "100%";
    }
    if (start === this.#startIndex && end === this.#endIndex) return;
    this.#startIndex = start;
    this.#endIndex = end;
    this.#renderRange(items, start, end, offset);
  }
  #onScroll = () => {
    this.#render();
  };
  renderToString(render) {
    const items = this.#readItems();
    return items.map((item, index) => render(this.#renderItem(item, index))).join("");
  }
};
function virtualList(items, options) {
  return new VirtualListNode(items, options);
}

// src/core/dom/portal.js
function resolveTarget(target) {
  if (!target && typeof document !== "undefined") return document.body;
  if (typeof target === "string") return document.querySelector(target);
  return target;
}
var PortalNode = class extends Renderable {
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
    if (!targetEl) throw new Error("portal: target not found");
    const value = typeof this.#content === "function" ? this.#content() : this.#content;
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
    const value = typeof this.#content === "function" ? this.#content() : this.#content;
    return render(value);
  }
};
function portal(target, content) {
  if (content === void 0) {
    return new PortalNode(null, target);
  }
  return new PortalNode(target, content);
}

// src/core/network/websocket.js
function defaultSerialize2(value) {
  if (typeof value === "string") return value;
  if (value instanceof ArrayBuffer) return value;
  if (value instanceof Blob) return value;
  return JSON.stringify(value);
}
function defaultParse(value) {
  return value;
}
function defaultDelay(attempt) {
  return Math.min(1e3 * Math.pow(2, Math.max(0, attempt - 1)), 1e4);
}
var WebSocketClient = class {
  #url;
  #protocols;
  #ws = null;
  #events = new EventHub();
  #state;
  #manualClose = false;
  #reconnectTimer = null;
  #serialize;
  #parse;
  #reconnect;
  #maxRetries;
  #delay;
  constructor(options = {}) {
    this.#url = options.url;
    this.#protocols = options.protocols;
    this.#serialize = typeof options.serialize === "function" ? options.serialize : defaultSerialize2;
    this.#parse = typeof options.parse === "function" ? options.parse : defaultParse;
    this.#reconnect = options.reconnect ?? true;
    this.#maxRetries = options.maxRetries ?? Infinity;
    this.#delay = typeof options.reconnectDelay === "function" ? options.reconnectDelay : defaultDelay;
    this.#state = state({
      status: "idle",
      connected: false,
      reconnecting: false,
      attempts: 0,
      lastMessage: null,
      lastError: null
    });
    if (options.autoConnect ?? true) {
      this.connect();
    }
  }
  state() {
    return this.#state;
  }
  before() {
    return this.#events.phase("before");
  }
  after() {
    return this.#events.phase("after");
  }
  setUrl(next) {
    this.#url = next;
  }
  connect() {
    if (!this.#url) throw new Error("WebSocketClient.connect: url is required");
    if (this.#ws && (this.#ws.readyState === WebSocket.OPEN || this.#ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.#clearReconnect();
    this.#manualClose = false;
    this.#state.set().status = "connecting";
    this.#state.set().reconnecting = false;
    const ws = new WebSocket(this.#url, this.#protocols);
    this.#ws = ws;
    ws.addEventListener("open", (event) => {
      this.#state.set().status = "open";
      this.#state.set().connected = true;
      this.#state.set().reconnecting = false;
      this.#state.set().attempts = 0;
      this.#events.emitAfter("open", { event }, { client: this });
    });
    ws.addEventListener("message", (event) => {
      let data = event.data;
      try {
        data = this.#parse(data);
      } catch (err) {
        this.#state.set().lastError = err;
        this.#events.emitAfter("error", { error: err }, { client: this });
        return;
      }
      const payload = { data, raw: event.data };
      const ok = this.#events.emitBefore("message", payload, { client: this });
      if (!ok) return;
      this.#state.set().lastMessage = data;
      this.#events.emitAfter("message", payload, { client: this });
    });
    ws.addEventListener("error", (event) => {
      this.#state.set().lastError = event;
      this.#events.emitAfter("error", { error: event }, { client: this });
    });
    ws.addEventListener("close", (event) => {
      this.#state.set().status = "closed";
      this.#state.set().connected = false;
      this.#events.emitAfter("close", { event }, { client: this });
      if (this.#manualClose) return;
      if (!this.#reconnect) return;
      this.#scheduleReconnect();
    });
  }
  send(value) {
    if (!this.#ws || this.#ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocketClient.send: socket is not open");
    }
    const payload = { data: value };
    const ok = this.#events.emitBefore("send", payload, { client: this });
    if (!ok) return;
    const raw = this.#serialize(value);
    this.#ws.send(raw);
    this.#events.emitAfter("send", { data: value, raw }, { client: this });
  }
  close(code, reason) {
    this.#manualClose = true;
    this.#clearReconnect();
    this.#ws?.close(code, reason);
  }
  #scheduleReconnect() {
    if (this.#reconnectTimer) return;
    const attempts = this.#state.get().attempts + 1;
    if (attempts > this.#maxRetries) return;
    this.#state.set().attempts = attempts;
    this.#state.set().reconnecting = true;
    const delay = Math.max(0, this.#delay(attempts));
    this.#events.emitAfter("reconnect", { attempt: attempts, delay }, { client: this });
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      this.connect();
    }, delay);
  }
  #clearReconnect() {
    if (!this.#reconnectTimer) return;
    clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = null;
  }
};
function createWebSocket(options) {
  return new WebSocketClient(options);
}

// src/core/renderable/render-string.js
function isRenderableLike(value) {
  return !!value && typeof value === "object" && typeof value.renderToString === "function";
}
function escapeHtml2(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function renderValue(value, render) {
  if (value == null || value === false) return "";
  if (Array.isArray(value)) return value.map((v) => render(v)).join("");
  if (isSignal(value)) return render(readSignal(value));
  if (isState(value) || isStatePath(value) || isComputed(value)) return render(readState(value));
  if (value instanceof Renderable && typeof value.renderToString === "function") {
    return value.renderToString(render);
  }
  if (value instanceof ElementNode) return value.renderToString(render);
  if (isRenderableLike(value)) return value.renderToString(render);
  if (Renderer.isDomNode(value)) {
    return value.outerHTML || "";
  }
  return escapeHtml2(Renderer.toText(value));
}
function renderToString(value) {
  const render = (v) => renderValue(v, render);
  render.escape = escapeHtml2;
  return render(value);
}
function hydrate(target, value) {
  const el = typeof target === "string" ? document.querySelector(target) : target;
  if (!el) throw new Error("hydrate(target): target not found");
  el.textContent = "";
  const values = Renderer.normalize(value);
  for (const r of values) {
    if (Renderer.isRenderable(r)) {
      r.mountInto(el, null);
    } else if (Renderer.isDomNode(r)) {
      el.appendChild(r);
    }
  }
}

// src/core/query/query-client.js
function defaultRetryDelay(attempt) {
  return 250 * Math.pow(2, Math.max(0, attempt - 1));
}
function normalizeKey(key) {
  if (Array.isArray(key)) return JSON.stringify(key);
  return JSON.stringify([key]);
}
function now() {
  return Date.now();
}
function buildQuery(query) {
  if (!query || typeof query !== "object") return "";
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (Array.isArray(v)) {
      for (const item of v) params.append(k, String(item));
    } else if (v != null) {
      params.set(k, String(v));
    }
  }
  const str = params.toString();
  return str ? `?${str}` : "";
}
function interpolatePath(path, params) {
  if (!params) return path;
  return String(path).replace(/:([A-Za-z0-9_]+)/g, (match2, key) => {
    if (!Object.prototype.hasOwnProperty.call(params, key)) {
      throw new Error(`Missing route param "${key}" for "${path}"`);
    }
    return encodeURIComponent(String(params[key]));
  });
}
function isPlainObject2(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  if (value instanceof FormData) return false;
  if (value instanceof URLSearchParams) return false;
  if (value instanceof Blob) return false;
  if (value instanceof ArrayBuffer) return false;
  return Object.prototype.toString.call(value) === "[object Object]";
}
async function parseResponse(res) {
  const type = res.headers.get("content-type") || "";
  if (type.includes("application/json")) return await res.json();
  return await res.text();
}
function compose(middlewares, core) {
  return async (ctx) => {
    let index = -1;
    const dispatch = async (i) => {
      if (i <= index) throw new Error("Middleware next() called multiple times");
      index = i;
      const fn = middlewares[i] || core;
      if (!fn) return void 0;
      if (fn === core) return await core(ctx);
      return await fn(ctx, () => dispatch(i + 1));
    };
    return await dispatch(0);
  };
}
function isStale(query) {
  if (query.invalidated) return true;
  if (query.updatedAt == null) return true;
  const st = query.staleTime ?? 0;
  return st === 0 ? true : now() - query.updatedAt > st;
}
var Query = class {
  key;
  fetcher;
  staleTime;
  cacheTime;
  refetchOnFocus;
  refetchOnReconnect;
  retry;
  retryDelay;
  dedupe;
  refetchOnInvalidate;
  #state = null;
  #inFlight = null;
  #abort = null;
  #gcTimer = null;
  #refCount = 0;
  #onGarbageCollect = null;
  constructor(options) {
    this.key = options.key;
    this.fetcher = options.fetcher;
    this.staleTime = options.staleTime ?? 0;
    this.cacheTime = options.cacheTime ?? 5 * 6e4;
    this.refetchOnFocus = options.refetchOnFocus ?? true;
    this.refetchOnReconnect = options.refetchOnReconnect ?? true;
    this.retry = options.retry ?? 0;
    this.retryDelay = options.retryDelay ?? defaultRetryDelay;
    this.dedupe = options.dedupe ?? true;
    this.refetchOnInvalidate = options.refetchOnInvalidate ?? true;
    this.#state = state({
      data: void 0,
      error: null,
      status: (
        /** @type {QueryStatus} */
        "idle"
      ),
      fetching: false,
      updatedAt: null,
      errorAt: null,
      invalidated: false
    });
  }
  get data() {
    return this.#state.get().data;
  }
  get error() {
    return this.#state.get().error;
  }
  get status() {
    return this.#state.get().status;
  }
  get fetching() {
    return this.#state.get().fetching;
  }
  get updatedAt() {
    return this.#state.get().updatedAt;
  }
  get errorAt() {
    return this.#state.get().errorAt;
  }
  get invalidated() {
    return this.#state.get().invalidated;
  }
  /**
   * @returns {boolean}
   */
  get isStale() {
    return isStale(this);
  }
  /**
   * Starts a fetch if needed.
   * - If `dedupe` is true and a request is already running, returns the existing promise.
   * - If data exists, keeps status as success but flips `fetching`.
   *
   * @returns {Promise<any>}
   */
  async refetch() {
    if (this.dedupe && this.#inFlight) return this.#inFlight;
    return await this.#runFetch({ force: true });
  }
  /**
   * Marks query as invalidated (stale).
   */
  invalidate() {
    this.setState({ invalidated: true });
    if (this.refetchOnInvalidate) this.refetch();
  }
  /**
   * Cancels an in-flight request.
   */
  cancel() {
    this.#abort?.abort();
  }
  /**
   * Internal: optionally triggers fetch depending on stale-ness.
   * @returns {Promise<any>|null}
   */
  ensure() {
    if (!this.isStale) return null;
    return this.#runFetch({ force: false });
  }
  /**
   * @override
   */
  subscribe(selectorOrListener, listener, equalityFn) {
    this.#refCount++;
    this.#clearGc();
    const unsub = this.#subscribe(selectorOrListener, listener, equalityFn);
    return () => {
      unsub();
      this.#refCount = Math.max(0, this.#refCount - 1);
      this.#scheduleGc();
    };
  }
  #scheduleGc() {
    if (this.#refCount > 0) return;
    const ct = this.cacheTime ?? 0;
    if (ct <= 0) return;
    this.#gcTimer = setTimeout(() => {
      if (this.#refCount > 0) return;
      this.cancel();
      this.#onGarbageCollect?.();
    }, ct);
  }
  #clearGc() {
    if (!this.#gcTimer) return;
    clearTimeout(this.#gcTimer);
    this.#gcTimer = null;
  }
  /**
   * Internal: set by QueryClient to evict cached queries.
   * @param {() => void} fn
   */
  setGcHandler(fn) {
    this.#onGarbageCollect = fn;
  }
  async #runFetch({ force }) {
    if (!force && !this.isStale) return this.data;
    if (this.dedupe && this.#inFlight) return this.#inFlight;
    const controller = new AbortController();
    this.#abort = controller;
    const ctx = { key: this.key, signal: controller.signal };
    const hadData = this.updatedAt != null;
    this.setState({
      fetching: true,
      status: hadData ? this.status : "loading",
      error: null
    });
    const run = async () => {
      const maxRetry = Math.max(0, this.retry ?? 0);
      for (let attempt = 1; attempt <= maxRetry + 1; attempt++) {
        try {
          const data = await this.fetcher(ctx);
          this.setState({
            data,
            error: null,
            status: "success",
            fetching: false,
            updatedAt: now(),
            errorAt: null,
            invalidated: false
          });
          return data;
        } catch (err) {
          if (controller.signal.aborted) {
            this.setState({ fetching: false });
            throw err;
          }
          if (attempt > maxRetry) {
            this.setState({
              error: err,
              status: "error",
              fetching: false,
              errorAt: now()
            });
            throw err;
          }
          const delay = this.retryDelay?.(attempt) ?? defaultRetryDelay(attempt);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
      return void 0;
    };
    this.#inFlight = run().finally(() => {
      this.#inFlight = null;
    });
    return this.#inFlight;
  }
  state() {
    return this.#state;
  }
  getState() {
    return this.#state.get();
  }
  setState(partial) {
    const current = this.#state.get();
    this.#state.set({ ...current, ...partial || {} });
  }
  #subscribe(selectorOrListener, listener, equalityFn) {
    if (typeof selectorOrListener === "function" && listener === void 0) {
      const l = selectorOrListener;
      return this.#state.subscribe((next, prev) => l(next, prev));
    }
    const selector = selectorOrListener;
    if (typeof selector !== "function" || typeof listener !== "function") {
      throw new Error("subscribe(selector, listener, equalityFn?): invalid arguments");
    }
    const eq2 = typeof equalityFn === "function" ? equalityFn : Object.is;
    let prevSelected = selector(this.#state.get());
    return this.#state.subscribe((next) => {
      const nextSelected = selector(next);
      if (eq2(prevSelected, nextSelected)) return;
      const p = prevSelected;
      prevSelected = nextSelected;
      listener(nextSelected, p);
    });
  }
};
var QueryClient = class {
  #queries = /* @__PURE__ */ new Map();
  // keyString -> Query
  #listening = false;
  #middlewares = [];
  constructor() {
    this.#ensureWindowListeners();
  }
  /**
   * Gets (or creates) a query instance for the given key.
   *
   * @param {QueryOptions} options
   * @returns {Store & QueryState & { refetch(): Promise<any>, invalidate(): void, cancel(): void, ensure(): (Promise<any>|null), isStale: boolean }}
   */
  query(options) {
    const keyStr = normalizeKey(options.key);
    const existing = this.#queries.get(keyStr);
    if (existing) {
      const p2 = existing.ensure();
      if (p2 && typeof p2.catch === "function") p2.catch(() => {
      });
      return existing;
    }
    const q = new Query(options);
    q.setGcHandler(() => this.#queries.delete(keyStr));
    this.#queries.set(keyStr, q);
    const p = q.ensure();
    if (p && typeof p.catch === "function") p.catch(() => {
    });
    return q;
  }
  use(middleware) {
    if (typeof middleware !== "function") {
      throw new Error("QueryClient.use(middleware): middleware must be a function");
    }
    this.#middlewares.push(middleware);
    return () => {
      const index = this.#middlewares.indexOf(middleware);
      if (index >= 0) this.#middlewares.splice(index, 1);
    };
  }
  service(config = {}) {
    const baseUrl = config.baseUrl || "";
    const serviceMiddlewares = Array.isArray(config.middlewares) ? config.middlewares.slice() : [];
    const endpoints = config.endpoints || {};
    const client = this;
    const request = async (endpoint, input = {}) => {
      if (!endpoint || typeof endpoint !== "object") {
        throw new Error("service.request(endpoint, params, options): invalid endpoint");
      }
      const params = input.params || {};
      const method = (endpoint.method || "GET").toUpperCase();
      const path = interpolatePath(endpoint.path || "", params);
      const query = input.query || endpoint.query || null;
      const body = input.body !== void 0 ? input.body : void 0;
      const headers = { ...endpoint.headers || {}, ...input.headers || {} };
      const map = input.map || endpoint.map || null;
      const middlewares = [
        ...client.#middlewares,
        ...serviceMiddlewares,
        ...endpoint.middlewares || [],
        ...input.middlewares || []
      ];
      const url = `${baseUrl}${path}${buildQuery(query)}`;
      const core = async (ctx2) => {
        const init = { method: ctx2.method, headers: ctx2.headers, signal: ctx2.signal };
        if (ctx2.body !== void 0 && ctx2.method !== "GET" && ctx2.method !== "HEAD") {
          if (isPlainObject2(ctx2.body)) {
            if (!init.headers["Content-Type"]) init.headers["Content-Type"] = "application/json";
            init.body = JSON.stringify(ctx2.body);
          } else {
            init.body = ctx2.body;
          }
        }
        const res = await fetch(ctx2.url, init);
        const data2 = await parseResponse(res);
        if (!res.ok) {
          const err = new Error(`Request failed: ${res.status}`);
          err.status = res.status;
          err.data = data2;
          throw err;
        }
        return data2;
      };
      const ctx = {
        method,
        url,
        path,
        baseUrl,
        headers,
        query,
        body,
        params,
        endpoint,
        signal: input.signal
      };
      const run = compose(middlewares, core);
      const data = await run(ctx);
      return typeof map === "function" ? map(data) : data;
    };
    const api = { request };
    for (const [name, def] of Object.entries(endpoints)) {
      api[name] = (input = {}) => request(def, input);
    }
    return api;
  }
  /**
   * Marks a query as invalidated.
   * @param {QueryKey} key
   */
  invalidate(key) {
    const q = this.#queries.get(normalizeKey(key));
    if (!q) return;
    q.invalidate();
  }
  /**
   * Refetches a query immediately.
   * @param {QueryKey} key
   * @returns {Promise<any>|null}
   */
  refetch(key) {
    const q = this.#queries.get(normalizeKey(key));
    if (!q) return null;
    return q.refetch();
  }
  /**
   * Removes a query from cache (cancels in-flight).
   * @param {QueryKey} key
   */
  remove(key) {
    const keyStr = normalizeKey(key);
    const q = this.#queries.get(keyStr);
    if (!q) return;
    q.cancel();
    this.#queries.delete(keyStr);
  }
  #ensureWindowListeners() {
    if (this.#listening) return;
    if (typeof window === "undefined") return;
    this.#listening = true;
    window.addEventListener("focus", () => {
      for (const q of this.#queries.values()) {
        if (!q.refetchOnFocus) continue;
        if (q.isStale) q.refetch();
      }
    });
    window.addEventListener("online", () => {
      for (const q of this.#queries.values()) {
        if (!q.refetchOnReconnect) continue;
        if (q.isStale) q.refetch();
      }
    });
  }
};

// src/core/router/router.js
function normalizeBase(basePath) {
  if (!basePath) return "";
  let base = basePath.trim();
  if (!base.startsWith("/")) base = `/${base}`;
  if (base.length > 1 && base.endsWith("/")) base = base.slice(0, -1);
  return base;
}
function normalizePathname(pathname, trailingSlash) {
  let path = pathname || "/";
  if (!path.startsWith("/")) path = `/${path}`;
  if (path.length > 1 && path.endsWith("/") && trailingSlash !== "preserve") {
    path = path.slice(0, -1);
  }
  return path;
}
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function compilePath(path, { caseSensitive, trailingSlash }) {
  const input = path === "" ? "/" : path;
  const normalized = normalizePathname(input, "preserve");
  if (normalized === "/*" || normalized === "*") {
    return {
      regex: /^.*$/,
      keys: ["*"],
      score: 0
    };
  }
  const segments = normalized.split("/").filter(Boolean);
  const keys = [];
  let score = 0;
  let pattern = "^";
  for (const seg of segments) {
    if (seg === "*") {
      keys.push("*");
      pattern += "(?:/(.*))?";
      score += 1;
      continue;
    }
    if (seg.startsWith(":")) {
      const raw = seg.slice(1);
      const isOptional = raw.endsWith("?");
      const name = isOptional ? raw.slice(0, -1) : raw;
      keys.push(name);
      if (isOptional) {
        pattern += "(?:/([^/]+))?";
      } else {
        pattern += "/([^/]+)";
      }
      score += 2;
      continue;
    }
    pattern += `/${escapeRegex(seg)}`;
    score += 3;
  }
  if (segments.length === 0) pattern += "/?";
  if (trailingSlash === "preserve") {
    pattern += "$";
  } else {
    pattern += "/?$";
  }
  const flags = caseSensitive ? "" : "i";
  return {
    regex: new RegExp(pattern, flags),
    keys,
    score
  };
}
function parseQuery(search) {
  const out = {};
  if (!search) return out;
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  for (const [k, v] of params.entries()) {
    if (Object.prototype.hasOwnProperty.call(out, k)) {
      const prev = out[k];
      out[k] = Array.isArray(prev) ? prev.concat(v) : [prev, v];
    } else {
      out[k] = v;
    }
  }
  return out;
}
function toSearch(query) {
  if (!query || typeof query !== "object") return "";
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (Array.isArray(v)) {
      for (const item of v) params.append(k, String(item));
    } else if (v != null) {
      params.set(k, String(v));
    }
  }
  const str = params.toString();
  return str ? `?${str}` : "";
}
function buildUrl({ pathname, search, hash }) {
  const q = search || "";
  const h = hash || "";
  return `${pathname}${q}${h}`;
}
function joinPaths(parentPath, childPath) {
  const child = childPath == null ? "" : String(childPath).trim();
  if (child.startsWith("/")) return child || "/";
  const base = parentPath && parentPath !== "/" ? parentPath : "";
  if (!child) return base || "/";
  return `${base}/${child}`;
}
function resolveTarget2(target) {
  if (typeof target === "string") return document.querySelector(target);
  return target;
}
function isPageDefinition(value) {
  return typeof value === "function";
}
function isPromise(value) {
  return !!value && typeof value.then === "function";
}
var Router = class {
  #routes = [];
  #routeSeq = 0;
  #options;
  #mountParent = null;
  #mountAnchor = null;
  #current = null;
  #listening = false;
  #navToken = 0;
  #beforeEach = /* @__PURE__ */ new Set();
  #afterEach = /* @__PURE__ */ new Set();
  #memory = null;
  #routeState = null;
  #layoutOutletState = null;
  #currentLayoutKey = null;
  constructor(options = {}) {
    this.#options = {
      mode: options.mode || "history",
      basePath: normalizeBase(options.basePath || ""),
      caseSensitive: !!options.caseSensitive,
      trailingSlash: options.trailingSlash || "ignore",
      maxRedirects: options.maxRedirects ?? 8,
      scrollRestoration: options.scrollRestoration ?? true,
      transition: options.transition || null,
      errorPage: options.errorPage || null
    };
    if (this.#options.mode === "memory") {
      const initial = options.initialUrl || "/";
      this.#memory = {
        stack: [this.#parseUrl(initial)],
        index: 0
      };
    }
    this.#routeState = state(null);
  }
  #getLayoutChainKey(chain) {
    if (!chain?.length) return "";
    return chain.filter((r) => typeof r.layout === "function").map((r) => r.id).join(",");
  }
  routeState() {
    return this.#routeState;
  }
  add(pathOrConfig, PageClass, options = {}) {
    let config = null;
    if (typeof pathOrConfig === "string") {
      config = { path: pathOrConfig, page: PageClass, ...options };
    } else if (isPageDefinition(pathOrConfig)) {
      const route = pathOrConfig.route || pathOrConfig.path || null;
      if (route && typeof route === "object") {
        config = { ...route, page: pathOrConfig, ...options };
      } else {
        config = { path: route, page: pathOrConfig, ...options };
      }
    } else if (pathOrConfig && typeof pathOrConfig === "object") {
      config = { ...pathOrConfig };
    }
    if (!config || config.path == null) {
      throw new Error("Router.add: invalid route config");
    }
    return this.#addRouteConfig(config, null);
  }
  #addRouteConfig(config, parent) {
    const hasChildren = Array.isArray(config.children) && config.children.length > 0;
    const hasTarget = !!config.page || !!config.load || !!config.redirect;
    if (!hasTarget && !hasChildren && !config.layout) {
      throw new Error(`Router.add: route "${config.path}" must provide page, load, redirect, layout, or children`);
    }
    const fullPath = parent ? joinPaths(parent.path, config.path) : joinPaths("", config.path);
    const route = {
      id: `${++this.#routeSeq}_${Math.random().toString(36).slice(2)}`,
      name: config.name || null,
      path: fullPath,
      rawPath: config.path,
      parent: parent || null,
      meta: config.meta || null,
      redirect: config.redirect || null,
      loader: config.loader || null,
      guards: config.guards || null,
      beforeEnter: config.beforeEnter || null,
      beforeLeave: config.beforeLeave || null,
      props: config.props || null,
      reuse: config.reuse ?? null,
      transition: config.transition || null,
      errorPage: config.errorPage || null,
      load: config.load || null,
      page: config.page || null,
      layout: config.layout || null,
      children: []
    };
    if (hasTarget) {
      const compiled = compilePath(route.path, this.#options);
      route.regex = compiled.regex;
      route.keys = compiled.keys;
      route.score = compiled.score;
      this.#routes.push(route);
      this.#routes.sort((a, b) => b.score - a.score);
    }
    if (hasChildren) {
      for (const child of config.children) {
        const childRoute = this.#addRouteConfig(child, route);
        if (childRoute) route.children.push(childRoute);
      }
    }
    return route;
  }
  beforeEach(fn) {
    this.#beforeEach.add(fn);
    return () => this.#beforeEach.delete(fn);
  }
  afterEach(fn) {
    this.#afterEach.add(fn);
    return () => this.#afterEach.delete(fn);
  }
  mount(target) {
    const el = resolveTarget2(target);
    if (!el) throw new Error("Router.mount: target not found");
    if (this.#mountParent) return;
    el.textContent = "";
    this.#mountParent = el;
    this.#mountAnchor = createAnchor("router");
    el.appendChild(this.#mountAnchor);
    this.start();
  }
  unmount() {
    this.stop();
    if (this.#current) {
      this.#teardownCurrent();
      this.#current = null;
    }
    if (this.#mountAnchor) {
      this.#mountAnchor.remove();
      this.#mountAnchor = null;
    }
    this.#mountParent = null;
  }
  start() {
    if (this.#listening) return;
    this.#listening = true;
    if (this.#options.mode === "history") {
      window.addEventListener("popstate", this.#handlePop);
    } else if (this.#options.mode === "hash") {
      window.addEventListener("hashchange", this.#handlePop);
      window.addEventListener("popstate", this.#handlePop);
    }
    this.#handleLocationChange({ source: "start" });
  }
  stop() {
    if (!this.#listening) return;
    this.#listening = false;
    window.removeEventListener("popstate", this.#handlePop);
    window.removeEventListener("hashchange", this.#handlePop);
  }
  navigate(to, options = {}) {
    return this.#goTo(to, { ...options, replace: false });
  }
  replace(to, options = {}) {
    return this.#goTo(to, { ...options, replace: true });
  }
  back() {
    if (this.#options.mode === "memory") {
      this.#memoryBack();
      return;
    }
    history.back();
  }
  forward() {
    if (this.#options.mode === "memory") {
      this.#memoryForward();
      return;
    }
    history.forward();
  }
  go(delta) {
    if (this.#options.mode === "memory") {
      this.#memoryGo(delta);
      return;
    }
    history.go(delta);
  }
  resolve(path) {
    if (typeof path === "string") {
      const url = new URL(path, window.location.origin);
      let pathname2 = normalizePathname(url.pathname, this.#options.trailingSlash);
      const base2 = this.#options.basePath;
      if (base2 && !pathname2.startsWith(base2)) pathname2 = `${base2}${pathname2}`;
      return `${pathname2}${url.search || ""}${url.hash || ""}`;
    }
    const pathname = normalizePathname(path.pathname || "/", this.#options.trailingSlash);
    const search = path.search || toSearch(path.query);
    const hash = path.hash || "";
    const base = this.#options.basePath;
    const fullPath = base && !pathname.startsWith(base) ? `${base}${pathname}` : pathname;
    return `${fullPath}${search}${hash}`;
  }
  parse(url) {
    const loc = this.#parseUrl(url);
    const match2 = this.#match(loc.pathname);
    if (!match2) return { location: loc, match: null };
    return { location: loc, match: match2 };
  }
  get current() {
    return this.#current;
  }
  async checkGuards() {
    if (!this.#current) return true;
    const ctx = {
      router: this,
      route: this.#current.route,
      chain: this.#current.chain,
      params: this.#current.params,
      query: this.#current.query,
      location: this.#current.location,
      state: this.#current.location?.state ?? null,
      source: "revalidate"
    };
    const redirectChain = /* @__PURE__ */ new Set();
    const ok = await this.#runGuards(this.#current.chain, ctx, redirectChain);
    return ok;
  }
  queryParameters(options = {}) {
    const replace = options.replace ?? true;
    const preserveHash = options.preserveHash ?? true;
    const q = state(this.#readLocation()?.query || {});
    let lastSerialized = toSearch(q.get());
    let syncing = false;
    const applyFromLocation = (location) => {
      const nextQuery = location?.query || {};
      const nextSerialized = toSearch(nextQuery);
      if (nextSerialized === lastSerialized) return;
      lastSerialized = nextSerialized;
      q.set(nextQuery);
    };
    const unsubRoute = this.afterEach(({ location }) => {
      if (syncing) {
        syncing = false;
        return;
      }
      applyFromLocation(location);
    });
    const unsubState = after(q).change((next) => {
      const nextSerialized = toSearch(next);
      if (nextSerialized === lastSerialized) return;
      lastSerialized = nextSerialized;
      syncing = true;
      const current = this.#readLocation();
      const pathname = current?.pathname || "/";
      const hash = preserveHash ? current?.hash || "" : "";
      const target = { pathname, query: next, hash };
      if (replace) {
        this.replace(target);
      } else {
        this.navigate(target);
      }
    });
    Object.defineProperty(q, "dispose", {
      value: () => {
        if (typeof unsubRoute === "function") unsubRoute();
        if (typeof unsubState === "function") unsubState();
      },
      enumerable: false
    });
    return q;
  }
  #handlePop = () => {
    this.#handleLocationChange({ source: "pop" });
  };
  #readLocation() {
    if (this.#options.mode === "memory") {
      return this.#memory.stack[this.#memory.index];
    }
    if (this.#options.mode === "hash") {
      const raw = window.location.hash ? window.location.hash.slice(1) : "/";
      return this.#parseUrl(raw);
    }
    return this.#parseUrl(window.location.href);
  }
  #parseUrl(input) {
    const base = window.location.origin;
    const url = new URL(input, base);
    const pathname = normalizePathname(url.pathname, this.#options.trailingSlash);
    const basePath = this.#options.basePath;
    const stripped = basePath && pathname.startsWith(basePath) ? pathname.slice(basePath.length) || "/" : pathname;
    return {
      pathname: normalizePathname(stripped, this.#options.trailingSlash),
      search: url.search || "",
      hash: url.hash || "",
      query: parseQuery(url.search),
      state: history.state ?? null,
      url: buildUrl({ pathname: url.pathname, search: url.search, hash: url.hash })
    };
  }
  #memoryBack() {
    if (this.#memory.index <= 0) return;
    this.#memory.index -= 1;
    this.#handleLocationChange({ source: "pop" });
  }
  #memoryForward() {
    if (this.#memory.index >= this.#memory.stack.length - 1) return;
    this.#memory.index += 1;
    this.#handleLocationChange({ source: "pop" });
  }
  #memoryGo(delta) {
    const next = this.#memory.index + delta;
    if (next < 0 || next >= this.#memory.stack.length) return;
    this.#memory.index = next;
    this.#handleLocationChange({ source: "pop" });
  }
  async #goTo(to, { replace, state: state2, redirectChain } = {}) {
    const nextInput = typeof to === "string" ? to : this.resolve(to);
    const next = this.#parseUrl(nextInput);
    next.state = state2 ?? null;
    const token = ++this.#navToken;
    const ok = await this.#runNavigation(next, { token, source: "navigate", redirectChain });
    if (!ok) return;
    if (this.#options.mode === "memory") {
      if (replace) {
        this.#memory.stack[this.#memory.index] = { ...next, state: state2 ?? null };
      } else {
        this.#memory.stack = this.#memory.stack.slice(0, this.#memory.index + 1);
        this.#memory.stack.push({ ...next, state: state2 ?? null });
        this.#memory.index = this.#memory.stack.length - 1;
      }
      return;
    }
    const full = this.resolve(next.pathname) + (next.search || "") + (next.hash || "");
    if (this.#options.mode === "hash") {
      const url = `#${full}`;
      history[replace ? "replaceState" : "pushState"](state2 ?? null, "", url);
    } else {
      history[replace ? "replaceState" : "pushState"](state2 ?? null, "", full);
    }
  }
  async #handleLocationChange({ source, redirectChain } = {}) {
    if (!this.#mountParent || !this.#mountAnchor) return;
    const token = ++this.#navToken;
    const loc = this.#readLocation();
    const chain = redirectChain || /* @__PURE__ */ new Set();
    await this.#runNavigation(loc, { token, source, redirectChain: chain });
  }
  #match(pathname) {
    for (const route of this.#routes) {
      const m = route.regex.exec(pathname);
      if (!m) continue;
      const params = {};
      for (let i = 0; i < route.keys.length; i++) {
        const key = route.keys[i];
        params[key] = m[i + 1] ? decodeURIComponent(m[i + 1]) : void 0;
      }
      const chain = [];
      let cur = route;
      while (cur) {
        chain.unshift(cur);
        cur = cur.parent;
      }
      return { route, params, chain };
    }
    return null;
  }
  async #runNavigation(location, { token, source, redirectChain }) {
    if (token !== this.#navToken) return;
    const redirectSet = redirectChain ?? /* @__PURE__ */ new Set();
    const match2 = this.#match(location.pathname);
    if (!match2) return false;
    const { route, params, chain } = match2;
    const sameRoute = this.#current && this.#current.route === route;
    const reuse = route.reuse ?? route.page?.reuse ?? true;
    const transition = route.transition || route.page?.transition || this.#options.transition;
    const ctx = {
      router: this,
      route,
      chain,
      params,
      query: location.query || {},
      location,
      state: location.state ?? null,
      source
    };
    try {
      const redirect = await this.#resolveRedirect(chain, ctx, redirectSet);
      if (redirect) return false;
      const ok = await this.#runGuards(chain, ctx, redirectSet);
      if (!ok) {
        if (source === "pop") this.#restoreCurrentUrl();
        return false;
      }
      const data = await this.#runLoader(chain, ctx);
      if (token !== this.#navToken) return false;
      ctx.data = data?.leaf ?? data;
      ctx.routeData = data?.map ?? {};
      if (sameRoute && this.#current?.page && reuse) {
        this.#updateCurrent(ctx);
        return true;
      }
      const pageClass = await this.#resolvePage(route, ctx);
      if (token !== this.#navToken || !pageClass) return false;
      await this.#swapPage(pageClass, ctx, transition);
      return true;
    } catch (err) {
      return await this.#handleError(err, ctx, transition);
    }
  }
  async #resolveRedirect(chain, ctx, redirectChain) {
    for (const route of chain) {
      let target = null;
      if (typeof route.redirect === "string") target = route.redirect;
      if (typeof route.redirect === "function") target = route.redirect({ ...ctx, route });
      if (typeof target === "string") {
        return this.#redirectTo(target, redirectChain);
      }
      if (isPromise(target)) {
        const next = await target;
        if (typeof next === "string") return this.#redirectTo(next, redirectChain);
      }
    }
    return false;
  }
  async #runGuards(chain, ctx, redirectChain) {
    for (const fn of this.#beforeEach) {
      const res = await fn(ctx);
      if (await this.#handleGuardResult(res, redirectChain)) return false;
    }
    for (const route of chain) {
      const guards = [];
      if (Array.isArray(route.guards)) guards.push(...route.guards);
      if (typeof route.guards === "function") guards.push(route.guards);
      if (typeof route.beforeEnter === "function") guards.push(route.beforeEnter);
      if (typeof route.page?.guards === "function") guards.push(route.page.guards);
      if (Array.isArray(route.page?.guards)) guards.push(...route.page.guards);
      if (typeof route.page?.beforeEnter === "function") guards.push(route.page.beforeEnter);
      for (const fn of guards) {
        const res = await fn({ ...ctx, route });
        if (await this.#handleGuardResult(res, redirectChain)) return false;
      }
    }
    return true;
  }
  async #handleGuardResult(result, redirectChain) {
    if (result === false) return true;
    if (typeof result === "string") return this.#redirectTo(result, redirectChain);
    if (result && typeof result === "object" && typeof result.redirect === "string") {
      return this.#redirectTo(result.redirect, redirectChain);
    }
    if (isPromise(result)) {
      const r = await result;
      return this.#handleGuardResult(r, redirectChain);
    }
    return false;
  }
  async #runLoader(chain, ctx) {
    const out = {};
    let leafData = void 0;
    for (const route of chain) {
      const loader = route.loader || route.page?.loader;
      if (typeof loader !== "function") continue;
      const data = await loader({ ...ctx, route });
      out[route.id] = data;
      if (route === chain[chain.length - 1]) leafData = data;
    }
    return { map: out, leaf: leafData };
  }
  async #resolvePage(route, ctx) {
    if (route.page && isPageDefinition(route.page)) return route.page;
    if (typeof route.load === "function") {
      const loaded = await route.load(ctx);
      if (loaded?.default && isPageDefinition(loaded.default)) return loaded.default;
      if (isPageDefinition(loaded)) return loaded;
    }
    return null;
  }
  async #swapPage(PageClass, ctx, transition) {
    const props = {
      params: ctx.params,
      query: ctx.query,
      location: ctx.location,
      data: ctx.data,
      state: ctx.state,
      router: this,
      route: ctx.route,
      ...typeof ctx.route.props === "function" ? ctx.route.props(ctx) : {}
    };
    let page;
    let isClassBased = false;
    if (PageClass.prototype && PageClass.prototype.constructor === PageClass) {
      try {
        page = new PageClass(props);
        isClassBased = true;
      } catch (e) {
        page = PageClass(props);
      }
    } else {
      page = PageClass(props);
    }
    if (isClassBased && page && typeof page === "object") {
      page.router = this;
      page.route = ctx.route;
      page.params = ctx.params;
      page.query = ctx.query;
      page.location = ctx.location;
      page.data = ctx.data;
      page.state = ctx.state;
    }
    const prev = this.#current;
    if (prev?.page) {
      const leaveCtx = { ...ctx, from: prev };
      prev.page.emitBefore?.("routeLeave", leaveCtx, { router: this, page: prev.page });
      prev.page.emitAfter?.("routeLeave", leaveCtx, { router: this, page: prev.page });
    }
    page.emitBefore?.("routeEnter", ctx, { router: this, page });
    const layoutKey = this.#getLayoutChainKey(ctx.chain);
    const reuseLayout = layoutKey === this.#currentLayoutKey && this.#layoutOutletState != null;
    if (reuseLayout) {
      this.#layoutOutletState.set(page);
      page.emitAfter?.("routeEnter", ctx, { router: this, page });
      this.#current = {
        route: ctx.route,
        chain: ctx.chain,
        page,
        mounted: prev?.mounted ?? [],
        mountedNodes: prev?.mountedNodes ?? [],
        params: ctx.params,
        query: ctx.query,
        location: ctx.location,
        data: ctx.data,
        routeData: ctx.routeData
      };
      this.#routeState.set({
        route: ctx.route,
        chain: ctx.chain,
        params: ctx.params,
        query: ctx.query,
        location: ctx.location,
        page
      });
      for (const fn of this.#afterEach) fn({ ...ctx, page });
      this.#applyScrollRestoration(ctx);
      return;
    }
    if (prev) this.#teardownCurrent();
    const { tree: rootRenderable, outletState } = this.#buildLayoutTree(page, ctx);
    this.#layoutOutletState = outletState;
    this.#currentLayoutKey = layoutKey;
    const mountedValues = Renderer.normalize(rootRenderable);
    const marker = document.createTextNode("");
    this.#mountParent.insertBefore(marker, this.#mountAnchor);
    for (const r of mountedValues) {
      if (Renderer.isRenderable(r)) {
        r.mountInto(this.#mountParent, this.#mountAnchor);
      } else if (Renderer.isDomNode(r)) {
        this.#mountParent.insertBefore(r, this.#mountAnchor);
      }
    }
    const mountedNodes = [];
    let cur = marker.nextSibling;
    while (cur && cur !== this.#mountAnchor) {
      mountedNodes.push(cur);
      cur = cur.nextSibling;
    }
    marker.remove();
    page.emitAfter?.("routeEnter", ctx, { router: this, page });
    this.#current = {
      route: ctx.route,
      chain: ctx.chain,
      page,
      mounted: mountedValues,
      mountedNodes,
      params: ctx.params,
      query: ctx.query,
      location: ctx.location,
      data: ctx.data,
      routeData: ctx.routeData
    };
    this.#routeState.set({
      route: ctx.route,
      chain: ctx.chain,
      params: ctx.params,
      query: ctx.query,
      location: ctx.location,
      page
    });
    for (const fn of this.#afterEach) fn({ ...ctx, page });
    this.#applyScrollRestoration(ctx);
  }
  #updateCurrent(ctx) {
    const current = this.#current;
    if (!current?.page) return;
    current.chain = ctx.chain;
    current.params = ctx.params;
    current.query = ctx.query;
    current.location = ctx.location;
    current.data = ctx.data;
    current.page.params = ctx.params;
    current.page.query = ctx.query;
    current.page.location = ctx.location;
    current.page.data = ctx.data;
    current.page.state = ctx.state;
    current.page.emitBefore?.("routeUpdate", ctx, { router: this, page: current.page });
    current.page.emitAfter?.("routeUpdate", ctx, { router: this, page: current.page });
    this.#routeState.set({
      route: ctx.route,
      chain: ctx.chain,
      params: ctx.params,
      query: ctx.query,
      location: ctx.location,
      page: current.page
    });
    for (const fn of this.#afterEach) fn({ ...ctx, page: current.page });
    this.#applyScrollRestoration(ctx);
  }
  async #applyTransition(prevView, nextView, transition) {
    if (!transition || !prevView) return;
    const enter = transition.enterClass || "zb-route-enter";
    const enterActive = transition.enterActiveClass || "zb-route-enter-active";
    const exit = transition.exitClass || "zb-route-exit";
    const exitActive = transition.exitActiveClass || "zb-route-exit-active";
    const duration = transition.duration ?? 180;
    nextView.classList.add(enter);
    prevView.classList.add(exit);
    await new Promise((r) => requestAnimationFrame(r));
    nextView.classList.add(enterActive);
    prevView.classList.add(exitActive);
    await new Promise((r) => setTimeout(r, duration));
    nextView.classList.remove(enter, enterActive);
    prevView.classList.remove(exit, exitActive);
  }
  #teardownCurrent() {
    const current = this.#current;
    if (!current) return;
    if (Array.isArray(current.mounted)) {
      for (const r of current.mounted) Renderer.unmount(r);
    }
    if (Array.isArray(current.mountedNodes)) {
      for (const n of current.mountedNodes) if (n.parentNode) n.remove();
    }
    this.#layoutOutletState = null;
    this.#currentLayoutKey = null;
  }
  #buildLayoutTree(page, ctx) {
    const chain = ctx.chain || [];
    const hasLayout = chain.some((r) => typeof r.layout === "function");
    if (!hasLayout) {
      return { tree: page, outletState: null };
    }
    const outletState = state(page);
    let tree = outletState;
    for (let i = chain.length - 1; i >= 0; i--) {
      const route = chain[i];
      if (typeof route.layout === "function") {
        tree = route.layout(tree, { ...ctx, route });
      }
    }
    return { tree, outletState };
  }
  async #redirectTo(target, redirectChain) {
    if (redirectChain.size >= this.#options.maxRedirects) {
      throw new Error("Router: too many redirects");
    }
    if (redirectChain.has(target)) {
      throw new Error(`Router: redirect loop to "${target}"`);
    }
    redirectChain.add(target);
    await this.#goTo(target, { replace: true, redirectChain });
    return true;
  }
  async #handleError(err, ctx, transition) {
    const errorPage = ctx.route.errorPage || this.#options.errorPage;
    if (!errorPage) throw err;
    const errorCtx = { ...ctx, error: err };
    await this.#swapPage(errorPage, errorCtx, transition);
    const page = this.#current?.page;
    if (page) {
      page.emitBefore("routeError", errorCtx, { router: this, page });
      page.emitAfter("routeError", errorCtx, { router: this, page });
    }
    return true;
  }
  #applyScrollRestoration(ctx) {
    if (!this.#options.scrollRestoration) return;
    const hash = ctx.location?.hash;
    if (hash && hash.length > 1) {
      const id = hash.slice(1);
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView();
        return;
      }
    }
    window.scrollTo(0, 0);
  }
  #restoreCurrentUrl() {
    const current = this.#current?.location;
    if (!current) return;
    const full = this.resolve(current.pathname) + (current.search || "") + (current.hash || "");
    if (this.#options.mode === "hash") {
      history.replaceState(current.state ?? null, "", `#${full}`);
      return;
    }
    history.replaceState(current.state ?? null, "", full);
  }
};
var RouterOutlet = class {
  #router;
  #mountedParent = null;
  constructor(router2) {
    if (!router2 || typeof router2.mount !== "function") {
      throw new Error("RouterOutlet: expected a Router instance");
    }
    this.#router = router2;
  }
  mountInto(parent) {
    if (this.#mountedParent) return;
    this.#mountedParent = parent;
    this.#router.mount(parent);
  }
  unmount() {
    if (!this.#mountedParent) return;
    this.#mountedParent = null;
    if (typeof this.#router.unmount === "function") {
      this.#router.unmount();
    }
  }
  renderToString() {
    return "";
  }
};
function createRouter(options) {
  const router2 = new Router(options);
  if (options?.routes && Array.isArray(options.routes)) {
    for (const route of options.routes) {
      router2.add(route);
    }
  }
  return router2;
}
var router = new Router();

// src/core/context.js
var ContextProvider = class extends Renderable {
  #children;
  #providerSignal;
  #consumers;
  #mountStack;
  #providerStack;
  #mountTimeConsumers = [];
  #providerStackEntry = null;
  #mounted = false;
  constructor(children, providerSignal, consumers, mountStack, providerStack) {
    super();
    this.#children = children;
    this.#providerSignal = providerSignal;
    this.#consumers = consumers;
    this.#mountStack = mountStack;
    this.#providerStack = providerStack;
  }
  mountInto(parent, beforeNode) {
    if (this.#mounted) return;
    this.#mounted = true;
    for (const consumer of this.#consumers) {
      consumer._connect(this.#providerSignal);
    }
    const stackEntry = { signal: this.#providerSignal, consumers: this.#mountTimeConsumers };
    this.#mountStack.push(stackEntry);
    if (this.#providerStack) {
      this.#providerStackEntry = stackEntry;
      this.#providerStack.push(stackEntry);
    }
    for (const child of this.#children) {
      if (child == null) continue;
      if (Renderer.isRenderable(child)) {
        child.mountInto(parent, beforeNode);
      } else if (Renderer.isDomNode(child)) {
        if (beforeNode) parent.insertBefore(child, beforeNode);
        else parent.appendChild(child);
      } else {
        const node = document.createTextNode(String(child));
        if (beforeNode) parent.insertBefore(node, beforeNode);
        else parent.appendChild(node);
      }
    }
    this.#mountStack.pop();
  }
  unmount() {
    if (!this.#mounted) return;
    this.#mounted = false;
    for (const child of this.#children) {
      if (child && Renderer.isRenderable(child)) child.unmount();
      else if (child && Renderer.isDomNode(child) && child.parentNode) child.parentNode.removeChild(child);
    }
    if (this.#providerStack && this.#providerStackEntry) {
      const idx = this.#providerStack.lastIndexOf(this.#providerStackEntry);
      if (idx !== -1) this.#providerStack.splice(idx, 1);
      this.#providerStackEntry = null;
    }
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
    const html = this.#children.map((c) => render(c)).join("");
    this.#mountStack.pop();
    return html;
  }
};
function createContextConsumer(defaultValue) {
  const localSignal = signal(defaultValue);
  const subscribers = /* @__PURE__ */ new Set();
  let activeProviderSignal = null;
  let providerUnsub = null;
  let localUnsub = null;
  const notify = (...args) => {
    for (const fn of subscribers) fn(...args);
  };
  localUnsub = subscribeSignal(localSignal, notify);
  const getActive = () => activeProviderSignal || localSignal;
  const adapter = {
    kind: "state",
    get: () => readSignal(getActive()),
    set: (next) => setSignal(getActive(), next, true),
    subscribe: (fn) => {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    before: localSignal.before
  };
  const consumerState = createStateFromAdapter(adapter);
  return {
    state: consumerState,
    _connect(providerSignal) {
      if (activeProviderSignal === providerSignal) return;
      if (providerUnsub) {
        providerUnsub();
        providerUnsub = null;
      }
      activeProviderSignal = providerSignal;
      if (localUnsub) {
        localUnsub();
        localUnsub = null;
      }
      providerUnsub = subscribeSignal(providerSignal, notify);
      const newVal = readSignal(providerSignal);
      const oldVal = readSignal(localSignal);
      if (newVal !== oldVal) {
        notify(newVal, oldVal);
      }
    },
    _disconnect() {
      if (providerUnsub) {
        providerUnsub();
        providerUnsub = null;
      }
      activeProviderSignal = null;
      localUnsub = subscribeSignal(localSignal, notify);
    }
  };
}
function context(defaultValue) {
  const pending = [];
  const mountStack = [];
  const providerStack = [];
  const scope = (value) => {
    const providerSignal = signal(value !== void 0 ? value : defaultValue);
    const scopeConsumers = [];
    providerStack.push({ signal: providerSignal, consumers: scopeConsumers });
    const adapter = {
      kind: "state",
      get: () => readSignal(providerSignal),
      set: (next) => setSignal(providerSignal, next, true),
      subscribe: (fn) => subscribeSignal(providerSignal, fn),
      before: providerSignal.before
    };
    const providerState = createStateFromAdapter(adapter);
    const serve = (...children) => {
      providerStack.pop();
      const pendingConsumers = pending.splice(0);
      for (const consumer of pendingConsumers) {
        consumer._connect(providerSignal);
      }
      const allConsumers = [...scopeConsumers, ...pendingConsumers];
      const flat = [];
      for (const c of children) {
        if (Array.isArray(c)) flat.push(...c);
        else flat.push(c);
      }
      return new ContextProvider(flat, providerSignal, allConsumers, mountStack, providerStack);
    };
    return new Proxy(providerState, {
      get(target, prop) {
        if (prop === "serve") return serve;
        return Reflect.get(target, prop);
      }
    });
  };
  const state2 = () => {
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
  return { scope, state: state2 };
}

// src/core/reactivity/scheduler.js
var PRIORITIES = ["sync", "normal", "idle"];
var Scheduler = class {
  #queues = new Map(PRIORITIES.map((p) => [p, /* @__PURE__ */ new Set()]));
  #flushScheduled = false;
  #flushing = false;
  #profiler = null;
  #flushCount = 0;
  #flushedHosts = 0;
  schedule(host, priority = "normal") {
    if (!this.#queues.has(priority)) priority = "normal";
    const queue = this.#queues.get(priority);
    if (queue.has(host)) return;
    queue.add(host);
    if (this.#profiler) this.#profiler.onSchedule?.(host, priority);
    this.#requestFlush(priority);
  }
  unschedule(host) {
    for (const queue of this.#queues.values()) queue.delete(host);
  }
  isScheduled(host) {
    for (const queue of this.#queues.values()) {
      if (queue.has(host)) return true;
    }
    return false;
  }
  flushSync() {
    this.#flushOnce("sync");
  }
  flushAll() {
    if (this.#flushing) return;
    this.#flushing = true;
    try {
      let safety = 0;
      while (this.#hasWork()) {
        for (const priority of PRIORITIES) {
          this.#flushOnce(priority);
        }
        if (++safety > 1e3) {
          console.warn("[granular] Scheduler safety limit hit; possible infinite update loop.");
          break;
        }
      }
    } finally {
      this.#flushing = false;
      this.#flushScheduled = false;
    }
  }
  #flushOnce(priority) {
    const queue = this.#queues.get(priority);
    if (!queue || queue.size === 0) return;
    const hosts = Array.from(queue);
    queue.clear();
    this.#flushCount++;
    for (const host of hosts) {
      this.#flushedHosts++;
      if (this.#profiler) this.#profiler.onFlushStart?.(host);
      const start = this.#profiler ? performance.now() : 0;
      try {
        host[FLUSH_HOOK]();
      } catch (err) {
        console.error("[granular] Error during scheduled flush:", err);
      }
      if (this.#profiler) {
        const elapsed = performance.now() - start;
        this.#profiler.onFlushEnd?.(host, elapsed);
      }
    }
  }
  #requestFlush(priority) {
    if (this.#flushScheduled) return;
    if (priority === "sync") {
      this.#flushScheduled = true;
      try {
        this.flushAll();
      } finally {
        this.#flushScheduled = false;
      }
      return;
    }
    this.#flushScheduled = true;
    queueMicrotask(() => {
      this.#flushScheduled = false;
      this.flushAll();
    });
  }
  #hasWork() {
    for (const queue of this.#queues.values()) {
      if (queue.size > 0) return true;
    }
    return false;
  }
  setProfiler(profiler2) {
    this.#profiler = profiler2;
  }
  stats() {
    return {
      flushes: this.#flushCount,
      flushedHosts: this.#flushedHosts,
      pending: PRIORITIES.reduce((acc, p) => acc + this.#queues.get(p).size, 0)
    };
  }
};
var FLUSH_HOOK = /* @__PURE__ */ Symbol("granular.scheduler.flush");
var scheduler = new Scheduler();

// src/core/reactivity/profiler.js
var Profiler = class {
  #enabled = false;
  #events = [];
  #maxEvents = 5e3;
  #stats = { schedules: 0, flushes: 0, flushTime: 0, hostsFlushed: 0 };
  #subscribers = /* @__PURE__ */ new Set();
  #now;
  constructor() {
    this.#now = typeof performance !== "undefined" && typeof performance.now === "function" ? () => performance.now() : () => Date.now();
  }
  enable(options = {}) {
    if (this.#enabled) return;
    this.#enabled = true;
    if (typeof options.maxEvents === "number") this.#maxEvents = options.maxEvents;
    scheduler.setProfiler(this);
  }
  disable() {
    if (!this.#enabled) return;
    this.#enabled = false;
    scheduler.setProfiler(null);
  }
  isEnabled() {
    return this.#enabled;
  }
  reset() {
    this.#events = [];
    this.#stats = { schedules: 0, flushes: 0, flushTime: 0, hostsFlushed: 0 };
  }
  subscribe(fn) {
    this.#subscribers.add(fn);
    return () => this.#subscribers.delete(fn);
  }
  events() {
    return [...this.#events];
  }
  stats() {
    return { ...this.#stats };
  }
  onSchedule(host, priority) {
    if (!this.#enabled) return;
    this.#stats.schedules++;
    const event = {
      type: "schedule",
      time: this.#now(),
      host: this.#hostLabel(host),
      priority
    };
    this.#push(event);
    for (const fn of this.#subscribers) {
      try {
        fn(event);
      } catch {
      }
    }
  }
  onFlushStart(host) {
    if (!this.#enabled) return;
    this.#push({
      type: "flush:start",
      time: this.#now(),
      host: this.#hostLabel(host)
    });
  }
  onFlushEnd(host, elapsed) {
    if (!this.#enabled) return;
    this.#stats.flushes++;
    this.#stats.hostsFlushed++;
    this.#stats.flushTime += elapsed;
    const event = {
      type: "flush:end",
      time: this.#now(),
      host: this.#hostLabel(host),
      elapsed
    };
    this.#push(event);
    for (const fn of this.#subscribers) {
      try {
        fn(event);
      } catch {
      }
    }
  }
  #hostLabel(host) {
    if (!host) return "unknown";
    if (host.constructor && host.constructor.name) return host.constructor.name;
    return typeof host;
  }
  #push(event) {
    this.#events.push(event);
    if (this.#events.length > this.#maxEvents) {
      this.#events.splice(0, this.#events.length - this.#maxEvents);
    }
  }
  summarizeRecent(timeWindowMs = 1e3) {
    const now2 = this.#now();
    const cutoff = now2 - timeWindowMs;
    const recent = this.#events.filter((ev) => ev.time >= cutoff);
    const byHost = /* @__PURE__ */ new Map();
    for (const ev of recent) {
      if (ev.type !== "flush:end") continue;
      const stat = byHost.get(ev.host) || { count: 0, totalTime: 0 };
      stat.count++;
      stat.totalTime += ev.elapsed || 0;
      byHost.set(ev.host, stat);
    }
    return Array.from(byHost.entries()).map(([host, stat]) => ({ host, ...stat, avgTime: stat.totalTime / stat.count })).sort((a, b) => b.totalTime - a.totalTime);
  }
};
var profiler = new Profiler();

// src/core/dom/tags.js
var tags = [
  "html",
  "head",
  "title",
  "base",
  "link",
  "meta",
  "style",
  "body",
  "article",
  "section",
  "nav",
  "aside",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hgroup",
  "header",
  "footer",
  "address",
  "main",
  "search",
  "p",
  "hr",
  "pre",
  "blockquote",
  "ol",
  "ul",
  "li",
  "dl",
  "dt",
  "dd",
  "figure",
  "figcaption",
  "div",
  "menu",
  "a",
  "em",
  "strong",
  "small",
  "s",
  "cite",
  "q",
  "dfn",
  "abbr",
  "ruby",
  "rt",
  "rp",
  "data",
  "time",
  "code",
  "var",
  "samp",
  "kbd",
  "sub",
  "sup",
  "i",
  "b",
  "u",
  "mark",
  "bdi",
  "bdo",
  "span",
  "br",
  "wbr",
  "ins",
  "del",
  "picture",
  "source",
  "img",
  "iframe",
  "embed",
  "object",
  "param",
  "video",
  "audio",
  "track",
  "map",
  "area",
  "table",
  "caption",
  "colgroup",
  "col",
  "tbody",
  "thead",
  "tfoot",
  "tr",
  "td",
  "th",
  "form",
  "label",
  "input",
  "button",
  "select",
  "datalist",
  "optgroup",
  "option",
  "textarea",
  "output",
  "progress",
  "meter",
  "fieldset",
  "legend",
  "details",
  "summary",
  "dialog",
  "script",
  "noscript",
  "template",
  "slot",
  "canvas"
];
function toFactoryName(tag) {
  let name = tag.charAt(0).toUpperCase() + tag.slice(1);
  if (name in globalThis) name = `Html${name}`;
  return name;
}
function createTag(tagName) {
  return (...args) => {
    const nextProps = {};
    const nextChildren = [];
    const isPropsObject = (value) => !!value && typeof value === "object" && !Array.isArray(value) && !Renderer.isRenderable(value) && !Renderer.isDomNode(value) && !isObservableArray(value) && !isSignal(value) && !isState(value) && !isStatePath(value) && !isComputed(value);
    for (const arg of args) {
      if (isPropsObject(arg)) {
        Object.assign(nextProps, arg);
      } else {
        nextChildren.push(arg);
      }
    }
    return new ElementNode(tagName, nextProps, nextChildren);
  };
}
var exported = {};
for (const tag of tags) {
  const name = toFactoryName(tag);
  exported[name] = createTag(tag);
}
var Elements = Object.freeze(exported);
var {
  Html,
  Head,
  Title,
  Base,
  Link,
  Meta,
  Style,
  Body,
  Article,
  Section,
  Nav,
  Aside,
  H1,
  H2,
  H3,
  H4,
  H5,
  H6,
  Hgroup,
  Header,
  Footer,
  Address,
  Main,
  Search,
  P,
  Hr,
  Pre,
  Blockquote,
  Ol,
  Ul,
  Li,
  Dl,
  Dt,
  Dd,
  Figure,
  Figcaption,
  Div,
  Menu,
  A,
  Em,
  Strong,
  Small,
  S,
  Cite,
  Q,
  Dfn,
  Abbr,
  Ruby,
  Rt,
  Rp,
  Data,
  Time,
  Code,
  Var,
  Samp,
  Kbd,
  Sub,
  Sup,
  I,
  B,
  U,
  Mark,
  Bdi,
  Bdo,
  Span,
  Br,
  Wbr,
  Ins,
  Del,
  Picture,
  Source,
  Img,
  Iframe,
  Embed,
  HtmlObject,
  Param,
  Video,
  Audio,
  Track,
  Map: Map2,
  Area,
  Table,
  Caption,
  Colgroup,
  Col,
  Tbody,
  Thead,
  Tfoot,
  Tr,
  Td,
  Th,
  Form,
  Label,
  Input,
  Button,
  Select,
  Datalist,
  Optgroup,
  Option,
  Textarea,
  Output,
  Progress,
  Meter,
  Fieldset,
  Legend,
  Details,
  Summary,
  Dialog,
  Script,
  Noscript,
  Template,
  Slot,
  Canvas
} = exported;

// src/dev.js
var warned = /* @__PURE__ */ new Set();
var installed = false;
var opts = {
  proxyCoercion: true,
  flushLoops: true,
  unhandledRejections: true,
  flushLoopThreshold: 50,
  slowFlushMs: 16,
  warnOnce: true,
  trace: false
};
function emitWarning(key, message) {
  if (opts.warnOnce && warned.has(key)) return;
  warned.add(key);
  if (opts.trace) {
    console.warn("[granular/dev]", message, "\n", new Error().stack);
  } else {
    console.warn("[granular/dev]", message);
  }
}
function installCoercionHook() {
  setDevHooks({
    onCoerce(kind, _source, hint) {
      if (hint === "string" || hint === "valueOf") {
        emitWarning(
          `coerce:${kind}:${hint}`,
          `Implicit coercion of a reactive ${kind} via ${hint === "valueOf" ? "valueOf()" : "toString()/template literal"}. Prefer .get() or use after()/derive()/cls\`...\`/tpl\`...\` for reactivity.`
        );
      } else if (hint === "number") {
        emitWarning(
          `coerce:${kind}:number`,
          `Numeric coercion of a reactive ${kind}. The current value was used; the result will not update reactively. Use .get() or wrap in after()/derive() to stay reactive.`
        );
      } else if (hint === "default") {
        emitWarning(
          `coerce:${kind}:default`,
          `Reactive ${kind} used in a value-producing context (e.g. concatenation). Result is a snapshot, not reactive. Prefer cls\`...\`, tpl\`...\`, or after()/derive().`
        );
      }
    }
  });
}
function installFlushGuard() {
  let lastFlushAt = 0;
  let flushBurst = 0;
  scheduler.setProfiler({
    onSchedule() {
    },
    onFlushStart() {
    },
    onFlushEnd(host, elapsed) {
      const now2 = typeof performance !== "undefined" ? performance.now() : Date.now();
      if (now2 - lastFlushAt < 16) flushBurst++;
      else flushBurst = 0;
      lastFlushAt = now2;
      const name = host?.constructor?.name ?? "host";
      if (flushBurst > opts.flushLoopThreshold) {
        emitWarning(
          `flush-loop:${name}`,
          `${name} flushed > ${opts.flushLoopThreshold} times within 16ms. Possible re-entrant update loop.`
        );
      }
      if (elapsed > opts.slowFlushMs) {
        emitWarning(
          `slow-flush:${name}`,
          `${name} flush took ${elapsed.toFixed(2)}ms (> ${opts.slowFlushMs}ms budget).`
        );
      }
    }
  });
}
function installRejectionHandler() {
  const handler = (reason) => {
    console.warn("[granular/dev] Unhandled promise rejection:", reason);
  };
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("unhandledrejection", (event) => handler(event.reason));
  } else if (typeof process !== "undefined" && typeof process.on === "function") {
    process.on("unhandledRejection", handler);
  }
}
function enableDevMode(options = {}) {
  if (installed) return { disable: () => {
  } };
  installed = true;
  opts = { ...opts, ...options };
  warned.clear();
  if (opts.proxyCoercion) installCoercionHook();
  if (opts.flushLoops) installFlushGuard();
  if (opts.unhandledRejections) installRejectionHandler();
  profiler.enable();
  console.info("[granular/dev] Dev mode enabled. Disable in production builds.");
  return {
    disable: () => {
      installed = false;
      setDevHooks(null);
      scheduler.setProfiler(null);
      profiler.disable();
      warned.clear();
    }
  };
}
function clearDevWarnings() {
  warned.clear();
}

// src/devtools-hook.js
var HOOK_KEY = "__GRANULAR_DEVTOOLS_HOOK__";
function installDevtoolsHook() {
  const target = typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : null;
  if (!target) return null;
  if (target[HOOK_KEY]) return target[HOOK_KEY];
  const listeners = /* @__PURE__ */ new Set();
  const recentEvents = [];
  const MAX_RECENT = 200;
  let unsub = null;
  function attach() {
    if (unsub) return;
    if (!profiler.isEnabled()) profiler.enable({ maxEvents: 5e3 });
    unsub = profiler.subscribe((event) => {
      recentEvents.push(event);
      if (recentEvents.length > MAX_RECENT) recentEvents.shift();
      const payload = { source: "granular-devtools", kind: "event", event };
      try {
        target.postMessage(payload, "*");
      } catch {
      }
      for (const fn of listeners) {
        try {
          fn(event);
        } catch {
        }
      }
    });
  }
  function detach() {
    if (unsub) {
      unsub();
      unsub = null;
    }
  }
  const hook = {
    version: 1,
    profiler,
    isAttached() {
      return !!unsub;
    },
    attach,
    detach,
    onEvent(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    snapshot() {
      return {
        events: profiler.events(),
        stats: profiler.stats(),
        topByHost: profiler.summarizeRecent(2e3),
        recentEvents: recentEvents.slice()
      };
    },
    reset() {
      profiler.reset();
      recentEvents.length = 0;
    }
  };
  target[HOOK_KEY] = hook;
  try {
    target.postMessage({ source: "granular-devtools", kind: "hook-installed", version: hook.version }, "*");
  } catch {
  }
  return hook;
}
var DEVTOOLS_HOOK_KEY = HOOK_KEY;
export {
  A,
  Abbr,
  Address,
  Area,
  Article,
  Aside,
  Audio,
  B,
  Base,
  Bdi,
  Bdo,
  Blockquote,
  Body,
  Br,
  Button,
  Canvas,
  Caption,
  Cite,
  Code,
  Col,
  Colgroup,
  DEVTOOLS_HOOK_KEY,
  Data,
  Datalist,
  Dd,
  Del,
  Details,
  Dfn,
  Dialog,
  Div,
  Dl,
  Dt,
  Elements,
  Em,
  Embed,
  ErrorBoundary,
  EventHub,
  Fieldset,
  Figcaption,
  Figure,
  Footer,
  Form,
  H1,
  H2,
  H3,
  H4,
  H5,
  H6,
  Head,
  Header,
  Hgroup,
  Hr,
  Html,
  HtmlObject,
  I,
  Iframe,
  Img,
  Input,
  Ins,
  Kbd,
  Label,
  Legend,
  Li,
  Link,
  Main,
  Map2 as Map,
  Mark,
  Menu,
  Meta,
  Meter,
  Nav,
  Noscript,
  Ol,
  Optgroup,
  Option,
  Output,
  P,
  Param,
  Picture,
  Pre,
  Progress,
  Q,
  QueryClient,
  Renderable,
  Renderer,
  Router,
  RouterOutlet,
  Rp,
  Rt,
  Ruby,
  S,
  Samp,
  Script,
  Search,
  Section,
  Select,
  Slot,
  Small,
  Source,
  Span,
  Strong,
  Style,
  Sub,
  Summary,
  Sup,
  Table,
  Tbody,
  Td,
  Template,
  Textarea,
  Tfoot,
  Th,
  Thead,
  Time,
  Title,
  Tr,
  Track,
  U,
  Ul,
  Var,
  Video,
  Wbr,
  WebSocketClient,
  after,
  and,
  atLeast,
  atMost,
  before,
  bigger,
  bootstrap,
  clearDevWarnings,
  cls,
  computed,
  concat,
  context,
  createRouter,
  createWebSocket,
  derive,
  differs,
  enableDevMode,
  eq,
  equals,
  form,
  formSchema,
  gt,
  gte,
  hydrate,
  installDevtoolsHook,
  isComputed,
  isSignal,
  isState,
  isStatePath,
  isWhen,
  like,
  list,
  lt,
  lte,
  match,
  neq,
  not,
  observableArray,
  or,
  persist,
  portal,
  profiler,
  readSignal,
  renderToString,
  resolve,
  router,
  scheduler,
  set,
  setSignal,
  setTemplateCacheSize,
  signal,
  smaller,
  state,
  subscribe,
  tpl,
  unlike,
  virtualList,
  when
};
//# sourceMappingURL=granular.js.map
