import assert from "node:assert/strict";
import test from "node:test";
import { connectMongoInBackground } from "../src/adapters/mongo/connectMongo.js";

test("background Mongo connection resolves instead of failing application startup", async () => {
    const loggedErrors: string[] = [];
    let scheduledDelayMs: number | null = null;

    await assert.doesNotReject(connectMongoInBackground({
        connect: async () => {
            throw new Error("Mongo offline");
        },
        scheduleRetry: (_retry, delayMs) => {
            scheduledDelayMs = delayMs;
        },
        logError: (message) => {
            loggedErrors.push(message);
        },
    }));

    assert.equal(scheduledDelayMs, 30_000);
    assert.equal(loggedErrors.length, 1);
    assert.match(loggedErrors[0] ?? "", /Mongo offline/);
});

test("background Mongo connection connects once when the driver is reachable", async () => {
    let calls = 0;
    let retryScheduled = false;

    await connectMongoInBackground({
        connect: async () => {
            calls += 1;
        },
        scheduleRetry: () => {
            retryScheduled = true;
        },
        logError: () => undefined,
    });

    assert.equal(calls, 1);
    assert.equal(retryScheduled, false);
});

test("background Mongo connection retries after a failure", async () => {
    const attempts: number[] = [];
    let scheduledRetry: (() => void) | null = null;

    await connectMongoInBackground({
        connect: async () => {
            attempts.push(attempts.length);

            if (attempts.length === 1) {
                throw new Error("Mongo offline");
            }
        },
        scheduleRetry: (retry) => {
            scheduledRetry = retry;
        },
        logError: () => undefined,
    });

    assert.equal(attempts.length, 1);
    assert.notEqual(scheduledRetry, null);

    (scheduledRetry as unknown as () => void)();
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(attempts.length, 2);
});
