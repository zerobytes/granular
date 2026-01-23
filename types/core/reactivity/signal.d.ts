export function signal(initial: any): {
    get(): any;
    set(next: any, force?: boolean): boolean;
    subscribe(fn: any): () => boolean;
    before(fn: any): () => boolean;
};
export function isSignal(value: any): boolean;
export function subscribeSignal(sig: any, fn: any): any;
export function readSignal(sig: any): any;
export function setSignal(sig: any, next: any, force?: boolean): any;
export function getMappedArrayMeta(value: any): any;
