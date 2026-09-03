export { cloneWithCacheStatus, getCacheStatus, markCacheStatus };
export type { CacheStatus };

type CacheStatus = "upstream" | "cached" | "stale";

const STATUSES = new WeakMap<object, CacheStatus>();

function markCacheStatus<T extends object> (value: T, status: CacheStatus): T {
    STATUSES.set(value, status);
    return value;
}

function cloneWithCacheStatus<T extends object> (value: T, status: CacheStatus): T {
    const copy = Array.isArray(value) ? [...value] : { ...value };

    return markCacheStatus(copy as T, status);
}

function getCacheStatus (value: unknown): CacheStatus | null {
    return typeof value === "object" && value !== null ? STATUSES.get(value) ?? null : null;
}
