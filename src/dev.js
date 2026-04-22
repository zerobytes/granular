import { profiler, scheduler } from './core/runtime.js';
import { setDevHooks } from './core/reactivity/dev-hooks.js';

const warned = new Set();
let installed = false;
let opts = {
  proxyCoercion: true,
  flushLoops: true,
  unhandledRejections: true,
  flushLoopThreshold: 50,
  slowFlushMs: 16,
  warnOnce: true,
  trace: false,
};

function emitWarning(key, message) {
  if (opts.warnOnce && warned.has(key)) return;
  warned.add(key);
  if (opts.trace) {
    console.warn('[granular/dev]', message, '\n', new Error().stack);
  } else {
    console.warn('[granular/dev]', message);
  }
}

function installCoercionHook() {
  setDevHooks({
    onCoerce(kind, _source, hint) {
      if (hint === 'string' || hint === 'valueOf') {
        emitWarning(`coerce:${kind}:${hint}`,
          `Implicit coercion of a reactive ${kind} via ${hint === 'valueOf' ? 'valueOf()' : 'toString()/template literal'}. ` +
          `Prefer .get() or use after()/derive()/cls\`...\`/tpl\`...\` for reactivity.`);
      } else if (hint === 'number') {
        emitWarning(`coerce:${kind}:number`,
          `Numeric coercion of a reactive ${kind}. The current value was used; the result will not update reactively. ` +
          `Use .get() or wrap in after()/derive() to stay reactive.`);
      } else if (hint === 'default') {
        emitWarning(`coerce:${kind}:default`,
          `Reactive ${kind} used in a value-producing context (e.g. concatenation). ` +
          `Result is a snapshot, not reactive. Prefer cls\`...\`, tpl\`...\`, or after()/derive().`);
      }
    },
  });
}

function installFlushGuard() {
  let lastFlushAt = 0;
  let flushBurst = 0;
  scheduler.setProfiler({
    onSchedule() {},
    onFlushStart() {},
    onFlushEnd(host, elapsed) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - lastFlushAt < 16) flushBurst++;
      else flushBurst = 0;
      lastFlushAt = now;
      const name = host?.constructor?.name ?? 'host';
      if (flushBurst > opts.flushLoopThreshold) {
        emitWarning(`flush-loop:${name}`,
          `${name} flushed > ${opts.flushLoopThreshold} times within 16ms. Possible re-entrant update loop.`);
      }
      if (elapsed > opts.slowFlushMs) {
        emitWarning(`slow-flush:${name}`,
          `${name} flush took ${elapsed.toFixed(2)}ms (> ${opts.slowFlushMs}ms budget).`);
      }
    },
  });
}

function installRejectionHandler() {
  const handler = (reason) => {
    console.warn('[granular/dev] Unhandled promise rejection:', reason);
  };
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('unhandledrejection', (event) => handler(event.reason));
  } else if (typeof process !== 'undefined' && typeof process.on === 'function') {
    process.on('unhandledRejection', handler);
  }
}

export function enableDevMode(options = {}) {
  if (installed) return { disable: () => {} };
  installed = true;
  opts = { ...opts, ...options };
  warned.clear();
  if (opts.proxyCoercion) installCoercionHook();
  if (opts.flushLoops) installFlushGuard();
  if (opts.unhandledRejections) installRejectionHandler();
  profiler.enable();
  console.info('[granular/dev] Dev mode enabled. Disable in production builds.');
  return {
    disable: () => {
      installed = false;
      setDevHooks(null);
      scheduler.setProfiler(null);
      profiler.disable();
      warned.clear();
    },
  };
}

export function clearDevWarnings() {
  warned.clear();
}

export { profiler };
