import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import GdacsStormRepository from "../src/adapters/gdacs/GdacsStormRepository.js";
import StormNotFoundError from "../src/domain/errors/StormNotFoundError.js";
import StormProviderError from "../src/domain/errors/StormProviderError.js";

const EVENT_LIST_URL = "https://example.test/gdacs/geteventlist";
const EVENT_DATA_URL = "https://example.test/gdacs/geteventdata";
const GEOMETRY_URL = "https://example.test/gdacs/getgeometry";
const STORM_ID = "gdacs:TC:1001297:51";

test("GDACS storm repository keeps only current tropical cyclones from the event list", async () => {
    const eventList = await readFixture("tc-event-list.json");
    const requestedUrls: string[] = [];
    const repository = createRepository(async (input) => {
        requestedUrls.push(String(input));
        return new Response(eventList, { status: 200 });
    });

    const storms = await repository.getActiveStorms();

    assert.deepEqual(storms.map((storm) => storm.stormId), [
        "gdacs:TC:1001297:51",
        "gdacs:TC:1001256:47",
    ]);
    assert.deepEqual(requestedUrls, [EVENT_LIST_URL + "?eventlist=TC"]);
});

test("GDACS storm repository normalizes an event list feature into a storm summary", async () => {
    const eventList = await readFixture("tc-event-list.json");
    const repository = createRepository(async () => new Response(eventList, { status: 200 }));

    const [storm] = await repository.getActiveStorms();

    assert.deepEqual(storm, {
        stormId: "gdacs:TC:1001297:51",
        name: "DOLPHIN-26",
        source: "gdacs",
        basin: null,
        area: "Marshall Islands, Japan, China",
        lat: 27,
        lon: 124.8,
        datetime: "2026-08-08T12:00:00.000Z",
        windSpeed: 145,
        category: "category_5",
        alertLevel: "Orange",
    });
});

test("GDACS storm repository drops an event intensity published in an unexpected unit", async () => {
    const repository = createRepository(async () => {
        return new Response(JSON.stringify({
            type: "FeatureCollection",
            features: [{
                type: "Feature",
                geometry: { type: "Point", coordinates: [110.5, 15.25] },
                properties: {
                    eventid: 1001300,
                    episodeid: 3,
                    eventname: "ALPHA-26",
                    iscurrent: "true",
                    fromdate: "2026-08-01T00:00:00",
                    todate: "2026-08-02T06:00:00",
                    severitydata: { severity: 90, severityunit: "mph" },
                },
            }],
        }), { status: 200 });
    });

    const [storm] = await repository.getActiveStorms();

    assert.equal(storm?.windSpeed, null);
    assert.equal(storm?.category, null);
});

test("GDACS storm repository skips event list features without a usable identifier or position", async () => {
    const repository = createRepository(async () => {
        return new Response(JSON.stringify({
            type: "FeatureCollection",
            features: [
                { type: "Feature", geometry: null, properties: { eventid: 1, episodeid: 1, iscurrent: "true", todate: "2026-08-01T00:00:00" } },
                { type: "Feature", geometry: { type: "Point", coordinates: [10, 10] }, properties: { eventid: 0, episodeid: 1, iscurrent: "true", todate: "2026-08-01T00:00:00" } },
                { type: "Feature", geometry: { type: "Point", coordinates: [10, 10] }, properties: { eventid: 2, episodeid: 1, iscurrent: "true" } },
            ],
        }), { status: 200 });
    });

    assert.deepEqual(await repository.getActiveStorms(), []);
});

test("GDACS storm repository rejects a malformed event list response", async () => {
    const repository = createRepository(async () => {
        return new Response(JSON.stringify({ type: "Feature", properties: {} }), { status: 200 });
    });

    await assert.rejects(repository.getActiveStorms(), StormProviderError);
});

test("GDACS storm repository rejects an event list response that is not JSON", async () => {
    const repository = createRepository(async () => new Response("<html>error</html>", { status: 200 }));

    await assert.rejects(repository.getActiveStorms(), StormProviderError);
});

test("GDACS storm repository maps event list upstream failures to provider errors", async (context) => {
    await context.test("HTTP failure", async () => {
        const repository = createRepository(async () => new Response(null, { status: 503 }));

        await assert.rejects(repository.getActiveStorms(), StormProviderError);
    });

    await context.test("HTTP 404", async () => {
        const repository = createRepository(async () => new Response(null, { status: 404 }));

        await assert.rejects(repository.getActiveStorms(), StormProviderError);
    });

    await context.test("network failure", async () => {
        const repository = createRepository(async () => {
            throw new Error("network unavailable");
        });

        await assert.rejects(repository.getActiveStorms(), StormProviderError);
    });
});

test("GDACS storm repository splits the event geometry track into observed and forecast points", async () => {
    const requestedUrls: string[] = [];
    const repository = await createEventRepository(requestedUrls);

    const track = await repository.getStormTrack(STORM_ID);

    assert.deepEqual(track, {
        stormId: STORM_ID,
        name: "DOLPHIN-26",
        source: "gdacs",
        area: "Marshall Islands, Japan, China",
        issuedAt: "2026-08-08T16:50:16.000Z",
        cachedUntil: null,
        observed: [
            { lat: 27, lon: 126, datetime: "2026-08-08T00:00:00.000Z", windSpeed: null, category: null },
            { lat: 26.9, lon: 125.2, datetime: "2026-08-08T06:00:00.000Z", windSpeed: null, category: null },
            { lat: 27, lon: 124.8, datetime: "2026-08-08T12:00:00.000Z", windSpeed: null, category: null },
        ],
        forecast: [
            { lat: 27.3, lon: 123.5, datetime: "2026-08-09T00:00:00.000Z", windSpeed: null, category: null, forecastHour: 12 },
            { lat: 27.9, lon: 121.4, datetime: "2026-08-09T12:00:00.000Z", windSpeed: null, category: null, forecastHour: 24 },
        ],
    });
    assert.deepEqual(requestedUrls, [
        EVENT_DATA_URL + "?eventtype=TC&eventid=1001297&episodeid=51",
        GEOMETRY_URL + "?eventtype=TC&eventid=1001297&episodeid=51",
    ]);
});

test("GDACS storm repository falls back to the event position when no timed positions exist", async () => {
    const eventData = await readFixture("tc-event-data.json");
    const repository = createRepository(async (input) => {
        if (String(input).startsWith(EVENT_DATA_URL)) {
            return new Response(eventData, { status: 200 });
        }

        return new Response(null, { status: 404 });
    });

    const track = await repository.getStormTrack(STORM_ID);

    assert.deepEqual(track.observed, [{
        lat: 27,
        lon: 124.8,
        datetime: "2026-08-08T12:00:00.000Z",
        windSpeed: 145,
        category: "category_5",
    }]);
    assert.deepEqual(track.forecast, []);
});

test("GDACS storm repository returns a chronological history track without exact duplicates", async () => {
    const repository = await createEventRepository();

    assert.deepEqual(await repository.getHistoricalStormTrack(STORM_ID), {
        stormId: STORM_ID,
        name: "DOLPHIN-26",
        source: "gdacs",
        trackKind: "gdacs_observed_track",
        cachedUntil: null,
        availability: "available",
        history: [
            { lat: 27, lon: 126, datetime: "2026-08-08T00:00:00.000Z", windSpeed: null, category: null },
            { lat: 26.9, lon: 125.2, datetime: "2026-08-08T06:00:00.000Z", windSpeed: null, category: null },
            { lat: 27, lon: 124.8, datetime: "2026-08-08T12:00:00.000Z", windSpeed: null, category: null },
        ],
    });
});

test("GDACS storm repository reports a history track without timed positions as unavailable", async () => {
    const eventData = await readFixture("tc-event-data.json");
    const repository = createRepository(async (input) => {
        if (String(input).startsWith(EVENT_DATA_URL)) {
            return new Response(eventData, { status: 200 });
        }

        return new Response(JSON.stringify({ type: "FeatureCollection", features: [] }), { status: 200 });
    });

    assert.deepEqual(await repository.getHistoricalStormTrack(STORM_ID), {
        stormId: STORM_ID,
        name: "DOLPHIN-26",
        source: "gdacs",
        trackKind: null,
        cachedUntil: null,
        availability: "not_available",
        reason: "GDACS has not published timed track positions for this storm event.",
        history: [],
    });
});

test("GDACS storm repository rejects an invalid GDACS storm ID before calling the provider", async (context) => {
    const invalidIds = ["gdacs:TC:abc:2", "gdacs:TC:1001297", "gdacs:TC:0:2", "nhc:EP072026", "gdacs:FL:1:2"];

    for (const stormId of invalidIds) {
        await context.test(stormId, async () => {
            let calls = 0;
            const repository = createRepository(async () => {
                calls += 1;
                return new Response("{}", { status: 200 });
            });

            await assert.rejects(repository.getStormTrack(stormId), StormNotFoundError);
            await assert.rejects(repository.getHistoricalStormTrack(stormId), StormNotFoundError);
            assert.equal(calls, 0);
        });
    }
});

test("GDACS storm repository maps an unknown event to a storm-not-found error", async () => {
    const repository = createRepository(async () => new Response(null, { status: 404 }));

    await assert.rejects(repository.getStormTrack(STORM_ID), StormNotFoundError);
    await assert.rejects(repository.getHistoricalStormTrack(STORM_ID), StormNotFoundError);
});

test("GDACS storm repository rejects malformed event data", async (context) => {
    await context.test("not a feature", async () => {
        const repository = createRepository(async () => new Response(JSON.stringify([]), { status: 200 }));

        await assert.rejects(repository.getStormTrack(STORM_ID), StormProviderError);
    });

    await context.test("missing dates", async () => {
        const repository = createRepository(async () => {
            return new Response(JSON.stringify({
                type: "Feature",
                geometry: { type: "Point", coordinates: [124.8, 27] },
                properties: { eventname: "DOLPHIN-26" },
            }), { status: 200 });
        });

        await assert.rejects(repository.getStormTrack(STORM_ID), StormProviderError);
    });

    await context.test("unusable position", async () => {
        const repository = createRepository(async () => {
            return new Response(JSON.stringify({
                type: "Feature",
                geometry: { type: "Point", coordinates: [400, 27] },
                properties: {
                    eventname: "DOLPHIN-26",
                    fromdate: "2026-07-27T00:00:00",
                    todate: "2026-08-08T12:00:00",
                },
            }), { status: 200 });
        });

        await assert.rejects(repository.getHistoricalStormTrack(STORM_ID), StormProviderError);
    });
});

test("GDACS storm repository maps event data upstream failures to provider errors", async () => {
    const repository = createRepository(async () => new Response(null, { status: 502 }));

    await assert.rejects(repository.getStormTrack(STORM_ID), StormProviderError);
});

function createRepository (fetcher: typeof fetch): GdacsStormRepository {
    return new GdacsStormRepository(EVENT_LIST_URL, EVENT_DATA_URL, GEOMETRY_URL, fetcher);
}

async function createEventRepository (requestedUrls: string[] = []): Promise<GdacsStormRepository> {
    const [eventData, geometry] = await Promise.all([
        readFixture("tc-event-data.json"),
        readFixture("tc-track-geometry.json"),
    ]);

    return createRepository(async (input) => {
        const url = String(input);

        requestedUrls.push(url);

        if (url.startsWith(EVENT_DATA_URL)) {
            return new Response(eventData, { status: 200 });
        }

        return new Response(geometry, { status: 200 });
    });
}

function readFixture (name: string): Promise<string> {
    return readFile(new URL("./fixtures/gdacs/" + name, import.meta.url), "utf-8");
}
