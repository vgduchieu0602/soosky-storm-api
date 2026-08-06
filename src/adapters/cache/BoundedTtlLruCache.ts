export { BoundedTtlLruCache as default };
export type { BoundedTtlLruCacheOptions };

interface BoundedTtlLruCacheOptions<T> {
    maxEntries: number;
    maxBytes: number;
    estimateBytes: (value: T) => number;
    now?: () => number;
}

interface CachedValue<T> {
    expiresAt: number;
    value: T;
    bytes: number;
}

class BoundedTtlLruCache<T> {
    private readonly _values = new Map<string, CachedValue<T>>();
    private readonly _now: () => number;
    private _totalBytes = 0;

    public constructor (private readonly _options: BoundedTtlLruCacheOptions<T>) {
        this._now = _options.now ?? Date.now;
    }

    public get (key: string): T | null {
        const cached = this._values.get(key);

        if (!cached) {
            return null;
        }

        if (this._now() >= cached.expiresAt) {
            this._delete(key);
            return null;
        }

        this._values.delete(key);
        this._values.set(key, cached);

        return cached.value;
    }

    public set (key: string, value: T, ttlMs: number): void {
        const bytes = this._options.estimateBytes(value);

        this._delete(key);

        if (!Number.isFinite(bytes) || bytes < 0 || bytes > this._options.maxBytes || this._options.maxEntries < 1) {
            return;
        }

        const now = this._now();
        this.clearExpired(now);
        this._values.set(key, { expiresAt: now + ttlMs, value, bytes });
        this._totalBytes += bytes;

        while (this._values.size > this._options.maxEntries || this._totalBytes > this._options.maxBytes) {
            const oldestKey = this._values.keys().next().value;

            if (oldestKey === undefined) {
                return;
            }

            this._delete(oldestKey);
        }
    }

    public clearExpired (now = this._now()): void {
        for (const [key, cached] of this._values) {
            if (now >= cached.expiresAt) {
                this._delete(key);
            }
        }
    }

    private _delete (key: string): void {
        const cached = this._values.get(key);

        if (!cached) {
            return;
        }

        this._values.delete(key);
        this._totalBytes -= cached.bytes;
    }
}
