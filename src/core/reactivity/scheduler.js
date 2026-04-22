const PRIORITIES = ['sync', 'normal', 'idle'];

class Scheduler {
  #queues = new Map(PRIORITIES.map((p) => [p, new Set()]));
  #flushScheduled = false;
  #flushing = false;
  #profiler = null;
  #flushCount = 0;
  #flushedHosts = 0;

  schedule(host, priority = 'normal') {
    if (!this.#queues.has(priority)) priority = 'normal';
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
    this.#flushOnce('sync');
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
        if (++safety > 1000) {
          console.warn('[granular] Scheduler safety limit hit; possible infinite update loop.');
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
        console.error('[granular] Error during scheduled flush:', err);
      }
      if (this.#profiler) {
        const elapsed = performance.now() - start;
        this.#profiler.onFlushEnd?.(host, elapsed);
      }
    }
  }

  #requestFlush(priority) {
    if (this.#flushScheduled) return;
    if (priority === 'sync') {
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

  setProfiler(profiler) {
    this.#profiler = profiler;
  }

  stats() {
    return {
      flushes: this.#flushCount,
      flushedHosts: this.#flushedHosts,
      pending: PRIORITIES.reduce((acc, p) => acc + this.#queues.get(p).size, 0),
    };
  }
}

export const FLUSH_HOOK = Symbol('granular.scheduler.flush');

export const scheduler = new Scheduler();
