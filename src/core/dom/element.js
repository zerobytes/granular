import { Renderable } from '../renderable/renderable.js';
import { Renderer } from '../renderable/renderer.js';
import { isObservableArray } from '../collections/observable-array.js';
import { createComment, clearBetween } from './dom.js';
import { normalizeInputFormat, applyInputFormat } from './input-format.js';
import { isWhen, readWhenValue, subscribeWhenValue } from './when.js';
import { isSignal, readSignal, subscribeSignal, getMappedArrayMeta } from '../reactivity/signal.js';
import { isState, isStatePath, readState, subscribeState, getMappedMeta, readStateMeta, subscribeStateMeta } from '../reactivity/state.js';
import { list } from './list.js';

const voidElements = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

export class ElementNode extends Renderable {
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
    const el = document.createElement(this.tagName);
    this.#el = el;
    this.#applyProps(el);
    this.#appendChildren(el);
    parent.insertBefore(el, beforeNode);
  }

  unmount() {
    if (!this.#mounted) return;
    this.#mounted = false;
    for (const unsub of this.#unsubs) unsub();
    this.#unsubs = [];
    this.#cleanupChildren();
    this.#el?.remove();
    this.#el = null;
  }

  renderToString(render) {
    const tag = this.tagName;
    const props = this.props || {};
    const lower = tag.toLowerCase();
    const attrParts = [];
    let innerHtml = null;
    let textContent = null;

    for (const [key, rawValue] of Object.entries(props)) {
      if (key === 'children' || key === 'content') continue;
      if (key === 'format') continue;
      if (key.startsWith('on') && typeof rawValue === 'function') continue;
      let value = rawValue;
      if (isWhen(value)) value = readWhenValue(value);
      if (isSignal(value)) value = readSignal(value);
      if (isState(value) || isStatePath(value)) value = readState(value);

      if (key === 'style') {
        if (value && typeof value === 'object') {
          const styles = [];
          for (const [k, v] of Object.entries(value)) {
            if (v == null || v === false) continue;
            const name = k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
            styles.push(`${name}:${v}`);
          }
          if (styles.length) attrParts.push(`style="${styles.join(';')}"`);
        } else if (typeof value === 'string') {
          attrParts.push(`style="${render.escape(value)}"`);
        }
        continue;
      }
      if (key === 'className' || key === 'class') {
        if (value != null && value !== false) attrParts.push(`class="${render.escape(String(value))}"`);
        continue;
      }
      if (key === 'htmlFor') {
        if (value != null && value !== false) attrParts.push(`for="${render.escape(String(value))}"`);
        continue;
      }
      if (key === 'value' && lower === 'input' && props.format != null) {
        const resolvedFormat = isSignal(props.format)
          ? readSignal(props.format)
          : isState(props.format) || isStatePath(props.format)
            ? readState(props.format)
            : props.format;
        const formatConfig = normalizeInputFormat(resolvedFormat);
        const formatMode = formatConfig?.mode ?? 'both';
        const formatted = applyInputFormat(value ?? '', formatConfig);
        value =
          formatMode === 'value-only'
            ? (formatted.raw ?? formatted.value ?? '')
            : (formatted.visual ?? formatted.value ?? '');
      }
      if (key === 'textContent') {
        textContent = value == null ? '' : String(value);
        continue;
      }
      if (key === 'innerHTML') {
        innerHtml = value == null ? '' : String(value);
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

    const attrs = attrParts.length ? ` ${attrParts.join(' ')}` : '';
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
    const html = children.map((child) => render(child)).join('');
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
    const resolveFormat = (value) => {
      if (isSignal(value)) return readSignal(value);
      if (isState(value) || isStatePath(value)) return readState(value);
      return value;
    };
    const formatConfig = tagName === 'input' ? normalizeInputFormat(resolveFormat(props.format)) : null;
    const formatMode = formatConfig?.mode ?? 'both';
    const formatValue = (next) => {
      const formatted = applyInputFormat(next ?? '', formatConfig);
      const visualValue =
        formatMode === 'value-only'
          ? (formatted.raw ?? formatted.value ?? '')
          : (formatted.visual ?? formatted.value ?? '');
      const stateValue =
        formatMode === 'visual-only'
          ? (formatted.raw ?? formatted.value ?? '')
          : (formatted.value ?? formatted.visual ?? '');
      return { formatted, visualValue, stateValue };
    };
    for (const [key, rawValue] of Object.entries(props)) {
      if (key === 'children' || key === 'content') continue;
      if (key === 'format') continue;
      if (key === 'style') {
        this.#applyStyle(el, rawValue);
        continue;
      }
      if (isWhen(rawValue)) {
        const update = () => this.#setProp(el, key, readWhenValue(rawValue));
        update();
        const unsub = subscribeWhenValue(rawValue, update);
        if (unsub) this.#unsubs.push(unsub);
        continue;
      }
      if (isSignal(rawValue)) {
        const update = () => {
          const nextValue = readSignal(rawValue);
          if (key === 'value' && formatConfig) {
            const { visualValue } = formatValue(nextValue);
            this.#setProp(el, key, visualValue);
            return;
          }
          this.#setProp(el, key, nextValue);
        };
        update();
        const unsub = subscribeSignal(rawValue, update);
        if (unsub) this.#unsubs.push(unsub);
        if (key === 'value') {
          if (formatConfig) {
            formatBound = true;
            const onInput = (ev) => {
              const { visualValue, stateValue } = formatValue(ev.target?.value ?? '');
              if (ev.target) ev.target.value = visualValue;
              const ok = rawValue.set?.(stateValue);
              if (ok === false) update();
            };
            el.addEventListener('input', onInput, true);
            el.addEventListener('change', onInput, true);
            this.#unsubs.push(() => {
              el.removeEventListener('input', onInput, true);
              el.removeEventListener('change', onInput, true);
            });
          } else {
            const onInput = (ev) => {
              const ok = rawValue.set?.(ev.target?.value ?? '');
              if (ok === false) update();
            };
            el.addEventListener('input', onInput);
            el.addEventListener('change', onInput);
            this.#unsubs.push(() => {
              el.removeEventListener('input', onInput);
              el.removeEventListener('change', onInput);
            });
          }
        }
        if (key === 'checked') {
          const onChange = (ev) => {
            const ok = rawValue.set?.(!!ev.target?.checked);
            if (ok === false) update();
          };
          el.addEventListener('change', onChange);
          this.#unsubs.push(() => el.removeEventListener('change', onChange));
        }
        continue;
      }
      if (isState(rawValue) || isStatePath(rawValue)) {
        const update = () => {
          const nextValue = readState(rawValue);
          if (key === 'value' && formatConfig) {
            const { visualValue } = formatValue(nextValue);
            this.#setProp(el, key, visualValue);
            return;
          }
          this.#setProp(el, key, nextValue);
        };
        update();
        const unsub = subscribeState(rawValue, update);
        if (unsub) this.#unsubs.push(unsub);
        if (key === 'value') {
          if (formatConfig) {
            formatBound = true;
            const onInput = (ev) => {
              const { visualValue, stateValue } = formatValue(ev.target?.value ?? '');
              if (ev.target) ev.target.value = visualValue;
              const ok = rawValue.set?.(stateValue);
              if (ok === false) update();
            };
            el.addEventListener('input', onInput, true);
            el.addEventListener('change', onInput, true);
            this.#unsubs.push(() => {
              el.removeEventListener('input', onInput, true);
              el.removeEventListener('change', onInput, true);
            });
          } else {
            const onInput = (ev) => {
              const ok = rawValue.set?.(ev.target?.value ?? '');
              if (ok === false) update();
            };
            el.addEventListener('input', onInput);
            el.addEventListener('change', onInput);
            this.#unsubs.push(() => {
              el.removeEventListener('input', onInput);
              el.removeEventListener('change', onInput);
            });
          }
        }
        if (key === 'checked') {
          const onChange = (ev) => {
            const ok = rawValue.set?.(!!ev.target?.checked);
            if (ok === false) update();
          };
          el.addEventListener('change', onChange);
          this.#unsubs.push(() => el.removeEventListener('change', onChange));
        }
        continue;
      }
      if (key === 'value' && formatConfig) {
        const { visualValue } = formatValue(rawValue);
        this.#setProp(el, key, visualValue);
        formatBound = true;
        continue;
      }
      this.#setProp(el, key, rawValue);
    }
    if (formatConfig && !formatBound) {
      const onInput = (ev) => {
        const { visualValue } = formatValue(ev.target?.value ?? '');
        if (ev.target) ev.target.value = visualValue;
      };
      el.addEventListener('input', onInput, true);
      el.addEventListener('change', onInput, true);
      this.#unsubs.push(() => {
        el.removeEventListener('input', onInput, true);
        el.removeEventListener('change', onInput, true);
      });
    }
  }

  #setProp(el, key, value) {
    if (isWhen(value)) value = readWhenValue(value);
    if (isSignal(value)) value = readSignal(value);
    if (isState(value) || isStatePath(value)) value = readState(value);
    if (key === 'style') {
      if (value && typeof value === 'object') {
        Object.assign(el.style, value);
        return;
      }
      if (typeof value === 'string') {
        el.style.cssText = value;
        return;
      }
    }
    if (key.startsWith('on') && typeof value === 'function') {
      const eventName = key.substring(2).toLowerCase();
      el.addEventListener(eventName, value);
      this.#unsubs.push(() => el.removeEventListener(eventName, value));
      return;
    }
    if (key === 'className' || key === 'class') {
      el.className = value ?? '';
      return;
    }
    if (key === 'htmlFor') {
      el.setAttribute('for', value ?? '');
      return;
    }
    if (key === 'value') {
      try {
        el.value = value ?? '';
      } catch {}
      return;
    }
    if (key === 'checked') {
      try {
        el.checked = !!value;
      } catch {}
      return;
    }
    if (key === 'contentEditable') {
      try {
        el.contentEditable = value ? 'true' : 'false';
      } catch {}
      return;
    }
    if (key === 'textContent') {
      el.textContent = value ?? '';
      return;
    }
    if (key === 'innerHTML') {
      el.innerHTML = value ?? '';
      return;
    }
    if (value === false || value == null) {
      el.removeAttribute(key);
      if (key in el) {
        try {
          el[key] = false;
        } catch {}
      }
      return;
    }
    if (value === true) {
      el.setAttribute(key, '');
      if (key in el) {
        try {
          el[key] = true;
        } catch {}
      }
      return;
    }
    el.setAttribute(key, value);
    if (key in el) {
      try {
        el[key] = value;
      } catch {}
    }
  }

  #applyStyle(el, styleValue) {
    const cleanupStyleSubs = () => {
      for (const unsub of this.#styleUnsubs) unsub();
      this.#styleUnsubs = [];
    };

    const applyValue = (value) => {
      if (typeof value === 'string') {
        cleanupStyleSubs();
        el.style.cssText = value;
        return;
      }
      if (value && typeof value === 'object') {
        cleanupStyleSubs();
        applyObject(value);
      }
    };

    const applyObject = (styleObj) => {
      if (!styleObj || typeof styleObj !== 'object') return;
      for (const [k, v] of Object.entries(styleObj)) {
        if (typeof v === 'function') {
          try {
            el.style[k] = v();
          } catch {
            el.style[k] = '';
          }
          continue;
        }
        if (isSignal(v)) {
          const update = () => {
            try {
              el.style[k] = readSignal(v) ?? '';
            } catch {
              el.style[k] = '';
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
              el.style[k] = readState(v) ?? '';
            } catch {
              el.style[k] = '';
            }
          };
          update();
          const unsub = subscribeState(v, update);
          if (unsub) this.#styleUnsubs.push(unsub);
          continue;
        } else {
          el.style[k] = v ?? '';
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


    if (typeof styleValue === 'function') {
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
    const content = Object.prototype.hasOwnProperty.call(this.props, 'content')
      ? this.props.content
      : null;
    const children = this.children.length ? this.children : content != null ? [content] : [];
    for (const child of children) this.#mountChild(el, child, null);
  }

  #mountChild(parent, child, beforeNode) {
    if (child == null || child === false) return;
    const mapped = getMappedArrayMeta(child) || getMappedMeta(child);
    if (mapped) {
      const start = createComment('zb:bind:start', 'map');
      const end = createComment('zb:bind:end', 'map');
      parent.insertBefore(start, beforeNode);
      parent.insertBefore(end, beforeNode);
      const state = { kind: 'static', values: [] };
      const update = () => {
        const src = mapped.path ? readStateMeta(mapped) : readSignal(mapped.signal);
        const list = Array.isArray(src) ? src.map(mapped.mapFn) : [];
        this.#renderDynamic(list, start, end, state);
      };
      update();
      const unsub = mapped.path ? subscribeStateMeta(mapped, update) : subscribeSignal(mapped.signal, update);
      if (unsub) this.#unsubs.push(() => {
        unsub();
        this.#cleanupDynamic(state, start, end);
        start.remove();
        end.remove();
      });
      return;
    }
    if (isSignal(child)) {
      const start = createComment('zb:bind:start', 'signal');
      const end = createComment('zb:bind:end', 'signal');
      parent.insertBefore(start, beforeNode);
      parent.insertBefore(end, beforeNode);
      const state = { kind: 'static', values: [] };
      const update = () => this.#renderDynamic(readSignal(child), start, end, state);
      update();
      const unsub = subscribeSignal(child, update);
      if (unsub) this.#unsubs.push(() => {
        unsub();
        this.#cleanupDynamic(state, start, end);
        start.remove();
        end.remove();
      });
      return;
    }

    if (isState(child) || isStatePath(child)) {
      const start = createComment('zb:bind:start', 'state');
      const end = createComment('zb:bind:end', 'state');
      parent.insertBefore(start, beforeNode);
      parent.insertBefore(end, beforeNode);
      const state = { kind: 'static', values: [] };
      const update = () => this.#renderDynamic(readState(child), start, end, state);
      update();
      const unsub = subscribeState(child, update);
      if (unsub) this.#unsubs.push(() => {
        unsub();
        this.#cleanupDynamic(state, start, end);
        start.remove();
        end.remove();
      });
      return;
    }

    if (isObservableArray(child)) {
      const start = createComment('zb:bind:start', 'list');
      const end = createComment('zb:bind:end', 'list');
      parent.insertBefore(start, beforeNode);
      parent.insertBefore(end, beforeNode);
      const state = { kind: 'list', items: [], unsub: null, source: child };
      this.#renderDynamic(child, start, end, state);
      this.#unsubs.push(() => {
        this.#cleanupDynamic(state, start, end);
        start.remove();
        end.remove();
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

  #cleanupDynamic(state, start, end) {
    if (state.kind === 'static') {
      for (const r of state.values) Renderer.unmount(r);
      state.values = [];
      if (start && end) clearBetween(start, end);
      return;
    }
    if (state.kind === 'list') {
      state.unsub?.();
      for (const it of state.items) {
        for (const r of it.values) Renderer.unmount(r);
        clearBetween(it.start, it.end);
        it.start.remove();
        it.end.remove();
      }
      state.items = [];
    }
  }

  #renderDynamic(value, start, end, state) {
    if (isObservableArray(value)) {
      if (state.kind === 'list' && state.source === value) return;
      this.#cleanupDynamic(state, start, end);
      state.kind = 'list';
      state.source = value;
      const parent = end.parentNode;
      const items = [];
      const makeItemMount = (idx, rawItem) => {
        const refNode = idx < items.length ? items[idx].start : end;
        const itemStart = createComment('zb:item:start', 'item');
        const itemEnd = createComment('zb:item:end', 'item');
        parent.insertBefore(itemStart, refNode);
        parent.insertBefore(itemEnd, refNode);
        const values = Renderer.normalize(rawItem);
        for (const r of values) this.#mountRenderable(parent, r, itemEnd);
        items.splice(idx, 0, { start: itemStart, end: itemEnd, values });
      };
      const removeItemMount = (idx, count) => {
        const removed = items.splice(idx, count);
        for (const it of removed) {
          for (const r of it.values) Renderer.unmount(r);
          clearBetween(it.start, it.end);
          it.start.remove();
          it.end.remove();
        }
      };
      const setItemMount = (idx, rawItem) => {
        removeItemMount(idx, 1);
        makeItemMount(idx, rawItem);
      };
      for (let i = 0; i < value.length; i++) makeItemMount(i, value[i]);
      const unsub = value.subscribe((patch) => {
        if (!this.#mounted) return;
        if (patch.type === 'reset') {
          removeItemMount(0, items.length);
          for (let i = 0; i < patch.items.length; i++) makeItemMount(i, patch.items[i]);
          return;
        }
        if (patch.type === 'insert') {
          for (let i = 0; i < patch.items.length; i++) makeItemMount(patch.index + i, patch.items[i]);
          return;
        }
        if (patch.type === 'remove') {
          removeItemMount(patch.index, patch.count);
          return;
        }
        if (patch.type === 'set') setItemMount(patch.index, patch.value);
      });
      state.items = items;
      state.unsub = unsub;
      return;
    }

    if (Array.isArray(value)) {
      this.#cleanupDynamic(state, start, end);
      state.kind = 'static';
      const next = Renderer.normalize(value);
      state.values = next;
      for (const r of next) this.#mountRenderable(end.parentNode, r, end);
      return;
    }

    this.#cleanupDynamic(state, start, end);
    state.kind = 'static';
    const next = Renderer.normalize(value);
    state.values = next;
    for (const r of next) this.#mountRenderable(end.parentNode, r, end);
  }

  #mountRenderable(parent, renderable, beforeNode) {
    if (Renderer.isRenderable(renderable)) {
      renderable.mountInto(parent, beforeNode);
      return;
    }
    if (Renderer.isDomNode(renderable)) {
      parent.insertBefore(renderable, beforeNode);
    }
  }
}
