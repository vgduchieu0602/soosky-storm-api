import assert from "node:assert/strict";
import test from "node:test";
import parseGdacsTrackGeometry from "../src/adapters/gdacs/parseGdacsTrackGeometry.js";

test("GDACS track geometry parser keeps only timed track point features", () => {
    const points = parseGdacsTrackGeometry({
        type: "FeatureCollection",
        features: [
            trackPoint("08080000", [125.97, 26.97, 126.03, 27.03]),
            { type: "Feature", bbox: [124.8, 27, 124.8, 27], properties: { Class: "Point_Centroid" } },
            { type: "Feature", bbox: [118, 25, 128, 33], properties: { Class: "Poly_Cones" } },
            { type: "Feature", bbox: [118, 25, 128, 33], properties: { Class: "Poly_Green" } },
        ],
    }, Date.parse("2026-07-27T00:00:00.000Z"));

    assert.deepEqual(points, [
        { timestamp: Date.parse("2026-08-08T00:00:00.000Z"), datetime: "2026-08-08T00:00:00.000Z", lat: 27, lon: 126 },
    ]);
});

test("GDACS track geometry parser resolves the year of a track that crosses new year", () => {
    const points = parseGdacsTrackGeometry({
        type: "FeatureCollection",
        features: [
            trackPoint("01020600", [100.97, 9.97, 101.03, 10.03]),
            trackPoint("12290000", [104.97, 11.97, 105.03, 12.03]),
        ],
    }, Date.parse("2026-12-28T00:00:00.000Z"));

    assert.deepEqual(points.map((point) => point.datetime), [
        "2026-12-29T00:00:00.000Z",
        "2027-01-02T06:00:00.000Z",
    ]);
});

test("GDACS track geometry parser falls back to the polygon label when the key is missing", () => {
    const points = parseGdacsTrackGeometry({
        type: "FeatureCollection",
        features: [{
            type: "Feature",
            bbox: [125.17, 26.87, 125.23, 26.93],
            properties: { Class: "Point_Polygon_Point_49", polygonlabel: "08/08 06:00 UTC" },
        }],
    }, Date.parse("2026-07-27T00:00:00.000Z"));

    assert.deepEqual(points.map((point) => point.datetime), ["2026-08-08T06:00:00.000Z"]);
});

test("GDACS track geometry parser reads a position from the polygon when no bounding box exists", () => {
    const points = parseGdacsTrackGeometry({
        type: "FeatureCollection",
        features: [{
            type: "Feature",
            geometry: {
                type: "Polygon",
                coordinates: [[[124.77, 27], [124.8, 27.03], [124.83, 27], [124.8, 26.97], [124.77, 27]]],
            },
            properties: { Class: "Point_Polygon_Point_50", key: "08081200" },
        }],
    }, Date.parse("2026-07-27T00:00:00.000Z"));

    assert.deepEqual(points, [
        { timestamp: Date.parse("2026-08-08T12:00:00.000Z"), datetime: "2026-08-08T12:00:00.000Z", lat: 27, lon: 124.8 },
    ]);
});

test("GDACS track geometry parser drops points with an unusable stamp or position", () => {
    const points = parseGdacsTrackGeometry({
        type: "FeatureCollection",
        features: [
            trackPoint("13010000", [100.97, 9.97, 101.03, 10.03]),
            trackPoint("08320000", [100.97, 9.97, 101.03, 10.03]),
            trackPoint("08080000", [400, 9.97, 401, 10.03]),
            { type: "Feature", properties: { Class: "Point_Polygon_Point_1", key: "08080000" } },
        ],
    }, Date.parse("2026-07-27T00:00:00.000Z"));

    assert.deepEqual(points, []);
});

test("GDACS track geometry parser tolerates a response that is not a FeatureCollection", () => {
    assert.deepEqual(parseGdacsTrackGeometry(null, Date.parse("2026-07-27T00:00:00.000Z")), []);
    assert.deepEqual(parseGdacsTrackGeometry({ type: "Feature" }, Date.parse("2026-07-27T00:00:00.000Z")), []);
});

function trackPoint (key: string, bbox: number[]): Record<string, unknown> {
    return {
        type: "Feature",
        bbox,
        properties: {
            Class: "Point_Polygon_Point_" + key,
            featuretype: "PointRadii",
            key,
        },
    };
}
