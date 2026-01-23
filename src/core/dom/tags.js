import { ElementNode } from './element.js';
import { Renderer } from '../renderable/renderer.js';
import { isObservableArray } from '../collections/observable-array.js';
import { isSignal } from '../reactivity/signal.js';
import { isComputed, isState, isStatePath } from '../reactivity/state.js';

const tags = [
  'html', 'head', 'title', 'base', 'link', 'meta', 'style',
  'body', 'article', 'section', 'nav', 'aside', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'hgroup', 'header', 'footer', 'address', 'main', 'search',
  'p', 'hr', 'pre', 'blockquote', 'ol', 'ul', 'li', 'dl', 'dt', 'dd',
  'figure', 'figcaption', 'div', 'menu',
  'a', 'em', 'strong', 'small', 's', 'cite', 'q', 'dfn', 'abbr', 'ruby', 'rt', 'rp',
  'data', 'time', 'code', 'var', 'samp', 'kbd', 'sub', 'sup', 'i', 'b', 'u',
  'mark', 'bdi', 'bdo', 'span', 'br', 'wbr',
  'ins', 'del',
  'picture', 'source', 'img', 'iframe', 'embed', 'object', 'param', 'video', 'audio',
  'track', 'map', 'area',
  'table', 'caption', 'colgroup', 'col', 'tbody', 'thead', 'tfoot', 'tr', 'td', 'th',
  'form', 'label', 'input', 'button', 'select', 'datalist', 'optgroup', 'option',
  'textarea', 'output', 'progress', 'meter', 'fieldset', 'legend',
  'details', 'summary', 'dialog',
  'script', 'noscript', 'template', 'slot', 'canvas',
];

function toFactoryName(tag) {
  let name = tag.charAt(0).toUpperCase() + tag.slice(1);
  if (name in globalThis) name = `Html${name}`;
  return name;
}

function createTag(tagName) {
  return (props, ...children) => {
    const args = [props, ...children];
    const nextProps = {};
    const nextChildren = [];

    const isPropsObject = (value) =>
      !!value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      !Renderer.isRenderable(value) &&
      !Renderer.isDomNode(value) &&
      !isObservableArray(value) &&
      !isSignal(value) &&
      !isState(value) &&
      !isStatePath(value) &&
      !isComputed(value);

    for (const arg of args) {
      if (isPropsObject(arg)) {
        Object.assign(nextProps, arg);
      } else {
        nextChildren.push(arg);
      }
    }

    return new ElementNode(tagName, nextProps, nextChildren);
  };
}

const exported = {};
for (const tag of tags) {
  const name = toFactoryName(tag);
  exported[name] = createTag(tag);
}

export const Elements = Object.freeze(exported);
export const {
  Html,
  Head,
  Title,
  Base,
  Link,
  Meta,
  Style,
  Body,
  Article,
  Section,
  Nav,
  Aside,
  H1,
  H2,
  H3,
  H4,
  H5,
  H6,
  Hgroup,
  Header,
  Footer,
  Address,
  Main,
  Search,
  P,
  Hr,
  Pre,
  Blockquote,
  Ol,
  Ul,
  Li,
  Dl,
  Dt,
  Dd,
  Figure,
  Figcaption,
  Div,
  Menu,
  A,
  Em,
  Strong,
  Small,
  S,
  Cite,
  Q,
  Dfn,
  Abbr,
  Ruby,
  Rt,
  Rp,
  Data,
  Time,
  Code,
  Var,
  Samp,
  Kbd,
  Sub,
  Sup,
  I,
  B,
  U,
  Mark,
  Bdi,
  Bdo,
  Span,
  Br,
  Wbr,
  Ins,
  Del,
  Picture,
  Source,
  Img,
  Iframe,
  Embed,
  HtmlObject,
  Param,
  Video,
  Audio,
  Track,
  Map,
  Area,
  Table,
  Caption,
  Colgroup,
  Col,
  Tbody,
  Thead,
  Tfoot,
  Tr,
  Td,
  Th,
  Form,
  Label,
  Input,
  Button,
  Select,
  Datalist,
  Optgroup,
  Option,
  Textarea,
  Output,
  Progress,
  Meter,
  Fieldset,
  Legend,
  Details,
  Summary,
  Dialog,
  Script,
  Noscript,
  Template,
  Slot,
  Canvas,
} = exported;
