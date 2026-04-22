import { state } from '../reactivity/state.js';

/**
 * @typedef {string | number | boolean | null} QueryKeyAtom
 */
/**
 * @typedef {QueryKeyAtom | QueryKeyAtom[]} QueryKey
 */

/**
 * @typedef {'idle'|'loading'|'success'|'error'} QueryStatus
 */

/**
 * @typedef {Object} QueryState
 * @property {any} data
 * @property {any} error
 * @property {QueryStatus} status
 * @property {boolean} fetching
 * @property {number|null} updatedAt
 * @property {number|null} errorAt
 * @property {boolean} invalidated
 */

/**
 * @typedef {Object} QueryContext
 * @property {QueryKey} key
 * @property {AbortSignal} signal
 */

/**
 * @typedef {Object} QueryOptions
 * @property {QueryKey} key
 * @property {(ctx: QueryContext) => Promise<any>} fetcher
 * @property {number} [staleTime] ms
 * @property {number} [cacheTime] ms
 * @property {boolean} [refetchOnFocus]
 * @property {boolean} [refetchOnReconnect]
 * @property {number} [retry]
 * @property {(attempt: number) => number} [retryDelay]
 * @property {boolean} [dedupe]
 * @property {boolean} [refetchOnInvalidate]
 */

function defaultRetryDelay(attempt) {
  // 250ms, 500ms, 1000ms, 2000ms...
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
  if (!query || typeof query !== 'object') return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (Array.isArray(v)) {
      for (const item of v) params.append(k, String(item));
    } else if (v != null) {
      params.set(k, String(v));
    }
  }
  const str = params.toString();
  return str ? `?${str}` : '';
}

function interpolatePath(path, params) {
  if (!params) return path;
  return String(path).replace(/:([A-Za-z0-9_]+)/g, (match, key) => {
    if (!Object.prototype.hasOwnProperty.call(params, key)) {
      throw new Error(`Missing route param "${key}" for "${path}"`);
    }
    return encodeURIComponent(String(params[key]));
  });
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return false;
  if (value instanceof FormData) return false;
  if (value instanceof URLSearchParams) return false;
  if (value instanceof Blob) return false;
  if (value instanceof ArrayBuffer) return false;
  return Object.prototype.toString.call(value) === '[object Object]';
}

async function parseResponse(res) {
  const type = res.headers.get('content-type') || '';
  if (type.includes('application/json')) return await res.json();
  return await res.text();
}

function compose(middlewares, core) {
  return async (ctx) => {
    let index = -1;
    const dispatch = async (i) => {
      if (i <= index) throw new Error('Middleware next() called multiple times');
      index = i;
      const fn = middlewares[i] || core;
      if (!fn) return undefined;
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

class Query {
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
    this.cacheTime = options.cacheTime ?? 5 * 60_000;
    this.refetchOnFocus = options.refetchOnFocus ?? true;
    this.refetchOnReconnect = options.refetchOnReconnect ?? true;
    this.retry = options.retry ?? 0;
    this.retryDelay = options.retryDelay ?? defaultRetryDelay;
    this.dedupe = options.dedupe ?? true;
    this.refetchOnInvalidate = options.refetchOnInvalidate ?? true;

    this.#state = state({
      data: undefined,
      error: null,
      status: /** @type {QueryStatus} */ ('idle'),
      fetching: false,
      updatedAt: null,
      errorAt: null,
      invalidated: false,
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
      status: hadData ? this.status : 'loading',
      error: null,
    });

    const run = async () => {
      const maxRetry = Math.max(0, this.retry ?? 0);
      for (let attempt = 1; attempt <= maxRetry + 1; attempt++) {
        try {
          const data = await this.fetcher(ctx);
          this.setState({
            data,
            error: null,
            status: 'success',
            fetching: false,
            updatedAt: now(),
            errorAt: null,
            invalidated: false,
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
              status: 'error',
              fetching: false,
              errorAt: now(),
            });
            throw err;
          }
          const delay = this.retryDelay?.(attempt) ?? defaultRetryDelay(attempt);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
      return undefined;
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
    this.#state.set({ ...current, ...(partial || {}) });
  }

  #subscribe(selectorOrListener, listener, equalityFn) {
    if (typeof selectorOrListener === 'function' && listener === undefined) {
      const l = selectorOrListener;
      return this.#state.subscribe((next, prev) => l(next, prev));
    }
    const selector = selectorOrListener;
    if (typeof selector !== 'function' || typeof listener !== 'function') {
      throw new Error('subscribe(selector, listener, equalityFn?): invalid arguments');
    }
    const eq = typeof equalityFn === 'function' ? equalityFn : Object.is;
    let prevSelected = selector(this.#state.get());
    return this.#state.subscribe((next) => {
      const nextSelected = selector(next);
      if (eq(prevSelected, nextSelected)) return;
      const p = prevSelected;
      prevSelected = nextSelected;
      listener(nextSelected, p);
    });
  }
}

/**
 * Query manager with caching and refetch orchestration.
 */
export class QueryClient {
  #queries = new Map(); // keyString -> Query
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
      const p = existing.ensure();
      if (p && typeof p.catch === 'function') p.catch(() => {});
      return existing;
    }

    const q = new Query(options);
    q.setGcHandler(() => this.#queries.delete(keyStr));
    this.#queries.set(keyStr, q);
    const p = q.ensure();
    if (p && typeof p.catch === 'function') p.catch(() => {});
    return q;
  }

  use(middleware) {
    if (typeof middleware !== 'function') {
      throw new Error('QueryClient.use(middleware): middleware must be a function');
    }
    this.#middlewares.push(middleware);
    return () => {
      const index = this.#middlewares.indexOf(middleware);
      if (index >= 0) this.#middlewares.splice(index, 1);
    };
  }

  service(config = {}) {
    const baseUrl = config.baseUrl || '';
    const serviceMiddlewares = Array.isArray(config.middlewares) ? config.middlewares.slice() : [];
    const endpoints = config.endpoints || {};
    const client = this;

    const request = async (endpoint, input = {}) => {
      if (!endpoint || typeof endpoint !== 'object') {
        throw new Error('service.request(endpoint, params, options): invalid endpoint');
      }
      const params = input.params || {};
      const method = (endpoint.method || 'GET').toUpperCase();
      const path = interpolatePath(endpoint.path || '', params);
      const query = input.query || endpoint.query || null;
      const body = input.body !== undefined ? input.body : undefined;
      const headers = { ...(endpoint.headers || {}), ...(input.headers || {}) };
      const map = input.map || endpoint.map || null;
      const middlewares = [
        ...client.#middlewares,
        ...serviceMiddlewares,
        ...(endpoint.middlewares || []),
        ...(input.middlewares || []),
      ];

      const url = `${baseUrl}${path}${buildQuery(query)}`;
      const core = async (ctx) => {
        const init = { method: ctx.method, headers: ctx.headers, signal: ctx.signal };
        if (ctx.body !== undefined && ctx.method !== 'GET' && ctx.method !== 'HEAD') {
          if (isPlainObject(ctx.body)) {
            if (!init.headers['Content-Type']) init.headers['Content-Type'] = 'application/json';
            init.body = JSON.stringify(ctx.body);
          } else {
            init.body = ctx.body;
          }
        }
        const res = await fetch(ctx.url, init);
        const data = await parseResponse(res);
        if (!res.ok) {
          const err = new Error(`Request failed: ${res.status}`);
          err.status = res.status;
          err.data = data;
          throw err;
        }
        return data;
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
        signal: input.signal,
      };

      const run = compose(middlewares, core);
      const data = await run(ctx);
      return typeof map === 'function' ? map(data) : data;
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
    if (typeof window === 'undefined') return;
    this.#listening = true;

    window.addEventListener('focus', () => {
      for (const q of this.#queries.values()) {
        if (!q.refetchOnFocus) continue;
        if (q.isStale) q.refetch();
      }
    });

    window.addEventListener('online', () => {
      for (const q of this.#queries.values()) {
        if (!q.refetchOnReconnect) continue;
        if (q.isStale) q.refetch();
      }
    });
  }
}

