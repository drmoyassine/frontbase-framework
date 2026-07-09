/**
 * CacheProvider interface — ported subset of the product's ICacheProvider.
 * RULE 3: a cache get MUST return a copy, never the stored reference (a consumer
 * mutating a cached row corrupts every later hit — BUG-1 class).
 */
export interface CacheProvider {
    /** Returns a COPY (RULE 3); JSON-parsed if storable. */
    get(key: string): Promise<unknown>;
    set(key: string, value: string): Promise<void>;
    setex(key: string, seconds: number, value: string): Promise<void>;
    del(...keys: string[]): Promise<number>;
    keys(pattern: string): Promise<string[]>;
    /** Increment/decrement (rate limiting, concurrency). */
    incr(key: string): Promise<number>;
    expire(key: string, seconds: number): Promise<number>;
}
