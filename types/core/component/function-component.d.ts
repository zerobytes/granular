export function component(renderFn: any): {
    (props: any): FunctionComponentInstance;
    __zbFactory: boolean;
};
declare class FunctionComponentInstance extends DirtyHost {
    constructor(renderFn: any, props: any);
    props: any;
    mountInto(parent: any, beforeNode: any): void;
    renderToString(render: any): any;
    onCleanup(fn: any): void;
    #private;
}
import { DirtyHost } from '../reactivity/dirty-host.js';
export {};
