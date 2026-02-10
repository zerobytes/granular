import { createAnchor } from '../dom/dom.js';
import { Renderer } from '../renderable/renderer.js';
import { state } from '../reactivity/state.js';
import { after } from '../reactivity/observe.js';

function normalizeBase(basePath) {
  if (!basePath) return '';
  let base = basePath.trim();
  if (!base.startsWith('/')) base = `/${base}`;
  if (base.length > 1 && base.endsWith('/')) base = base.slice(0, -1);
  return base;
}

function normalizePathname(pathname, trailingSlash) {
  let path = pathname || '/';
  if (!path.startsWith('/')) path = `/${path}`;
  if (path.length > 1 && path.endsWith('/') && trailingSlash !== 'preserve') {
    path = path.slice(0, -1);
  }
  return path;
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compilePath(path, { caseSensitive, trailingSlash }) {
  const input = path === '' ? '/' : path;
  const normalized = normalizePathname(input, 'preserve');
  if (normalized === '/*' || normalized === '*') {
    return {
      regex: /^.*$/,
      keys: ['*'],
      score: 0,
    };
  }

  const segments = normalized.split('/').filter(Boolean);
  const keys = [];
  let score = 0;
  let pattern = '^';

  for (const seg of segments) {
    if (seg === '*') {
      keys.push('*');
      pattern += '(?:/(.*))?';
      score += 1;
      continue;
    }

    if (seg.startsWith(':')) {
      const raw = seg.slice(1);
      const isOptional = raw.endsWith('?');
      const name = isOptional ? raw.slice(0, -1) : raw;
      keys.push(name);
      if (isOptional) {
        pattern += '(?:/([^/]+))?';
      } else {
        pattern += '/([^/]+)';
      }
      score += 2;
      continue;
    }

    pattern += `/${escapeRegex(seg)}`;
    score += 3;
  }

  if (segments.length === 0) pattern += '/?';

  if (trailingSlash === 'preserve') {
    pattern += '$';
  } else {
    pattern += '/?$';
  }

  const flags = caseSensitive ? '' : 'i';
  return {
    regex: new RegExp(pattern, flags),
    keys,
    score,
  };
}

function parseQuery(search) {
  const out = {};
  if (!search) return out;
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
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

function buildUrl({ pathname, search, hash }) {
  const q = search || '';
  const h = hash || '';
  return `${pathname}${q}${h}`;
}

function joinPaths(parentPath, childPath) {
  const child = childPath == null ? '' : String(childPath).trim();
  if (child.startsWith('/')) return child || '/';
  const base = parentPath && parentPath !== '/' ? parentPath : '';
  if (!child) return base || '/';
  return `${base}/${child}`;
}

function resolveTarget(target) {
  if (typeof target === 'string') return document.querySelector(target);
  return target;
}

function isPageDefinition(value) {
  return typeof value === 'function';
}

function isPromise(value) {
  return !!value && typeof value.then === 'function';
}

export class Router {
  #routes = [];
  #routeSeq = 0;
  #options;
  #mountParent = null;
  #mountAnchor = null;
  #current = null;
  #listening = false;
  #navToken = 0;
  #beforeEach = new Set();
  #afterEach = new Set();
  #memory = null;

  constructor(options = {}) {
    this.#options = {
      mode: options.mode || 'history',
      basePath: normalizeBase(options.basePath || ''),
      caseSensitive: !!options.caseSensitive,
      trailingSlash: options.trailingSlash || 'ignore',
      maxRedirects: options.maxRedirects ?? 8,
      scrollRestoration: options.scrollRestoration ?? true,
      transition: options.transition || null,
      errorPage: options.errorPage || null,
    };

    if (this.#options.mode === 'memory') {
      const initial = options.initialUrl || '/';
      this.#memory = {
        stack: [this.#parseUrl(initial)],
        index: 0,
      };
    }
  }

  add(pathOrConfig, PageClass, options = {}) {
    let config = null;
    if (typeof pathOrConfig === 'string') {
      config = { path: pathOrConfig, page: PageClass, ...options };
    } else if (isPageDefinition(pathOrConfig)) {
      const route = pathOrConfig.route || pathOrConfig.path || null;
      if (route && typeof route === 'object') {
        config = { ...route, page: pathOrConfig, ...options };
      } else {
        config = { path: route, page: pathOrConfig, ...options };
      }
    } else if (pathOrConfig && typeof pathOrConfig === 'object') {
      config = { ...pathOrConfig };
    }

    if (!config || config.path == null) {
      throw new Error('Router.add: invalid route config');
    }

    return this.#addRouteConfig(config, null);
  }

  #addRouteConfig(config, parent) {
    const hasChildren = Array.isArray(config.children) && config.children.length > 0;
    const hasTarget = !!config.page || !!config.load || !!config.redirect;
    if (!hasTarget && !hasChildren && !config.layout) {
      throw new Error(`Router.add: route "${config.path}" must provide page, load, redirect, layout, or children`);
    }

    const fullPath = parent ? joinPaths(parent.path, config.path) : joinPaths('', config.path);
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
      children: [],
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
    const el = resolveTarget(target);
    if (!el) throw new Error('Router.mount: target not found');
    if (this.#mountParent) return;
    this.#mountParent = el;
    this.#mountAnchor = createAnchor('router');
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
    if (this.#options.mode === 'history') {
      window.addEventListener('popstate', this.#handlePop);
    } else if (this.#options.mode === 'hash') {
      window.addEventListener('hashchange', this.#handlePop);
      window.addEventListener('popstate', this.#handlePop);
    }
    this.#handleLocationChange({ source: 'start' });
  }

  stop() {
    if (!this.#listening) return;
    this.#listening = false;
    window.removeEventListener('popstate', this.#handlePop);
    window.removeEventListener('hashchange', this.#handlePop);
  }

  navigate(to, options = {}) {
    return this.#goTo(to, { ...options, replace: false });
  }

  replace(to, options = {}) {
    return this.#goTo(to, { ...options, replace: true });
  }

  back() {
    if (this.#options.mode === 'memory') {
      this.#memoryBack();
      return;
    }
    history.back();
  }

  forward() {
    if (this.#options.mode === 'memory') {
      this.#memoryForward();
      return;
    }
    history.forward();
  }

  go(delta) {
    if (this.#options.mode === 'memory') {
      this.#memoryGo(delta);
      return;
    }
    history.go(delta);
  }

  resolve(path) {
    if (typeof path === 'string') {
      const url = new URL(path, window.location.origin);
      let pathname = normalizePathname(url.pathname, this.#options.trailingSlash);
      const base = this.#options.basePath;
      if (base && !pathname.startsWith(base)) pathname = `${base}${pathname}`;
      return `${pathname}${url.search || ''}${url.hash || ''}`;
    }
    const pathname = normalizePathname(path.pathname || '/', this.#options.trailingSlash);
    const search = path.search || toSearch(path.query);
    const hash = path.hash || '';
    const base = this.#options.basePath;
    const fullPath = base && !pathname.startsWith(base) ? `${base}${pathname}` : pathname;
    return `${fullPath}${search}${hash}`;
  }

  parse(url) {
    const loc = this.#parseUrl(url);
    const match = this.#match(loc.pathname);
    if (!match) return { location: loc, match: null };
    return { location: loc, match };
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
      source: 'revalidate',
    };

    const redirectChain = new Set();
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
      const pathname = current?.pathname || '/';
      const hash = preserveHash ? current?.hash || '' : '';
      const target = { pathname, query: next, hash };
      if (replace) {
        this.replace(target);
      } else {
        this.navigate(target);
      }
    });

    Object.defineProperty(q, 'dispose', {
      value: () => {
        if (typeof unsubRoute === 'function') unsubRoute();
        if (typeof unsubState === 'function') unsubState();
      },
      enumerable: false,
    });

    return q;
  }

  #handlePop = () => {
    this.#handleLocationChange({ source: 'pop' });
  };

  #readLocation() {
    if (this.#options.mode === 'memory') {
      return this.#memory.stack[this.#memory.index];
    }
    if (this.#options.mode === 'hash') {
      const raw = window.location.hash ? window.location.hash.slice(1) : '/';
      return this.#parseUrl(raw);
    }
    return this.#parseUrl(window.location.href);
  }

  #parseUrl(input) {
    const base = window.location.origin;
    const url = new URL(input, base);
    const pathname = normalizePathname(url.pathname, this.#options.trailingSlash);
    const basePath = this.#options.basePath;
    const stripped =
      basePath && pathname.startsWith(basePath) ? pathname.slice(basePath.length) || '/' : pathname;
    return {
      pathname: normalizePathname(stripped, this.#options.trailingSlash),
      search: url.search || '',
      hash: url.hash || '',
      query: parseQuery(url.search),
      state: history.state ?? null,
      url: buildUrl({ pathname: url.pathname, search: url.search, hash: url.hash }),
    };
  }

  #memoryBack() {
    if (this.#memory.index <= 0) return;
    this.#memory.index -= 1;
    this.#handleLocationChange({ source: 'pop' });
  }

  #memoryForward() {
    if (this.#memory.index >= this.#memory.stack.length - 1) return;
    this.#memory.index += 1;
    this.#handleLocationChange({ source: 'pop' });
  }

  #memoryGo(delta) {
    const next = this.#memory.index + delta;
    if (next < 0 || next >= this.#memory.stack.length) return;
    this.#memory.index = next;
    this.#handleLocationChange({ source: 'pop' });
  }

  async #goTo(to, { replace, state, redirectChain } = {}) {
    const nextInput = typeof to === 'string' ? to : this.resolve(to);
    const next = this.#parseUrl(nextInput);
    next.state = state ?? null;

    const token = ++this.#navToken;
    const ok = await this.#runNavigation(next, { token, source: 'navigate', redirectChain });
    if (!ok) return;

    if (this.#options.mode === 'memory') {
      if (replace) {
        this.#memory.stack[this.#memory.index] = { ...next, state: state ?? null };
      } else {
        this.#memory.stack = this.#memory.stack.slice(0, this.#memory.index + 1);
        this.#memory.stack.push({ ...next, state: state ?? null });
        this.#memory.index = this.#memory.stack.length - 1;
      }
      return;
    }

    const full = this.resolve(next.pathname) + (next.search || '') + (next.hash || '');
    if (this.#options.mode === 'hash') {
      const url = `#${full}`;
      history[replace ? 'replaceState' : 'pushState'](state ?? null, '', url);
    } else {
      history[replace ? 'replaceState' : 'pushState'](state ?? null, '', full);
    }
  }

  async #handleLocationChange({ source, redirectChain } = {}) {
    if (!this.#mountParent || !this.#mountAnchor) return;
    const token = ++this.#navToken;
    const loc = this.#readLocation();
    const chain = redirectChain || new Set();
    await this.#runNavigation(loc, { token, source, redirectChain: chain });
  }

  #match(pathname) {
    for (const route of this.#routes) {
      const m = route.regex.exec(pathname);
      if (!m) continue;
      const params = {};
      for (let i = 0; i < route.keys.length; i++) {
        const key = route.keys[i];
        params[key] = m[i + 1] ? decodeURIComponent(m[i + 1]) : undefined;
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

    const match = this.#match(location.pathname);
    if (!match) return false;

    const { route, params, chain } = match;
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
      source,
    };

    try {
      const redirect = await this.#resolveRedirect(chain, ctx, redirectChain);
      if (redirect) return false;

      const ok = await this.#runGuards(chain, ctx, redirectChain);
      if (!ok) {
        if (source === 'pop') this.#restoreCurrentUrl();
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
      if (typeof route.redirect === 'string') target = route.redirect;
      if (typeof route.redirect === 'function') target = route.redirect({ ...ctx, route });
      if (typeof target === 'string') {
        return this.#redirectTo(target, redirectChain);
      }
      if (isPromise(target)) {
        const next = await target;
        if (typeof next === 'string') return this.#redirectTo(next, redirectChain);
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
      if (typeof route.guards === 'function') guards.push(route.guards);
      if (typeof route.beforeEnter === 'function') guards.push(route.beforeEnter);
      if (typeof route.page?.guards === 'function') guards.push(route.page.guards);
      if (Array.isArray(route.page?.guards)) guards.push(...route.page.guards);
      if (typeof route.page?.beforeEnter === 'function') guards.push(route.page.beforeEnter);

      for (const fn of guards) {
        const res = await fn({ ...ctx, route });
        if (await this.#handleGuardResult(res, redirectChain)) return false;
      }
    }
    return true;
  }

  async #handleGuardResult(result, redirectChain) {
    if (result === false) return true;
    if (typeof result === 'string') return this.#redirectTo(result, redirectChain);
    if (result && typeof result === 'object' && typeof result.redirect === 'string') {
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
    let leafData = undefined;
    for (const route of chain) {
      const loader = route.loader || route.page?.loader;
      if (typeof loader !== 'function') continue;
      const data = await loader({ ...ctx, route });
      out[route.id] = data;
      if (route === chain[chain.length - 1]) leafData = data;
    }
    return { map: out, leaf: leafData };
  }

  async #resolvePage(route, ctx) {
    if (route.page && isPageDefinition(route.page)) return route.page;
    if (typeof route.load === 'function') {
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
      ...(typeof ctx.route.props === 'function' ? ctx.route.props(ctx) : {}),
    };

    let page;
    let isClassBased = false;
    
    // Check if it's a class (not an arrow function and has prototype methods)
    if (PageClass.prototype && PageClass.prototype.constructor === PageClass && !PageClass.__zbFactory) {
      try {
        page = new PageClass(props);
        isClassBased = true;
      } catch (e) {
        page = PageClass(props);
      }
    } else {
      page = PageClass(props);
    }
    
    // Only set router/route/etc on class instances, not on renderables
    if (isClassBased && page && typeof page === 'object') {
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
      prev.page.emitBefore?.('routeLeave', leaveCtx, { router: this, page: prev.page });
      prev.page.emitAfter?.('routeLeave', leaveCtx, { router: this, page: prev.page });
    }

    page.emitBefore?.('routeEnter', ctx, { router: this, page });
    
    const rootRenderable = this.#buildLayoutTree(page, ctx);
    const mountedValues = Renderer.normalize(rootRenderable);
    const marker = document.createTextNode('');
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
    
    page.emitAfter?.('routeEnter', ctx, { router: this, page });

    if (prev) this.#teardownCurrent();

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
      routeData: ctx.routeData,
    };

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
    current.page.emitBefore?.('routeUpdate', ctx, { router: this, page: current.page });
    current.page.emitAfter?.('routeUpdate', ctx, { router: this, page: current.page });
    for (const fn of this.#afterEach) fn({ ...ctx, page: current.page });
    this.#applyScrollRestoration(ctx);
  }

  async #applyTransition(prevView, nextView, transition) {
    if (!transition || !prevView) return;
    const enter = transition.enterClass || 'zb-route-enter';
    const enterActive = transition.enterActiveClass || 'zb-route-enter-active';
    const exit = transition.exitClass || 'zb-route-exit';
    const exitActive = transition.exitActiveClass || 'zb-route-exit-active';
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
  }

  #buildLayoutTree(page, ctx) {
    let outlet = page;
    const chain = ctx.chain || [];
    for (let i = chain.length - 1; i >= 0; i--) {
      const route = chain[i];
      if (typeof route.layout === 'function') {
        outlet = route.layout(outlet, { ...ctx, route });
      }
    }
    return outlet;
  }

  async #redirectTo(target, redirectChain) {
    if (redirectChain.size >= this.#options.maxRedirects) {
      throw new Error('Router: too many redirects');
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
      page.emitBefore('routeError', errorCtx, { router: this, page });
      page.emitAfter('routeError', errorCtx, { router: this, page });
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
    const full = this.resolve(current.pathname) + (current.search || '') + (current.hash || '');
    if (this.#options.mode === 'hash') {
      history.replaceState(current.state ?? null, '', `#${full}`);
      return;
    }
    history.replaceState(current.state ?? null, '', full);
  }
}

export function createRouter(options) {
  const router = new Router(options);
  if (options?.routes && Array.isArray(options.routes)) {
    for (const route of options.routes) {
      router.add(route);
    }
  }
  return router;
}

export const router = new Router();
