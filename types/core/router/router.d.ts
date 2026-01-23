export function createRouter(options: any): Router;
export class Router {
    constructor(options?: {});
    add(pathOrConfig: any, PageClass: any, options?: {}): {
        id: string;
        name: any;
        path: any;
        rawPath: any;
        parent: any;
        meta: any;
        redirect: any;
        loader: any;
        guards: any;
        beforeEnter: any;
        beforeLeave: any;
        props: any;
        reuse: any;
        transition: any;
        errorPage: any;
        load: any;
        page: any;
        layout: any;
        children: any[];
    };
    beforeEach(fn: any): () => boolean;
    afterEach(fn: any): () => boolean;
    mount(target: any): void;
    unmount(): void;
    start(): void;
    stop(): void;
    navigate(to: any, options?: {}): Promise<void>;
    replace(to: any, options?: {}): Promise<void>;
    back(): void;
    forward(): void;
    go(delta: any): void;
    resolve(path: any): string;
    parse(url: any): {
        location: {
            pathname: any;
            search: string;
            hash: string;
            query: {};
            state: any;
            url: string;
        };
        match: {
            route: any;
            params: {};
            chain: any[];
        };
    };
    get current(): any;
    queryParameters(options?: {}): {};
    #private;
}
export const router: Router;
