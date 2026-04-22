import { profiler } from './core/reactivity/profiler.js';

const HOOK_KEY = '__GRANULAR_DEVTOOLS_HOOK__';

export function installDevtoolsHook() {
  const target = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
  if (!target) return null;
  if (target[HOOK_KEY]) return target[HOOK_KEY];

  const listeners = new Set();
  const recentEvents = [];
  const MAX_RECENT = 200;

  let unsub = null;
  function attach() {
    if (unsub) return;
    if (!profiler.isEnabled()) profiler.enable({ maxEvents: 5000 });
    unsub = profiler.subscribe((event) => {
      recentEvents.push(event);
      if (recentEvents.length > MAX_RECENT) recentEvents.shift();
      const payload = { source: 'granular-devtools', kind: 'event', event };
      try { target.postMessage(payload, '*'); } catch {}
      for (const fn of listeners) {
        try { fn(event); } catch {}
      }
    });
  }
  function detach() {
    if (unsub) { unsub(); unsub = null; }
  }

  const hook = {
    version: 1,
    profiler,
    isAttached() { return !!unsub; },
    attach,
    detach,
    onEvent(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    snapshot() {
      return {
        events: profiler.events(),
        stats: profiler.stats(),
        topByHost: profiler.summarizeRecent(2000),
        recentEvents: recentEvents.slice(),
      };
    },
    reset() { profiler.reset(); recentEvents.length = 0; },
  };

  target[HOOK_KEY] = hook;
  try {
    target.postMessage({ source: 'granular-devtools', kind: 'hook-installed', version: hook.version }, '*');
  } catch {}
  return hook;
}

export const DEVTOOLS_HOOK_KEY = HOOK_KEY;
