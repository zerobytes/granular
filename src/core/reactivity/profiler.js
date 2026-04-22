import { scheduler } from './scheduler.js';

class Profiler {
  #enabled = false;
  #events = [];
  #maxEvents = 5000;
  #stats = { schedules: 0, flushes: 0, flushTime: 0, hostsFlushed: 0 };
  #subscribers = new Set();
  #now;

  constructor() {
    this.#now = typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? () => performance.now()
      : () => Date.now();
  }

  enable(options = {}) {
    if (this.#enabled) return;
    this.#enabled = true;
    if (typeof options.maxEvents === 'number') this.#maxEvents = options.maxEvents;
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
    this.#push({
      type: 'schedule',
      time: this.#now(),
      host: this.#hostLabel(host),
      priority,
    });
  }

  onFlushStart(host) {
    if (!this.#enabled) return;
    this.#push({
      type: 'flush:start',
      time: this.#now(),
      host: this.#hostLabel(host),
    });
  }

  onFlushEnd(host, elapsed) {
    if (!this.#enabled) return;
    this.#stats.flushes++;
    this.#stats.hostsFlushed++;
    this.#stats.flushTime += elapsed;
    const event = {
      type: 'flush:end',
      time: this.#now(),
      host: this.#hostLabel(host),
      elapsed,
    };
    this.#push(event);
    for (const fn of this.#subscribers) {
      try { fn(event); } catch {}
    }
  }

  #hostLabel(host) {
    if (!host) return 'unknown';
    if (host.constructor && host.constructor.name) return host.constructor.name;
    return typeof host;
  }

  #push(event) {
    this.#events.push(event);
    if (this.#events.length > this.#maxEvents) {
      this.#events.splice(0, this.#events.length - this.#maxEvents);
    }
  }

  summarizeRecent(timeWindowMs = 1000) {
    const now = this.#now();
    const cutoff = now - timeWindowMs;
    const recent = this.#events.filter((ev) => ev.time >= cutoff);
    const byHost = new Map();
    for (const ev of recent) {
      if (ev.type !== 'flush:end') continue;
      const stat = byHost.get(ev.host) || { count: 0, totalTime: 0 };
      stat.count++;
      stat.totalTime += ev.elapsed || 0;
      byHost.set(ev.host, stat);
    }
    return Array.from(byHost.entries())
      .map(([host, stat]) => ({ host, ...stat, avgTime: stat.totalTime / stat.count }))
      .sort((a, b) => b.totalTime - a.totalTime);
  }
}

export const profiler = new Profiler();
