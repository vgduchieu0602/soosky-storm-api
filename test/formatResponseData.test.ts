import assert from "node:assert/strict";
import test from "node:test";
import formatResponseData from "../src/http/formatResponseData.js";

test("formats non-JSON-safe values recursively at the HTTP boundary", () => {
    const result = formatResponseData({
        windSpeed: 12.5,
        observedAt: new Date("2026-08-04T08:00:00.000Z"),
        missing: null,
        unavailable: undefined,
        invalidNumber: Number.NaN,
        nested: [1, Infinity, true],
    });

    assert.deepEqual(result, {
        windSpeed: "12.5",
        observedAt: "2026-08-04T08:00:00.000Z",
        missing: "n/a",
        unavailable: "n/a",
        invalidNumber: "n/a",
        nested: ["1", "n/a", true],
    });
});
