export { RateLimiter as default };
export type { RateLimiterOptions, RateLimitScope };

type RateLimitScope = "IP" | "GLOBAL" | null;

interface RateLimiterOptions {
    enabled: boolean;
    windowMs: number;
    globalMax: number;
    ipMax: number;
}

class RateLimiter {
    private _globalRequests: number[] = [];
    private readonly _requestsByIp = new Map<string, number[]>();
    private readonly _sweepTimer: NodeJS.Timeout;

    public constructor (private readonly _options: RateLimiterOptions) {
        this._sweepTimer = setInterval(() => {
            this._sweep();
        }, this._options.windowMs);
        this._sweepTimer.unref();
    }

    public check (ip: string, now = Date.now()): RateLimitScope {
        if (!this._options.enabled) {
            return null;
        }

        this._globalRequests = this._prune(this._globalRequests, now);

        if (this._globalRequests.length >= this._options.globalMax) {
            return "GLOBAL";
        }

        const ipRequests = this._prune(this._requestsByIp.get(ip) ?? [], now);

        if (ipRequests.length >= this._options.ipMax) {
            return "IP";
        }

        this._globalRequests.push(now);
        ipRequests.push(now);
        this._requestsByIp.set(ip, ipRequests);

        return null;
    }

    public dispose (): void {
        clearInterval(this._sweepTimer);
    }

    private _prune (timestamps: number[], now: number): number[] {
        const oldestAllowedTimestamp = now - this._options.windowMs;

        return timestamps.filter((timestamp) => timestamp >= oldestAllowedTimestamp);
    }

    private _sweep (): void {
        const now = Date.now();

        this._globalRequests = this._prune(this._globalRequests, now);

        for (const [ip, timestamps] of this._requestsByIp.entries()) {
            const activeTimestamps = this._prune(timestamps, now);

            if (activeTimestamps.length === 0) {
                this._requestsByIp.delete(ip);
                continue;
            }

            this._requestsByIp.set(ip, activeTimestamps);
        }
    }
}
