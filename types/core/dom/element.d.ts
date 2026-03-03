export function setTemplateCacheSize(max: any): void;
export class ElementNode extends Renderable {
    constructor(tagName: any, props?: {}, children?: any[]);
    tagName: any;
    props: {};
    children: any[];
    mountInto(parent: any, beforeNode: any): void;
    renderToString(render: any): string;
    #private;
}
import { Renderable } from '../renderable/renderable.js';
