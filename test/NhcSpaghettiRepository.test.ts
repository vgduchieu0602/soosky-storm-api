import assert from "node:assert/strict";
import test from "node:test";
import { gzipSync } from "node:zlib";
import StormProviderError from "../src/domain/errors/StormProviderError.js";
import NhcSpaghettiRepository from "../src/adapters/nhc/NhcSpaghettiRepository.js";

const AID_PUBLIC_URL = "https://example.test/atcf/aid_public";
const AID_DECK = [
    "EP, 07, 2026072306, 01, AVNO, 00, 119N, 1019W, 45",
    "EP, 07, 2026072306, 01, AVNO, 12, 120N, 1020W, 50",
    "EP, 07, 2026072306, 01, EMXI, 12, 121N, 1021W, 55",
].join("\n");

test("NHC spaghetti repository fetches, decompresses, and normalizes an EP A-deck", async () => {
    const repository = new NhcSpaghettiRepository(AID_PUBLIC_URL, async (input) => {
        assert.equal(String(input), AID_PUBLIC_URL + "/aep072026.dat.gz");

        return new Response(gzipSync(AID_DECK), { status: 200 });
    });

    assert.deepEqual(await repository.getStormSpaghetti("nhc:EP072026"), {
        stormId: "nhc:EP072026",
        source: "nhc-atcf",
        cycleTime: "2026-07-23T06:00:00.000Z",
        cachedUntil: null,
        availability: "available",
        models: [
            {
                code: "AVNO",
                label: "GFS",
                points: [
                    { forecastHour: 0, lat: 11.9, lon: -101.9, windSpeed: 45 },
                    { forecastHour: 12, lat: 12, lon: -102, windSpeed: 50 },
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

test("NHC spaghetti repository reports unsupported basins without fetching NHC", async () => {
    let calls = 0;
    const repository = new NhcSpaghettiRepository(AID_PUBLIC_URL, async () => {
        calls += 1;
        return new Response(null, { status: 500 });
    });

    assert.deepEqual(await repository.getStormSpaghetti("nhc:WP012026"), {
        stormId: "nhc:WP012026",
        source: "nhc-atcf",
        cycleTime: null,
        cachedUntil: null,
        availability: "not_supported",
        reason: "NHC ATCF spaghetti data is supported only for AL, EP, and CP basins.",
        models: [],
    });
    assert.equal(calls, 0);
});

test("NHC spaghetti repository reports an NHC file that has not been published", async () => {
    const repository = new NhcSpaghettiRepository(AID_PUBLIC_URL, async () => {
        return new Response(null, { status: 404 });
    });

    assert.deepEqual(await repository.getStormSpaghetti("nhc:EP072026"), {
        stormId: "nhc:EP072026",
        source: "nhc-atcf",
        cycleTime: null,
        cachedUntil: null,
        availability: "not_available",
        reason: "NHC has not published usable model forecast data for this storm.",
        models: [],
    });
});

test("NHC spaghetti repository reports unavailable NHC source failures", async () => {
    const repository = new NhcSpaghettiRepository(AID_PUBLIC_URL, async () => {
        return new Response(null, { status: 503 });
    });

    await assert.rejects(
        repository.getStormSpaghetti("nhc:EP072026"),
        StormProviderError,
    );
});

test("NHC spaghetti repository reports invalid compressed data as a provider failure", async () => {
    const repository = new NhcSpaghettiRepository(AID_PUBLIC_URL, async () => {
        return new Response("not gzip", { status: 200 });
    });

    await assert.rejects(
        repository.getStormSpaghetti("nhc:EP072026"),
        StormProviderError,
    );
});
