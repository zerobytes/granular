export function after(...targets: any[]): {
    change(fn: any): () => void;
    compute(fn: any, options?: {}): {};
};
export function before(...targets: any[]): {
    change(fn: any): () => void;
    compute(fn: any, options?: {}): {};
};
export function set(target: any, value: any): void;
export function subscribe(target: any, selector: any, listener: any, equalityFn: any): {};
