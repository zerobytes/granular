import { JSDOM } from 'jsdom';

export function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/',
  });

  const previous = new Map();
  const assign = (key, value) => {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  };

  assign('window', dom.window);
  assign('document', dom.window.document);
  assign('Node', dom.window.Node);
  assign('Element', dom.window.Element);
  assign('HTMLElement', dom.window.HTMLElement);
  assign('Text', dom.window.Text);
  assign('Comment', dom.window.Comment);
  assign('DocumentFragment', dom.window.DocumentFragment);
  assign('navigator', dom.window.navigator);
  assign('Event', dom.window.Event);
  assign('CustomEvent', dom.window.CustomEvent);
  assign('EventTarget', dom.window.EventTarget);
  assign('requestAnimationFrame', (cb) => setTimeout(() => cb(Date.now()), 0));
  assign('cancelAnimationFrame', (id) => clearTimeout(id));

  return () => {
    dom.window.close();
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete globalThis[key];
      } else {
        Object.defineProperty(globalThis, key, value);
      }
    }
  };
}
