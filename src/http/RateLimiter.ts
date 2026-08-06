export { RateLimiter as default };
export type { RateLimiterOptions, RateLimitScope };

type RateLimitScope = "IP" | null;

interface RateLimiterOptions {
    enabled: boolean;
    windowMs: number;
    ipMax: number;
    maxTrackedIps?: number;
}

class RateLimiter {
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

        const ipRequests = this._prune(this._requestsByIp.get(ip) ?? [], now);

        if (ipRequests.length >= this._options.ipMax) {
            this._remember(ip, ipRequests);
            return "IP";
        }

        if (ipRequests.length === 0) {
            this._requestsByIp.delete(ip);
        }

        this._makeRoomFor(ip, now);
        ipRequests.push(now);
        this._remember(ip, ipRequests);

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

        for (const [ip, timestamps] of this._requestsByIp.entries()) {
            const activeTimestamps = this._prune(timestamps, now);

            if (activeTimestamps.length === 0) {
                this._requestsByIp.delete(ip);
                continue;
            }

            this._requestsByIp.set(ip, activeTimestamps);
        }
    }

    private _makeRoomFor (ip: string, now: number): void {
        this._sweepAt(now);

        if (this._requestsByIp.has(ip)) {
            return;
        }

        const maxTrackedIps = this._options.maxTrackedIps ?? 10_000;

        while (this._requestsByIp.size >= maxTrackedIps) {
            const oldestIp = this._requestsByIp.keys().next().value;

            if (oldestIp === undefined) {
                return;
            }

            this._requestsByIp.delete(oldestIp);
        }
    }

    private _remember (ip: string, timestamps: number[]): void {
        this._requestsByIp.delete(ip);
        this._requestsByIp.set(ip, timestamps);
    }

    private _sweepAt (now: number): void {
        for (const [ip, timestamps] of this._requestsByIp.entries()) {
            const activeTimestamps = this._prune(timestamps, now);

            if (activeTimestamps.length === 0) {
                this._requestsByIp.delete(ip);
            } else {
                this._requestsByIp.set(ip, activeTimestamps);
            }
        }
    }
}
