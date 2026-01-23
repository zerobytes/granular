/**
 * Query manager with caching and refetch orchestration.
 */
export class QueryClient {
    /**
     * Gets (or creates) a query instance for the given key.
     *
     * @param {QueryOptions} options
     * @returns {Store & QueryState & { refetch(): Promise<any>, invalidate(): void, cancel(): void, ensure(): (Promise<any>|null), isStale: boolean }}
     */
    query(options: QueryOptions): Store & QueryState & {
        refetch(): Promise<any>;
        invalidate(): void;
        cancel(): void;
        ensure(): (Promise<any> | null);
        isStale: boolean;
    };
    use(middleware: any): () => void;
    service(config?: {}): {
        request: (endpoint: any, input?: {}) => Promise<any>;
    };
    /**
     * Marks a query as invalidated.
     * @param {QueryKey} key
     */
    invalidate(key: QueryKey): void;
    /**
     * Refetches a query immediately.
     * @param {QueryKey} key
     * @returns {Promise<any>|null}
     */
    refetch(key: QueryKey): Promise<any> | null;
    /**
     * Removes a query from cache (cancels in-flight).
     * @param {QueryKey} key
     */
    remove(key: QueryKey): void;
    #private;
}
export type QueryKeyAtom = string | number | boolean | null;
export type QueryKey = QueryKeyAtom | QueryKeyAtom[];
export type QueryStatus = "idle" | "loading" | "success" | "error";
export type QueryState = {
    data: any;
    error: any;
    status: QueryStatus;
    fetching: boolean;
    updatedAt: number | null;
    errorAt: number | null;
    invalidated: boolean;
};
export type QueryContext = {
    key: QueryKey;
    signal: AbortSignal;
};
export type QueryOptions = {
    key: QueryKey;
    fetcher: (ctx: QueryContext) => Promise<any>;
    /**
     * ms
     */
    staleTime?: number;
    /**
     * ms
     */
    cacheTime?: number;
    refetchOnFocus?: boolean;
    refetchOnReconnect?: boolean;
    retry?: number;
    retryDelay?: (attempt: number) => number;
    dedupe?: boolean;
    refetchOnInvalidate?: boolean;
};
