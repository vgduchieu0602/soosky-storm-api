import assert from "node:assert/strict";
import test from "node:test";
import RateLimiter from "../src/http/RateLimiter.js";

test("returns IP after the IP threshold is exceeded", () => {
    const limiter = new RateLimiter({
        enabled: true,
        windowMs: 60_000,
        globalMax: 10,
        ipMax: 2,
    });

    assert.equal(limiter.check("198.51.100.1"), null);
    assert.equal(limiter.check("198.51.100.1"), null);
    assert.equal(limiter.check("198.51.100.1"), "IP");

    limiter.dispose();
});

test("returns GLOBAL after the global threshold is exceeded", () => {
    const limiter = new RateLimiter({
        enabled: true,
        windowMs: 60_000,
        globalMax: 2,
        ipMax: 10,
    });

    assert.equal(limiter.check("198.51.100.1"), null);
    assert.equal(limiter.check("198.51.100.2"), null);
    assert.equal(limiter.check("198.51.100.3"), "GLOBAL");

    limiter.dispose();
});

test("does not block requests when disabled", () => {
    const limiter = new RateLimiter({
        enabled: false,
        windowMs: 60_000,
        globalMax: 1,
        ipMax: 1,
    });

    assert.equal(limiter.check("198.51.100.1"), null);
    assert.equal(limiter.check("198.51.100.1"), null);

    limiter.dispose();
});
