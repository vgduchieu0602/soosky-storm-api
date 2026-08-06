import assert from "node:assert/strict";
import test from "node:test";
import BoundedTtlLruCache from "../src/adapters/cache/BoundedTtlLruCache.js";

test("keeps a recently read entry when entry capacity evicts the least recently used value", () => {
    const cache = new BoundedTtlLruCache<string>({
        maxEntries: 2,
        maxBytes: 20,
        now: () => 1_000,
        estimateBytes: (value) => Buffer.byteLength(value, "utf-8"),
    });

    cache.set("first", "one", 1_000);
    cache.set("second", "two", 1_000);
    assert.equal(cache.get("first"), "one");

    cache.set("third", "three", 1_000);

    assert.equal(cache.get("second"), null);
    assert.equal(cache.get("first"), "one");
    assert.equal(cache.get("third"), "three");
});

test("removes expired entries and does not retain a value larger than its byte budget", () => {
    let now = 1_000;
    const cache = new BoundedTtlLruCache<string>({
        maxEntries: 2,
        maxBytes: 3,
        now: () => now,
        estimateBytes: (value) => Buffer.byteLength(value, "utf-8"),
    });

    cache.set("expires", "ok", 100);
    now = 1_100;
    assert.equal(cache.get("expires"), null);

    cache.set("oversized", "four", 1_000);
    assert.equal(cache.get("oversized"), null);
});
