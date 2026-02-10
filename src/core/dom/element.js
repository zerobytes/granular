import { Renderable } from '../renderable/renderable.js';
import { Renderer } from '../renderable/renderer.js';
import { isObservableArray } from '../collections/observable-array.js';
import { createAnchor } from './dom.js';
import { normalizeInputFormat, applyInputFormat } from './input-format.js';
import { isWhen, readWhenValue, subscribeWhenValue } from './when.js';
import { isSignal, readSignal, subscribeSignal, getMappedArrayMeta } from '../reactivity/signal.js';
import { isState, isStatePath, isComputed, readState, subscribeState, getMappedMeta, readStateMeta, subscribeStateMeta } from '../reactivity/state.js';
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

const _tplCache = new Map();

function escapeHtml(str) {
  if (str.indexOf('&') < 0 && str.indexOf('<') < 0 && str.indexOf('>') < 0) return str;
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(str) {
  if (str.indexOf('&') < 0 && str.indexOf('"') < 0) return str;
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

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
    const html = this.#tryCompileTemplate();
    if (html !== null) {
      let tpl = _tplCache.get(html);
      if (!tpl) {
        tpl = document.createElement('template');
        tpl.innerHTML = html;
        _tplCache.set(html, tpl);
      }
      const el = tpl.content.firstChild.cloneNode(true);
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
    let attrStr = '';
    if (props) {
      let first = true;
      for (const key in props) {
        const value = props[key];
        if (key === 'node' || key === 'children' || key === 'content' || key === 'format') continue;
        if (key === 'style' || key === 'textContent' || key === 'innerHTML') continue;
        if (key.startsWith('on') && typeof value === 'function') continue;
        if (isSignal(value) || isState(value) || isStatePath(value) || isWhen(value) || isComputed(value)) continue;
        if (key === 'className' || key === 'class') {
          if (value != null && value !== false) { attrStr += (first ? ' class="' : '" class="') + escapeAttr(String(value)); first = false; }
          continue;
        }
        if (key === 'htmlFor') {
          if (value != null && value !== false) { attrStr += (first ? ' for="' : '" for="') + escapeAttr(String(value)); first = false; }
          continue;
        }
        if (value === true) { attrStr += ' ' + key; continue; }
        if (value === false || value == null) continue;
        attrStr += (first ? ' ' : '" ') + key + '="' + escapeAttr(String(value));
        first = false;
      }
      if (!first) attrStr += '"';
    }
    if (voidElements.has(tag.toLowerCase())) return '<' + tag + attrStr + '>';
    let childHtml = '';
    let lastWasText = false;
    for (let i = 0, len = this.children.length; i < len; i++) {
      const child = this.children[i];
      if (child == null || child === false) continue;
      if (child instanceof ElementNode) {
        const r = child.#tryCompileTemplate();
        if (r === null) return null;
        childHtml += r;
        lastWasText = false;
      } else if (isSignal(child) || isState(child) || isStatePath(child)) {
        if (lastWasText) childHtml += '<!---->';
        childHtml += ' ';
        lastWasText = true;
      } else if (typeof child === 'string') {
        if (lastWasText) childHtml += '<!---->';
        childHtml += escapeHtml(child);
        lastWasText = true;
      } else if (typeof child === 'number') {
        if (lastWasText) childHtml += '<!---->';
        childHtml += String(child);
        lastWasText = true;
      } else {
        return null;
      }
    }
    return '<' + tag + attrStr + '>' + childHtml + '</' + tag + '>';
  }

  #applyDynamicProps(el) {
    const props = this.props;
    if (!props) return;
    for (const key in props) {
      const rawValue = props[key];
      if (key === 'style') {
        this.#applyStyle(el, rawValue);
        continue;
      }
      if (key.startsWith('on') && typeof rawValue === 'function') {
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
      const isEl = child instanceof ElementNode;
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
      } else if (typeof child === 'string' || typeof child === 'number') {
        domIdx++;
        lastWasText = true;
      }
    }
  }

  #bindReactiveChild(el, domIdx, child, read, subscribe) {
    const placeholder = el.childNodes[domIdx];
    const initial = read(child);
    const isComplex = (v) => v != null && typeof v === 'object';

    if (!isComplex(initial)) {
      let tn = placeholder;
      let anchor = null;
      let dynState = null;
      tn.nodeValue = Renderer.toText(initial);
      const unsub = subscribe(child, () => {
        const next = read(child);
        if (anchor) {
          this.#renderDynamic(next, anchor, dynState);
        } else if (isComplex(next)) {
          anchor = createAnchor('r');
          tn.parentNode.replaceChild(anchor, tn);
          tn = null;
          dynState = { kind: 'static', renderables: [], nodes: [] };
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
      const anchor = createAnchor('r');
      placeholder.parentNode.replaceChild(anchor, placeholder);
      const dynState = { kind: 'static', renderables: [], nodes: [] };
      this.#renderDynamic(initial, anchor, dynState);
      const unsub = subscribe(child, () => {
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
      if (key === 'node') continue;
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
    let valueBound = false;

    const { formatConfig } = this.#getFormatConfig();

    for (const [key, rawValue] of Object.entries(props)) {
      if (key === 'value') valueBound = true;

      if (key === 'node') continue;
      if (key === 'children' || key === 'content') continue;
      if (key === 'format') continue;
      if (key === 'style') {
        this.#applyStyle(el, rawValue);
        continue;
      }
      const props = { el, key, rawValue, formatConfig };
      if (isWhen(rawValue)) {
        this.#applyPropAsWhen(props);
        continue;
      }
      if (isSignal(rawValue)) {
        if (key === 'value' && formatConfig) formatBound = true;
        this.#applyPropAsSignal(props);
        continue;
      }
      if (isState(rawValue) || isStatePath(rawValue)) {
        if (key === 'value' && formatConfig) formatBound = true;
        this.#applyPropAsState(props)
        continue;
      }
      if (key === 'value' && formatConfig) {
        const { visualValue } = this.#formatValue(rawValue);
        this.#setProp(el, key, visualValue);
        formatBound = true;
        continue;
      }
      if ((key === 'onInput' || key === 'onChange') && typeof rawValue === 'function' && formatConfig) {
        const handler = (ev) => {
          rawValue?.(ev, ev?.target?.rawValue);
        };
        this.#setProp(el, key, handler);
        continue;
      }
      if (key === 'onInput' && !formatBound) {
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
        this.#setProp(el, 'value', visualValue);
      }
      onInput()
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
    const formatConfig = tagName === 'input' ? normalizeInputFormat(resolveFormat(props.format)) : null;
    const formatMode = formatConfig?.mode ?? 'both';
    return { formatConfig, formatMode };
  }
  #formatValue(next) {
    const { formatConfig, formatMode } = this.#getFormatConfig();
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

  #applyPropsBaseOnInputFormatted(ev) {
    const { formatted, visualValue, stateValue } = this.#formatValue(ev.target.value ?? '');
    const rawValue = formatted?.raw ?? stateValue;
    ev.target.value = visualValue;
    ev.target.rawValue = rawValue;
    return { visualValue, stateValue, rawValue };
  }
  #applyPropsAddInputEventListeners(el, onInput, capture) {
    el.addEventListener('input', onInput, capture);
    el.addEventListener('change', onInput, capture);
    this.#unsubs.push(() => {
      el.removeEventListener('input', onInput, capture);
      el.removeEventListener('change', onInput, capture);
    });
  }

  #applyPropsSubscribeUpdate({ key, el, rawValue, read, subscribe, formatConfig }) {
    const update = () => {
      const nextValue = read(rawValue);
      if (key === 'value' && formatConfig) {
        const { visualValue } = this.#formatValue(nextValue);
        this.#setProp(el, key, visualValue);
        return;
      }
      this.#setProp(el, key, nextValue);
    };
    update();
    const unsub = subscribe(rawValue, update);
    if (unsub) this.#unsubs.push(unsub);
    return update;
  }

  #applyPropAsWhen(props) {
    this.#applyPropsSubscribeUpdate({ ...props, read: readWhenValue, subscribe: subscribeWhenValue });
  }
  #applyPropAsSignal({ el, key, rawValue, formatConfig }) {
    const update = this.#applyPropsSubscribeUpdate({ key, el, rawValue, formatConfig, read: readSignal, subscribe: subscribeSignal });
    if (key === 'value') {
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
          const ok = rawValue.set?.(ev.target?.value ?? '');
          if (ok === false) update();
        };
        this.#applyPropsAddInputEventListeners(el, onInput);
      }
    }
    if (key === 'checked') {
      const onChange = (ev) => {
        if (isComputed(rawValue)) return;
        const ok = rawValue.set?.(!!ev.target?.checked);
        if (ok === false) update();
      };
      el.addEventListener('change', onChange);
      this.#unsubs.push(() => el.removeEventListener('change', onChange));
    }
  }
  #applyPropAsState({ el, key, rawValue, formatConfig }) {
    const update = this.#applyPropsSubscribeUpdate({ key, el, rawValue, formatConfig, read: readState, subscribe: subscribeState });
    if (key === 'value') {
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
          const ok = rawValue.set?.(ev.target?.value ?? '');
          if (ok === false) update();
        };
        this.#applyPropsAddInputEventListeners(el, onInput);
      }
    }
    if (key === 'checked') {
      const onChange = (ev) => {
        if (isComputed(rawValue)) return;
        const ok = rawValue.set?.(!!ev.target?.checked);
        if (ok === false) update();
      };
      el.addEventListener('change', onChange);
      this.#unsubs.push(() => el.removeEventListener('change', onChange));
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
      } catch { }
      return;
    }
    if (key === 'checked') {
      try {
        el.checked = !!value;
      } catch { }
      return;
    }
    if (key === 'contentEditable') {
      try {
        el.contentEditable = value ? 'true' : 'false';
      } catch { }
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
        } catch { }
      }
      return;
    }
    if (value === true) {
      el.setAttribute(key, '');
      if (key in el) {
        try {
          el[key] = true;
        } catch { }
      }
      return;
    }
    el.setAttribute(key, value);
    if (key in el) {
      try {
        el[key] = value;
      } catch { }
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
      const anchor = createAnchor('map');
      parent.insertBefore(anchor, beforeNode);
      const dynState = { kind: 'static', renderables: [], nodes: [] };
      const update = () => {
        const src = mapped.path ? readStateMeta(mapped) : readSignal(mapped.signal);
        const list = Array.isArray(src) ? src.map(mapped.mapFn) : [];
        this.#renderDynamic(list, anchor, dynState);
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
      const anchor = createAnchor('sig');
      parent.insertBefore(anchor, beforeNode);
      const dynState = { kind: 'static', renderables: [], nodes: [] };
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
      const anchor = createAnchor('st');
      parent.insertBefore(anchor, beforeNode);
      const dynState = { kind: 'static', renderables: [], nodes: [] };
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
      const anchor = createAnchor('ol');
      parent.insertBefore(anchor, beforeNode);
      const dynState = { kind: 'list', items: [], unsub: null, source: child };
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
    if (dynState.kind === 'static') {
      for (const r of dynState.renderables) Renderer.unmount(r);
      dynState.renderables = [];
      for (const n of dynState.nodes) if (n.parentNode) n.remove();
      dynState.nodes = [];
      return;
    }
    if (dynState.kind === 'list') {
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
    const marker = document.createTextNode('');
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
      if (dynState.kind === 'list' && dynState.source === value) return;
      this.#cleanupDynamic(dynState);
      dynState.kind = 'list';
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
        const renderables = Renderer.normalize(rawItem);
        const nodes = this.#mountAndCollect(renderables, parent, refNode);
        items.splice(idx, 0, { renderables, nodes });
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
      dynState.items = items;
      dynState.unsub = unsub;
      return;
    }

    if (Array.isArray(value)) {
      this.#cleanupDynamic(dynState);
      dynState.kind = 'static';
      const renderables = Renderer.normalize(value);
      dynState.renderables = renderables;
      dynState.nodes = this.#mountAndCollect(renderables, anchor.parentNode, anchor);
      return;
    }

    this.#cleanupDynamic(dynState);
    dynState.kind = 'static';
    const renderables = Renderer.normalize(value);
    dynState.renderables = renderables;
    dynState.nodes = this.#mountAndCollect(renderables, anchor.parentNode, anchor);
  }
}
