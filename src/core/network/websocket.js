import { EventHub } from '../events/event-hub.js';
import { state } from '../reactivity/state.js';

function defaultSerialize(value) {
  if (typeof value === 'string') return value;
  if (value instanceof ArrayBuffer) return value;
  if (value instanceof Blob) return value;
  return JSON.stringify(value);
}

function defaultParse(value) {
  return value;
}

function defaultDelay(attempt) {
  return Math.min(1000 * Math.pow(2, Math.max(0, attempt - 1)), 10_000);
}

export class WebSocketClient {
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
    this.#serialize = typeof options.serialize === 'function' ? options.serialize : defaultSerialize;
    this.#parse = typeof options.parse === 'function' ? options.parse : defaultParse;
    this.#reconnect = options.reconnect ?? true;
    this.#maxRetries = options.maxRetries ?? Infinity;
    this.#delay = typeof options.reconnectDelay === 'function' ? options.reconnectDelay : defaultDelay;

    this.#state = state({
      status: 'idle',
      connected: false,
      reconnecting: false,
      attempts: 0,
      lastMessage: null,
      lastError: null,
    });

    if (options.autoConnect ?? true) {
      this.connect();
    }
  }

  state() {
    return this.#state;
  }

  before() {
    return this.#events.phase('before');
  }

  after() {
    return this.#events.phase('after');
  }

  setUrl(next) {
    this.#url = next;
  }

  connect() {
    if (!this.#url) throw new Error('WebSocketClient.connect: url is required');
    if (this.#ws && (this.#ws.readyState === WebSocket.OPEN || this.#ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.#clearReconnect();
    this.#manualClose = false;
    this.#state.set().status = 'connecting';
    this.#state.set().reconnecting = false;

    const ws = new WebSocket(this.#url, this.#protocols);
    this.#ws = ws;

    ws.addEventListener('open', (event) => {
      this.#state.set().status = 'open';
      this.#state.set().connected = true;
      this.#state.set().reconnecting = false;
      this.#state.set().attempts = 0;
      this.#events.emitAfter('open', { event }, { client: this });
    });

    ws.addEventListener('message', (event) => {
      let data = event.data;
      try {
        data = this.#parse(data);
      } catch (err) {
        this.#state.set().lastError = err;
        this.#events.emitAfter('error', { error: err }, { client: this });
        return;
      }
      const payload = { data, raw: event.data };
      const ok = this.#events.emitBefore('message', payload, { client: this });
      if (!ok) return;
      this.#state.set().lastMessage = data;
      this.#events.emitAfter('message', payload, { client: this });
    });

    ws.addEventListener('error', (event) => {
      this.#state.set().lastError = event;
      this.#events.emitAfter('error', { error: event }, { client: this });
    });

    ws.addEventListener('close', (event) => {
      this.#state.set().status = 'closed';
      this.#state.set().connected = false;
      this.#events.emitAfter('close', { event }, { client: this });
      if (this.#manualClose) return;
      if (!this.#reconnect) return;
      this.#scheduleReconnect();
    });
  }

  send(value) {
    if (!this.#ws || this.#ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocketClient.send: socket is not open');
    }
    const payload = { data: value };
    const ok = this.#events.emitBefore('send', payload, { client: this });
    if (!ok) return;
    const raw = this.#serialize(value);
    this.#ws.send(raw);
    this.#events.emitAfter('send', { data: value, raw }, { client: this });
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
    this.#events.emitAfter('reconnect', { attempt: attempts, delay }, { client: this });
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
}

export function createWebSocket(options) {
  return new WebSocketClient(options);
}
