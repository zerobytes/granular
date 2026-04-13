let activeCollector = null;

export function collectDependencies(fn) {
  const prev = activeCollector;
  const collector = new Map();
  activeCollector = collector;
  try {
    return { value: fn(), deps: Array.from(collector.values()) };
  } finally {
    activeCollector = prev;
  }
}

export function trackDependency(key, value) {
  if (!activeCollector || key == null || value == null) return;
  activeCollector.set(key, value);
}
