import assert from "node:assert/strict";
import test from "node:test";
import RateLimiter from "../src/http/RateLimiter.js";

test("returns IP after the IP threshold is exceeded", () => {
    const limiter = new RateLimiter({
        enabled: true,
        windowMs: 60_000,
        ipMax: 2,
    });

    assert.equal(limiter.check("198.51.100.1"), null);
    assert.equal(limiter.check("198.51.100.1"), null);
    assert.equal(limiter.check("198.51.100.1"), "IP");

    limiter.dispose();
});

test("does not reject different IPs because of a legacy global limit setting", () => {
    const legacyGlobalLimit = { globalMax: 2 };
    const limiter = new RateLimiter({
        enabled: true,
        windowMs: 60_000,
        ipMax: 10,
        ...legacyGlobalLimit,
    });

    assert.equal(limiter.check("198.51.100.1"), null);
    assert.equal(limiter.check("198.51.100.2"), null);
    assert.equal(limiter.check("198.51.100.3"), null);

    limiter.dispose();
});

test("forgets the least recently used IP when the tracking registry is full", () => {
    const limiter = new RateLimiter({
        enabled: true,
        windowMs: 60_000,
        ipMax: 1,
        maxTrackedIps: 2,
    });

    assert.equal(limiter.check("198.51.100.1"), null);
    assert.equal(limiter.check("198.51.100.2"), null);
    assert.equal(limiter.check("198.51.100.3"), null);
    assert.equal(limiter.check("198.51.100.1"), null);

    limiter.dispose();
});

test("does not block requests when disabled", () => {
    const limiter = new RateLimiter({
        enabled: false,
        windowMs: 60_000,
        ipMax: 1,
    });

    assert.equal(limiter.check("198.51.100.1"), null);
    assert.equal(limiter.check("198.51.100.1"), null);

    limiter.dispose();
});
