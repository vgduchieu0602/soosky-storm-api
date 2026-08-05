import assert from "node:assert/strict";
import test from "node:test";
import parseNhcAidDeck from "../src/adapters/nhc/parseNhcAidDeck.js";

test("ATCF parser selects the latest usable cycle and groups approved forecast models", () => {
    const result = parseNhcAidDeck([
        "EP, 07, 2026072300, 01, AVNO, 12, 101N, 1001W, 40",
        "EP, 07, 2026072300, 01, AVNO, 24, 110N, 1010W, 45",
        "EP, 07, 2026072306, 01, AVNO, 00, 119N, 1019W, 45",
        "EP, 07, 2026072306, 01, AVNO, 12, 120N, 1020W, 50",
        "EP, 07, 2026072306, 01, AVNO, 12, 125N, 1025W, 55",
        "EP, 07, 2026072306, 01, AVNO, 24, 130N, 1030W, 60",
        "EP, 07, 2026072306, 01, AVNO, 36, 999N, 1040W, 65",
        "EP, 07, 2026072306, 01, EMXI, 12, 121N, 1021W, 55",
        "EP, 07, 2026072306, 01, CARQ, 00, 119N, 1019W, 45",
        "EP, 07, 2026072306, 01, OFCL, 12, 122N, 1022W, 55",
        "EP, 07, 2026072312, 01, CARQ, 00, 119N, 1019W, 45",
    ].join("\n"));

    assert.deepEqual(result, {
        cycleTime: "2026-07-23T06:00:00.000Z",
        models: [
            {
                code: "AVNO",
                label: "GFS",
                points: [
                    { forecastHour: 0, lat: 11.9, lon: -101.9, windSpeed: 45 },
                    { forecastHour: 12, lat: 12, lon: -102, windSpeed: 50 },
                    { forecastHour: 24, lat: 13, lon: -103, windSpeed: 60 },
                ],
            },
            {
                code: "EMXI",
                label: "ECMWF",
                points: [
                    { forecastHour: 12, lat: 12.1, lon: -102.1, windSpeed: 55 },
                ],
            },
        ],
    });
});

test("ATCF parser returns null when no approved model has usable coordinates", () => {
    const result = parseNhcAidDeck([
        "EP, 07, 2026072306, 01, CARQ, 00, 119N, 1019W, 45",
        "EP, 07, 2026072306, 01, AVNO, 12, 120N, invalid, 50",
    ].join("\n"));

    assert.equal(result, null);
});
