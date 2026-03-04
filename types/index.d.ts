// ─────────────────────────────────────────────────────────────────────────────
// @granularjs/core — Hand-crafted Type Declarations
// ─────────────────────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════════
//  UTILITY TYPES
// ═══════════════════════════════════════════════════════════════════════════

type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

type GranularChild =
  | string
  | number
  | boolean
  | null
  | undefined
  | Node
  | Renderable
  | Signal<any>
  | State<any>
  | Computed<any>
  | WhenNode
  | GranularChild[];

type ReactiveSource<T = any> = Signal<T> | State<T> | Computed<T>;
type ReactiveTarget = Signal<any> | State<any> | ObservableArray<any>;

type InferReactiveValue<T> =
  T extends Signal<infer V> ? V :
  T extends State<infer V> ? V :
  T extends Computed<infer V> ? V :
  T extends ObservableArray<infer V> ? V[] :
  T;

// ═══════════════════════════════════════════════════════════════════════════
//  RENDERABLE
// ═══════════════════════════════════════════════════════════════════════════

export class Renderable {
  mountInto(parent: Node, beforeNode: Node | null): void;
  unmount(): void;
}

export class Renderer {
  static isDomNode(value: unknown): value is Node;
  static isRenderable(value: unknown): value is Renderable;
  static toText(value: unknown): string;
  static normalize(value: unknown): (Renderable | Node)[];
  static unmount(value: unknown): void;
}

export function renderToString(value: Renderable | Node | GranularChild): string;
export function hydrate(target: string | Element, value: Renderable | Node | GranularChild): void;

// ═══════════════════════════════════════════════════════════════════════════
//  SIGNAL
// ═══════════════════════════════════════════════════════════════════════════

export interface Signal<T> {
  get(): T;
  set(next: T, force?: boolean): boolean;
  patch(next: DeepPartial<T>): boolean;
  subscribe(fn: (next: T, prev: T) => void): () => void;
  before(fn: (prev: T, next: T) => boolean | void): () => void;
  map<U>(fn: (item: T extends readonly (infer I)[] ? I : T, index: number) => U): U[];
}

export function signal<T>(initial: T): Signal<T>;
export function isSignal(value: unknown): value is Signal<unknown>;
export function readSignal<T>(sig: Signal<T>): T;
export function setSignal<T>(sig: Signal<T>, next: T, force?: boolean): boolean;

// ═══════════════════════════════════════════════════════════════════════════
//  STATE — Deep Reactive Proxy
// ═══════════════════════════════════════════════════════════════════════════

interface MutateOptions {
  clone?: (value: unknown) => unknown;
  rollback?: (error: unknown, prev: unknown) => void;
  onSuccess?: (result: unknown) => void;
  onError?: (error: unknown) => void;
}

interface StateCore<T> {
  /** Returns the current value at this path. */
  get(): T;
  /** Returns the value at a sub-path (dot-delimited string or key array). */
  get(path: string): unknown;
  get(path: string[]): unknown;

  /** Replaces the value at this path. */
  set(value: T): void;
  /** Returns a setter proxy for chained property assignment. */
  set(): SetterProxy<T>;
  /** Sets a value at a sub-path relative to this path. */
  set(path: string, value: unknown): void;

  /** Shallow-merges a partial object into this state (objects only). */
  patch(partial: DeepPartial<T>): void;

  /** Subscribes to changes at this path. Returns unsubscribe. */
  subscribe(fn: (next: T, prev: T) => void): () => void;

  /** Registers a before-change guard. Return `false` to cancel the update. */
  before(fn: (prev: T, next: T) => boolean | void): () => void;

  /** Optimistic update with automatic rollback on failure. */
  mutate(
    optimistic: (() => void) | Partial<T>,
    mutation: () => Promise<unknown>,
    options?: MutateOptions,
  ): Promise<unknown>;
}

/**
 * Recursive setter proxy returned by `state.set()`.
 * Property assignment triggers the reactive update at the target path.
 */
export type SetterProxy<T> =
  T extends readonly (infer U)[]
    ? U[] & {
        [index: number]: U extends Record<string, any> ? SetterProxy<U> : U;
        push(...items: U[]): number;
        pop(): U | undefined;
        shift(): U | undefined;
        unshift(...items: U[]): number;
        splice(start: number, deleteCount?: number, ...items: U[]): U[];
      }
    : T extends Record<string, any>
      ? { -readonly [K in keyof T]: T[K] extends Record<string, any> ? SetterProxy<T[K]> : T[K] }
      : T;

/**
 * Deep reactive state proxy.
 * Every property access returns a nested `State<PropertyType>`.
 * `.get()` and `.set()` are path-relative — they resolve from the path where they are called.
 */
export type State<T> = StateCore<T> &
  (T extends readonly (infer U)[]
    ? {
        readonly [index: number]: State<U>;
        map<R>(fn: (item: U, index: number) => R): R[];
      }
    : T extends Record<string, any>
      ? { readonly [K in keyof T]-?: State<T[K]> }
      : {});

export function state<T>(initial: T): State<T>;
export function isState(value: unknown): value is State<unknown>;
export function isStatePath(value: unknown): boolean;
export function isComputed(value: unknown): boolean;

// ═══════════════════════════════════════════════════════════════════════════
//  COMPUTED — Read-only derived state
// ═══════════════════════════════════════════════════════════════════════════

interface ComputedCore<T> {
  get(): T;
  get(path: string): unknown;
  subscribe(fn: (next: T, prev: T) => void): () => void;
  dispose(): void;
}

/**
 * Read-only reactive value derived from `after().compute()` or `before().compute()`.
 * Supports deep path access for object values (e.g. `computed.name` → `Computed<string>`).
 * Auto-disposes when no subscribers remain (unless `keepAlive: true`).
 */
export type Computed<T> = ComputedCore<T> &
  (T extends readonly (infer U)[]
    ? { readonly [index: number]: Computed<U> }
    : T extends Record<string, any>
      ? { readonly [K in keyof T]-?: Computed<T[K]> }
      : {});

// ═══════════════════════════════════════════════════════════════════════════
//  OBSERVABLE ARRAY
// ═══════════════════════════════════════════════════════════════════════════

export interface InsertPatch<T> { type: 'insert'; index: number; items: T[]; }
export interface RemovePatch<T> { type: 'remove'; index: number; count: number; items: T[]; }
export interface SetPatch<T>    { type: 'set';    index: number; value: T; prev: T; }
export interface ResetPatch<T>  { type: 'reset';  items: T[]; prevItems: T[]; }
export type ObservableArrayPatch<T> = InsertPatch<T> | RemovePatch<T> | SetPatch<T> | ResetPatch<T>;

export interface ObservableArrayContext<T> {
  array: ObservableArray<T>;
  prevLength: number;
  nextLength: number;
  op: string;
  args: unknown[];
}

interface ObservableArrayPhase<T> {
  insert(fn: (patch: InsertPatch<T>, ctx: ObservableArrayContext<T>) => boolean | void): () => void;
  remove(fn: (patch: RemovePatch<T>, ctx: ObservableArrayContext<T>) => boolean | void): () => void;
  set(fn: (patch: SetPatch<T>, ctx: ObservableArrayContext<T>) => boolean | void): () => void;
  reset(fn: (patch: ResetPatch<T>, ctx: ObservableArrayContext<T>) => boolean | void): () => void;
  any(fn: (patch: ObservableArrayPatch<T>, ctx: ObservableArrayContext<T>) => boolean | void): () => void;
  on(type: string, fn: (patch: ObservableArrayPatch<T>, ctx: ObservableArrayContext<T>) => boolean | void): () => void;
}

export interface ObservableArray<T> {
  readonly length: number;
  [index: number]: T;

  push(...items: T[]): number;
  pop(): T | undefined;
  shift(): T | undefined;
  unshift(...items: T[]): number;
  splice(start: number, deleteCount?: number, ...items: T[]): T[];
  sort(compareFn?: (a: T, b: T) => number): T[];
  reverse(): T[];
  fill(value: T, start?: number, end?: number): T[];
  copyWithin(target: number, start: number, end?: number): T[];

  indexOf(item: T, fromIndex?: number): number;
  includes(item: T, fromIndex?: number): boolean;
  find(predicate: (value: T, index: number) => boolean): T | undefined;
  findIndex(predicate: (value: T, index: number) => boolean): number;
  filter(predicate: (value: T, index: number) => boolean): T[];
  map<U>(fn: (value: T, index: number) => U): U[];
  forEach(fn: (value: T, index: number) => void): void;
  reduce<U>(fn: (acc: U, value: T, index: number) => U, initial: U): U;
  some(predicate: (value: T, index: number) => boolean): boolean;
  every(predicate: (value: T, index: number) => boolean): boolean;
  slice(start?: number, end?: number): T[];
  flat<D extends number = 1>(depth?: D): T[];
  flatMap<U>(fn: (value: T, index: number) => U | U[]): U[];

  subscribe(fn: (patch: ObservableArrayPatch<T>, ctx: ObservableArrayContext<T>) => void): () => void;
  reset(items: T[]): void;
  after(): ObservableArrayPhase<T>;
  before(): ObservableArrayPhase<T>;

}

export function observableArray<T>(initial?: T[]): ObservableArray<T>;

// ═══════════════════════════════════════════════════════════════════════════
//  AFTER / BEFORE — Reactive Observers
// ═══════════════════════════════════════════════════════════════════════════

interface ComputeOptions<R = unknown> {
  keepAlive?: boolean;
  equals?: (prev: R, next: R) => boolean;
  hash?: (...args: unknown[]) => unknown;
  debounce?: number;
  onError?: (err: unknown) => void;
}

interface SingleCapture<T> {
  /** Reacts after / before the target changes. Returns unsubscribe. */
  change(fn: (next: T, prev: T, ctx?: unknown) => void): () => void;
  /** Derives a read-only computed value from the target. */
  compute<R>(fn: (next: T, prev: T, ctx?: unknown) => R | Promise<R>, options?: ComputeOptions<R>): Computed<R>;
}

interface MultiCapture<T extends unknown[]> {
  change(fn: (next: T, prev: T, ctx?: unknown[]) => void): () => void;
  compute<R>(fn: (next: T, prev: T, ctx?: unknown[]) => R | Promise<R>, options?: ComputeOptions<R>): Computed<R>;
}

// Single-target overloads
export function after<A>(t: ReactiveSource<A> | ObservableArray<A>): SingleCapture<A>;
export function after<A, B>(
  t1: ReactiveSource<A> | ObservableArray<A>,
  t2: ReactiveSource<B> | ObservableArray<B>,
): MultiCapture<[A, B]>;
export function after<A, B, C>(
  t1: ReactiveSource<A> | ObservableArray<A>,
  t2: ReactiveSource<B> | ObservableArray<B>,
  t3: ReactiveSource<C> | ObservableArray<C>,
): MultiCapture<[A, B, C]>;
export function after<A, B, C, D>(
  t1: ReactiveSource<A> | ObservableArray<A>,
  t2: ReactiveSource<B> | ObservableArray<B>,
  t3: ReactiveSource<C> | ObservableArray<C>,
  t4: ReactiveSource<D> | ObservableArray<D>,
): MultiCapture<[A, B, C, D]>;
export function after(...targets: ReactiveTarget[]): SingleCapture<unknown> | MultiCapture<unknown[]>;

export function before<A>(t: ReactiveSource<A> | ObservableArray<A>): SingleCapture<A>;
export function before<A, B>(
  t1: ReactiveSource<A> | ObservableArray<A>,
  t2: ReactiveSource<B> | ObservableArray<B>,
): MultiCapture<[A, B]>;
export function before<A, B, C>(
  t1: ReactiveSource<A> | ObservableArray<A>,
  t2: ReactiveSource<B> | ObservableArray<B>,
  t3: ReactiveSource<C> | ObservableArray<C>,
): MultiCapture<[A, B, C]>;
export function before<A, B, C, D>(
  t1: ReactiveSource<A> | ObservableArray<A>,
  t2: ReactiveSource<B> | ObservableArray<B>,
  t3: ReactiveSource<C> | ObservableArray<C>,
  t4: ReactiveSource<D> | ObservableArray<D>,
): MultiCapture<[A, B, C, D]>;
export function before(...targets: ReactiveTarget[]): SingleCapture<unknown> | MultiCapture<unknown[]>;

/** Sets a reactive target to a value. */
export function set<T>(target: State<T> | Signal<T>, value: T): void;
export function set<T>(target: ObservableArray<T>, value: T[]): void;

// ═══════════════════════════════════════════════════════════════════════════
//  SUBSCRIBE — Selector-based subscription
// ═══════════════════════════════════════════════════════════════════════════

/** Without listener: returns a computed derived from selector. */
export function subscribe<T, R>(
  target: ReactiveSource<T> | ObservableArray<T>,
  selector: (value: T) => R,
): Computed<R>;

/** With listener: calls listener when selected value changes. Returns unsubscribe. */
export function subscribe<T, R>(
  target: ReactiveSource<T> | ObservableArray<T>,
  selector: (value: T) => R,
  listener: (next: R, prev: R) => void,
  equalityFn?: (a: R, b: R) => boolean,
): () => void;

// ═══════════════════════════════════════════════════════════════════════════
//  RESOLVE / COMPUTED / CONCAT
// ═══════════════════════════════════════════════════════════════════════════

/** Unwraps a reactive value (signal, state, computed, state path) to its raw value. */
export function resolve<T>(value: Signal<T> | State<T> | Computed<T>): T;
export function resolve<T>(value: T): T;

/**
 * Transforms a props object into a proxy where each property becomes a read-only computed.
 * Single reactive input returns a read-only computed mirror.
 */
export function computed<T>(input: Signal<T> | State<T>): Computed<T>;
export function computed<T extends Record<string, any>>(input: T): {
  [K in keyof T]: T[K] extends ReactiveSource<infer V> ? Computed<V>
    : T[K] extends (...args: any[]) => any ? T[K]
    : Computed<T[K]>;
};

type ConcatPart =
  | string
  | number
  | boolean
  | null
  | undefined
  | ReactiveSource<any>
  | [ReactiveSource<any>, string | ((value: any) => any)];

interface ConcatOptions {
  separator?: string;
  filterFalsy?: boolean;
}

/** Joins primitives and reactive values into a single reactive string. */
export function concat(...parts: (ConcatPart | ConcatOptions)[]): string | Computed<string>;

// ═══════════════════════════════════════════════════════════════════════════
//  PERSIST
// ═══════════════════════════════════════════════════════════════════════════

interface PersistOptions {
  /** Storage key (required). */
  key: string;
  /** Storage backend. Defaults to `localStorage`. */
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  /** Dot-paths to persist a subset. */
  paths?: string[];
  /** Custom serializer. Default: `JSON.stringify`. */
  serialize?: (value: unknown) => string;
  /** Custom deserializer. Default: `JSON.parse`. */
  deserialize?: (text: string) => unknown;
  /** Schema version stored alongside data. Default: `1`. */
  version?: number;
  /** Migration function when stored version differs from current. */
  migrate?: (data: unknown, fromVersion: number) => unknown;
  /** Post-load/post-migrate transform (e.g. restore non-serializable fields). */
  reconcile?: (data: unknown) => unknown;
  /** Write throttle in ms. Default: `0`. */
  throttle?: number;
}

/**
 * Persists a reactive target to storage. Returns the same target (for chaining).
 * Adds `.persistDispose()` to stop persisting.
 */
export function persist<T extends State<any> | ObservableArray<any>>(
  target: T,
  options: PersistOptions,
): T & { persistDispose(): void };

// ═══════════════════════════════════════════════════════════════════════════
//  FORM
// ═══════════════════════════════════════════════════════════════════════════

type ValidatorResult = true | false | string | Record<string, unknown> | Promise<true | false | string | Record<string, unknown>>;

interface FormReturn<T extends Record<string, unknown>> {
  values: State<T>;
  meta: State<Record<string, unknown>>;
  errors: State<Record<string, unknown>>;
  touched: State<Record<string, boolean>>;
  dirty: State<boolean>;
  validators: { add(fn: (values: T) => ValidatorResult): void; delete(fn: (values: T) => ValidatorResult): boolean; clear(): void };
  reset(): void;
}

export function form<T extends Record<string, unknown>>(initial: T): FormReturn<T>;

// ═══════════════════════════════════════════════════════════════════════════
//  CONTEXT
// ═══════════════════════════════════════════════════════════════════════════

type ContextScope<T> = State<T> & {
  serve(renderable: Renderable | Node | GranularChild): Renderable;
};

interface Context<T> {
  /** Creates a new provider level. Wraps children with `.serve(renderable)`. */
  scope(value?: T): ContextScope<T>;
  /** Returns a reactive state bound to the nearest ancestor provider. */
  state(): State<T>;
}

export function context<T>(defaultValue: T): Context<T>;

// ═══════════════════════════════════════════════════════════════════════════
//  DOM — Tags
// ═══════════════════════════════════════════════════════════════════════════

interface FormatResult { value: string; visual: string; raw: string; }
interface FormatConfig {
  pattern?: string | RegExp;
  mode?: 'both' | 'value-only' | 'visual-only';
}

type ReactiveValue<T> = T | State<T> | Signal<T> | Computed<T>;

type StyleObject = {
  [K in keyof CSSStyleDeclaration]?: ReactiveValue<string | number | null | undefined>;
} & Record<string, ReactiveValue<string | number | null | undefined>>;

interface ElementProps {
  id?: ReactiveValue<string>;
  className?: ReactiveValue<string>;
  class?: ReactiveValue<string>;
  style?: ReactiveValue<string> | StyleObject;
  innerHTML?: ReactiveValue<string>;
  textContent?: ReactiveValue<string>;
  value?: ReactiveValue<string | number>;
  checked?: ReactiveValue<boolean>;
  disabled?: ReactiveValue<boolean>;
  hidden?: ReactiveValue<boolean>;
  tabIndex?: ReactiveValue<number>;
  title?: ReactiveValue<string>;
  placeholder?: ReactiveValue<string>;
  type?: ReactiveValue<string>;
  name?: ReactiveValue<string>;
  href?: ReactiveValue<string>;
  src?: ReactiveValue<string>;
  alt?: ReactiveValue<string>;
  target?: ReactiveValue<string>;
  role?: ReactiveValue<string>;
  for?: ReactiveValue<string>;
  htmlFor?: ReactiveValue<string>;
  width?: ReactiveValue<string | number>;
  height?: ReactiveValue<string | number>;
  action?: ReactiveValue<string>;
  method?: ReactiveValue<string>;
  colspan?: ReactiveValue<number>;
  rowspan?: ReactiveValue<number>;
  selected?: ReactiveValue<boolean>;
  multiple?: ReactiveValue<boolean>;
  required?: ReactiveValue<boolean>;
  readOnly?: ReactiveValue<boolean>;
  autoFocus?: ReactiveValue<boolean>;
  autoComplete?: ReactiveValue<string>;
  min?: ReactiveValue<string | number>;
  max?: ReactiveValue<string | number>;
  step?: ReactiveValue<string | number>;
  pattern?: ReactiveValue<string>;
  maxLength?: ReactiveValue<number>;
  minLength?: ReactiveValue<number>;
  rows?: ReactiveValue<number>;
  cols?: ReactiveValue<number>;
  wrap?: ReactiveValue<string>;

  /** Captures the underlying DOM element into a reactive target when mounted. */
  node?: State<HTMLElement | null> | Signal<HTMLElement | null>;

  /** Input formatting: pattern string, regex, function, or config object. */
  format?: string | RegExp | ((value: string) => FormatResult) | FormatConfig;

  /** Explicit children (optional — children can also be passed as positional args). */
  children?: GranularChild | GranularChild[];

  // Event handlers
  onClick?: (e: MouseEvent) => void;
  onDblClick?: (e: MouseEvent) => void;
  onMouseDown?: (e: MouseEvent) => void;
  onMouseUp?: (e: MouseEvent) => void;
  onMouseEnter?: (e: MouseEvent) => void;
  onMouseLeave?: (e: MouseEvent) => void;
  onMouseMove?: (e: MouseEvent) => void;
  onMouseOver?: (e: MouseEvent) => void;
  onMouseOut?: (e: MouseEvent) => void;
  onContextMenu?: (e: MouseEvent) => void;
  onKeyDown?: (e: KeyboardEvent) => void;
  onKeyUp?: (e: KeyboardEvent) => void;
  onKeyPress?: (e: KeyboardEvent) => void;
  onFocus?: (e: FocusEvent) => void;
  onBlur?: (e: FocusEvent) => void;
  onInput?: (e: Event) => void;
  onChange?: (e: Event) => void;
  onSubmit?: (e: Event) => void;
  onReset?: (e: Event) => void;
  onScroll?: (e: Event) => void;
  onWheel?: (e: WheelEvent) => void;
  onDrag?: (e: DragEvent) => void;
  onDragStart?: (e: DragEvent) => void;
  onDragEnd?: (e: DragEvent) => void;
  onDragEnter?: (e: DragEvent) => void;
  onDragLeave?: (e: DragEvent) => void;
  onDragOver?: (e: DragEvent) => void;
  onDrop?: (e: DragEvent) => void;
  onTouchStart?: (e: TouchEvent) => void;
  onTouchEnd?: (e: TouchEvent) => void;
  onTouchMove?: (e: TouchEvent) => void;
  onTouchCancel?: (e: TouchEvent) => void;
  onPointerDown?: (e: PointerEvent) => void;
  onPointerUp?: (e: PointerEvent) => void;
  onPointerMove?: (e: PointerEvent) => void;
  onPointerEnter?: (e: PointerEvent) => void;
  onPointerLeave?: (e: PointerEvent) => void;
  onAnimationStart?: (e: AnimationEvent) => void;
  onAnimationEnd?: (e: AnimationEvent) => void;
  onAnimationIteration?: (e: AnimationEvent) => void;
  onTransitionEnd?: (e: TransitionEvent) => void;
  onLoad?: (e: Event) => void;
  onError?: (e: Event) => void;
  onResize?: (e: Event) => void;
  onSelect?: (e: Event) => void;
  onCopy?: (e: ClipboardEvent) => void;
  onCut?: (e: ClipboardEvent) => void;
  onPaste?: (e: ClipboardEvent) => void;
  onCompositionStart?: (e: CompositionEvent) => void;
  onCompositionUpdate?: (e: CompositionEvent) => void;
  onCompositionEnd?: (e: CompositionEvent) => void;
  onPlay?: (e: Event) => void;
  onPause?: (e: Event) => void;
  onEnded?: (e: Event) => void;

  /** Accept any additional attribute (data-*, aria-*, custom). */
  [key: string]: unknown;
}

type TagArg = ElementProps | GranularChild;
type TagFunction = (...args: TagArg[]) => ElementNode;

declare class ElementNode extends Renderable {
  mountInto(parent: Node, beforeNode: Node | null): void;
  unmount(): void;
  renderToString(render: (value: unknown) => string): string;
}

export function setTemplateCacheSize(max: number): void;

// All HTML tag functions
export const Html: TagFunction;
export const Head: TagFunction;
export const Title: TagFunction;
export const Base: TagFunction;
export const Link: TagFunction;
export const Meta: TagFunction;
export const Style: TagFunction;
export const Body: TagFunction;
export const Article: TagFunction;
export const Section: TagFunction;
export const Nav: TagFunction;
export const Aside: TagFunction;
export const H1: TagFunction;
export const H2: TagFunction;
export const H3: TagFunction;
export const H4: TagFunction;
export const H5: TagFunction;
export const H6: TagFunction;
export const Hgroup: TagFunction;
export const Header: TagFunction;
export const Footer: TagFunction;
export const Address: TagFunction;
export const Main: TagFunction;
export const Search: TagFunction;
export const P: TagFunction;
export const Hr: TagFunction;
export const Pre: TagFunction;
export const Blockquote: TagFunction;
export const Ol: TagFunction;
export const Ul: TagFunction;
export const Li: TagFunction;
export const Dl: TagFunction;
export const Dt: TagFunction;
export const Dd: TagFunction;
export const Figure: TagFunction;
export const Figcaption: TagFunction;
export const Div: TagFunction;
export const Menu: TagFunction;
export const A: TagFunction;
export const Em: TagFunction;
export const Strong: TagFunction;
export const Small: TagFunction;
export const S: TagFunction;
export const Cite: TagFunction;
export const Q: TagFunction;
export const Dfn: TagFunction;
export const Abbr: TagFunction;
export const Ruby: TagFunction;
export const Rt: TagFunction;
export const Rp: TagFunction;
export const Data: TagFunction;
export const Time: TagFunction;
export const Code: TagFunction;
export const Var: TagFunction;
export const Samp: TagFunction;
export const Kbd: TagFunction;
export const Sub: TagFunction;
export const Sup: TagFunction;
export const I: TagFunction;
export const B: TagFunction;
export const U: TagFunction;
export const Mark: TagFunction;
export const Bdi: TagFunction;
export const Bdo: TagFunction;
export const Span: TagFunction;
export const Br: TagFunction;
export const Wbr: TagFunction;
export const Ins: TagFunction;
export const Del: TagFunction;
export const Picture: TagFunction;
export const Source: TagFunction;
export const Img: TagFunction;
export const Iframe: TagFunction;
export const Embed: TagFunction;
export const HtmlObject: TagFunction;
export const Param: TagFunction;
export const Video: TagFunction;
export const Audio: TagFunction;
export const Track: TagFunction;
export const Map: TagFunction;
export const Area: TagFunction;
export const Table: TagFunction;
export const Caption: TagFunction;
export const Colgroup: TagFunction;
export const Col: TagFunction;
export const Tbody: TagFunction;
export const Thead: TagFunction;
export const Tfoot: TagFunction;
export const Tr: TagFunction;
export const Td: TagFunction;
export const Th: TagFunction;
export const Form: TagFunction;
export const Label: TagFunction;
export const Input: TagFunction;
export const Button: TagFunction;
export const Select: TagFunction;
export const Datalist: TagFunction;
export const Optgroup: TagFunction;
export const Option: TagFunction;
export const Textarea: TagFunction;
export const Output: TagFunction;
export const Progress: TagFunction;
export const Meter: TagFunction;
export const Fieldset: TagFunction;
export const Legend: TagFunction;
export const Details: TagFunction;
export const Summary: TagFunction;
export const Dialog: TagFunction;
export const Script: TagFunction;
export const Noscript: TagFunction;
export const Template: TagFunction;
export const Slot: TagFunction;
export const Canvas: TagFunction;

/** Frozen object containing all tag functions keyed by name. */
export const Elements: Record<string, TagFunction>;

// ═══════════════════════════════════════════════════════════════════════════
//  DOM — Conditional Rendering
// ═══════════════════════════════════════════════════════════════════════════

declare class WhenNode extends Renderable {
  mountInto(parent: Node, beforeNode: Node | null): void;
  unmount(): void;
  readValue(): unknown;
  subscribeValue(fn: (value: unknown) => void): (() => void) | null;
  renderToString(render: (value: unknown) => string): string;
}

/** Reactive conditional rendering. Renders `renderTrue` when source is truthy, `renderFalse` otherwise. */
export function when(
  source: ReactiveSource<any> | unknown,
  renderTrue: () => GranularChild,
  renderFalse?: () => GranularChild,
): WhenNode;

// ═══════════════════════════════════════════════════════════════════════════
//  DOM — Lists
// ═══════════════════════════════════════════════════════════════════════════

declare class ListNode extends Renderable {
  mountInto(parent: Node, beforeNode: Node | null): void;
  unmount(): void;
  renderToString(render: (value: unknown) => string): string;
}

/**
 * Efficient reactive list rendering.
 * Each item is wrapped in `state(item)` and each index in `signal(index)`.
 * `renderItem` receives reactive wrappers, not raw values.
 */
export function list<T>(
  items: ObservableArray<T> | Signal<T[]> | State<T[]> | T[],
  renderItem?: (itemState: State<T>, indexSignal: Signal<number>) => GranularChild,
): ListNode;

// ═══════════════════════════════════════════════════════════════════════════
//  DOM — Virtual List
// ═══════════════════════════════════════════════════════════════════════════

interface VirtualListOptions<T> {
  /** Render function for each visible item. Receives raw item and index. */
  render: (item: T, index: number) => GranularChild;
  /** Scroll direction. Default: `'vertical'`. */
  direction?: 'vertical' | 'horizontal';
  /** Fixed item size in pixels. Auto-measured from first item if omitted. */
  itemSize?: number;
  /** Extra items rendered outside the viewport. Default: `2`. */
  overscan?: number;
}

declare class VirtualListNode extends Renderable {
  mountInto(parent: Node, beforeNode: Node | null): void;
  unmount(): void;
  renderToString(render: (value: unknown) => string): string;
}

export function virtualList<T>(
  items: ObservableArray<T> | Signal<T[]> | State<T[]> | T[],
  options: VirtualListOptions<T>,
): VirtualListNode;

// ═══════════════════════════════════════════════════════════════════════════
//  DOM — Portal
// ═══════════════════════════════════════════════════════════════════════════

declare class PortalNode extends Renderable {
  mountInto(parent: Node, beforeNode: Node | null): void;
  unmount(): void;
  renderToString(render: (value: unknown) => string): string;
}

/** Renders content into `document.body`. */
export function portal(content: GranularChild | (() => GranularChild)): PortalNode;
/** Renders content into the specified DOM target. */
export function portal(
  target: string | Element,
  content: GranularChild | (() => GranularChild),
): PortalNode;

// ═══════════════════════════════════════════════════════════════════════════
//  DOM — Error Boundary
// ═══════════════════════════════════════════════════════════════════════════

interface ErrorBoundaryOptions {
  /** Fallback to render when an error is caught. */
  fallback?: GranularChild | ((error: Error) => GranularChild);
  /** Called when an error is caught (e.g. for logging). */
  onError?: (error: Error, ctx: { phase: 'render' }) => void;
}

declare class ErrorBoundaryNode extends Renderable {
  mountInto(parent: Node, beforeNode: Node | null): void;
  unmount(): void;
  renderToString(render: (value: unknown) => string): string;
}

export function ErrorBoundary(
  options: ErrorBoundaryOptions,
  child: GranularChild | (() => GranularChild),
): ErrorBoundaryNode;

// ═══════════════════════════════════════════════════════════════════════════
//  EVENT HUB
// ═══════════════════════════════════════════════════════════════════════════

type EventHubHandler = (payload: any, ctx?: any) => boolean | void;

interface EventHubPhase {
  on(type: string, fn: EventHubHandler): () => void;
  any(fn: EventHubHandler): () => void;
  [event: string]: ((fn: EventHubHandler) => () => void) | any;
}

export class EventHub {
  on(phase: 'before' | 'after', type: string, fn: (payload: any, ctx?: any) => boolean | void): () => void;
  emitBefore(type: string, payload?: any, ctx?: any): boolean;
  emitAfter(type: string, payload?: any, ctx?: any): void;
  before(): EventHubPhase;
  after(): EventHubPhase;
}

// ═══════════════════════════════════════════════════════════════════════════
//  QUERY CLIENT
// ═══════════════════════════════════════════════════════════════════════════

type QueryKey = string | (string | number | boolean | null | undefined)[];

interface QueryContext {
  key: QueryKey;
  signal: AbortSignal;
}

interface QueryOptions<T = unknown> {
  key: QueryKey;
  fetcher: (ctx: QueryContext) => Promise<T>;
  staleTime?: number;
  cacheTime?: number;
  refetchOnFocus?: boolean;
  refetchOnReconnect?: boolean;
  retry?: number;
  retryDelay?: (attempt: number) => number;
  dedupe?: boolean;
  refetchOnInvalidate?: boolean;
}

interface QueryState<T = unknown> {
  data: T | null;
  error: unknown;
  status: 'idle' | 'loading' | 'success' | 'error';
  fetching: boolean;
  updatedAt: number | null;
  errorAt: number | null;
  invalidated: boolean;
}

interface Query<T = unknown> {
  readonly data: T | null;
  readonly error: unknown;
  readonly status: 'idle' | 'loading' | 'success' | 'error';
  readonly fetching: boolean;
  readonly updatedAt: number | null;
  readonly errorAt: number | null;
  readonly invalidated: boolean;
  readonly isStale: boolean;

  refetch(): Promise<T>;
  invalidate(): void;
  cancel(): void;
  ensure(): Promise<T> | null;

  state(): State<QueryState<T>>;
  getState(): QueryState<T>;
  setState(partial: Partial<QueryState<T>>): void;

  subscribe<R>(selector: (state: QueryState<T>) => R): Computed<R>;
  subscribe<R>(
    selector: (state: QueryState<T>) => R,
    listener: (next: R, prev: R) => void,
    equalityFn?: (a: R, b: R) => boolean,
  ): () => void;
}

interface EndpointDef {
  path: string;
  method?: string;
  query?: Record<string, unknown>;
  headers?: Record<string, string>;
  map?: (data: any) => any;
  middlewares?: Array<(ctx: any, next: () => Promise<any>) => Promise<any>>;
}

interface ServiceConfig {
  baseUrl?: string;
  middlewares?: Array<(ctx: any, next: () => Promise<any>) => Promise<any>>;
  endpoints?: Record<string, EndpointDef>;
}

interface ServiceRequestInput {
  params?: Record<string, string | number>;
  query?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, string>;
  map?: (data: any) => any;
  middlewares?: Array<(ctx: any, next: () => Promise<any>) => Promise<any>>;
  signal?: AbortSignal;
}

type ServiceProxy<E extends Record<string, EndpointDef> = Record<string, EndpointDef>> = {
  request(endpoint: string, input?: ServiceRequestInput): Promise<any>;
} & {
  [K in keyof E]: (input?: ServiceRequestInput) => Promise<any>;
};

export class QueryClient {
  query<T = unknown>(options: QueryOptions<T>): Query<T>;
  invalidate(key: QueryKey): void;
  refetch(key: QueryKey): Promise<any> | null;
  remove(key: QueryKey): void;
  use(middleware: (ctx: any, next: () => Promise<any>) => Promise<any>): () => void;
  service<E extends Record<string, EndpointDef>>(config?: ServiceConfig & { endpoints?: E }): ServiceProxy<E>;
}

// ═══════════════════════════════════════════════════════════════════════════
//  ROUTER
// ═══════════════════════════════════════════════════════════════════════════

interface TransitionConfig {
  enterClass?: string;
  leaveClass?: string;
  duration?: number;
}

interface RouteConfig {
  path: string;
  page?: ((...args: any[]) => GranularChild) | (new (...args: any[]) => any);
  load?: (ctx: any) => Promise<{ default: any } | any>;
  redirect?: string | ((ctx: any) => string | Promise<string>);
  loader?: (ctx: any) => Promise<any>;
  guards?: ((ctx: any) => boolean | string | void | Promise<boolean | string | void>)
    | Array<(ctx: any) => boolean | string | void | Promise<boolean | string | void>>;
  beforeEnter?: (ctx: any) => boolean | string | void | Promise<boolean | string | void>;
  beforeLeave?: (ctx: any) => boolean | string | void | Promise<boolean | string | void>;
  props?: Record<string, unknown> | ((ctx: any) => Record<string, unknown>);
  reuse?: boolean;
  transition?: TransitionConfig;
  errorPage?: ((...args: any[]) => GranularChild) | (new (...args: any[]) => any);
  layout?: (outlet: GranularChild, ctx?: any) => GranularChild;
  meta?: any;
  name?: string;
  children?: RouteConfig[];
}

interface RouterOptions {
  mode?: 'history' | 'hash' | 'memory';
  basePath?: string;
  caseSensitive?: boolean;
  trailingSlash?: 'ignore' | 'preserve';
  maxRedirects?: number;
  scrollRestoration?: boolean;
  transition?: TransitionConfig | null;
  errorPage?: ((...args: any[]) => GranularChild) | (new (...args: any[]) => any) | null;
  initialUrl?: string;
}

interface ParsedLocation {
  pathname: string;
  search: string;
  hash: string;
}

interface MatchResult {
  route: RouteConfig;
  params: Record<string, string>;
  query: Record<string, string | string[]>;
}

interface RouterState {
  route: RouteConfig;
  chain: RouteConfig[];
  params: Record<string, string>;
  query: Record<string, string | string[]>;
  location: ParsedLocation;
  page: any;
}

interface NavigateOptions {
  replace?: boolean;
  state?: any;
}

interface QueryParametersOptions {
  replace?: boolean;
  preserveHash?: boolean;
}

export class Router {
  constructor(options?: RouterOptions);

  add(config: RouteConfig): void;
  add(path: string, page: any, options?: Partial<RouteConfig>): void;

  routeState(): State<RouterState>;
  queryParameters(options?: QueryParametersOptions): State<Record<string, string | string[]>>;

  beforeEach(fn: (ctx: any) => boolean | string | void | Promise<boolean | string | void>): () => void;
  afterEach(fn: (ctx: any) => void): () => void;

  mount(target: string | Element): void;
  unmount(): void;
  start(): void;
  stop(): void;

  navigate(to: string | Partial<ParsedLocation>, options?: NavigateOptions): Promise<void>;
  replace(to: string | Partial<ParsedLocation>, options?: NavigateOptions): Promise<void>;
  back(): void;
  forward(): void;
  go(delta: number): void;

  resolve(path: string | Partial<ParsedLocation>): string;
  parse(url: string): { location: ParsedLocation; match: MatchResult | null };
  checkGuards(): Promise<boolean>;

  readonly current: {
    route: RouteConfig;
    chain: RouteConfig[];
    page: any;
    mounted: boolean;
    mountedNodes: Node[];
    params: Record<string, string>;
    query: Record<string, string | string[]>;
    location: ParsedLocation;
    data: any;
    routeData: any;
  } | null;
}

export function createRouter(options?: RouterOptions & { routes?: RouteConfig[] }): Router;

/** Singleton router instance. */
export const router: Router;

// ═══════════════════════════════════════════════════════════════════════════
//  WEBSOCKET
// ═══════════════════════════════════════════════════════════════════════════

interface WebSocketOptions {
  url: string;
  protocols?: string | string[];
  serialize?: (value: any) => string | ArrayBuffer | Blob;
  parse?: (value: string | ArrayBuffer | Blob) => any;
  reconnect?: boolean;
  maxRetries?: number;
  reconnectDelay?: (attempt: number) => number;
  autoConnect?: boolean;
}

interface WebSocketState {
  status: 'idle' | 'connecting' | 'open' | 'closed';
  connected: boolean;
  reconnecting: boolean;
  attempts: number;
  lastMessage: any;
  lastError: any;
}

export class WebSocketClient {
  constructor(options?: WebSocketOptions);
  state(): State<WebSocketState>;
  before(): EventHubPhase;
  after(): EventHubPhase;
  setUrl(url: string): void;
  connect(): void;
  send(value: any): void;
  close(code?: number, reason?: string): void;
}

export function createWebSocket(options?: WebSocketOptions): WebSocketClient;

// ═══════════════════════════════════════════════════════════════════════════
//  BOOTSTRAP
// ═══════════════════════════════════════════════════════════════════════════

/** Mounts an application into a DOM target. */
export function bootstrap(
  app: (() => GranularChild) | (new () => { attach?(el: Element): Promise<void>; mountInto?(parent: Node, before: Node | null): void }),
  target: string | Element,
): Promise<{ unmount(): void }>;
