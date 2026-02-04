export function when(source: any, renderTrue: any, renderFalse: any): WhenNode;
export function isWhen(value: any): boolean;
export function readWhenValue(value: any): any;
export function subscribeWhenValue(value: any, fn: any): any;
export class WhenNode extends Renderable {
    constructor(source: any, renderTrue: any, renderFalse: any);
    mountInto(parent: any, beforeNode: any): void;
    readValue(): any;
    subscribeValue(fn: any): any;
    renderToString(render: any): any;
    #private;
}
import { Renderable } from '../renderable/renderable.js';
