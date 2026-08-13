import assert from "node:assert/strict";
import test from "node:test";
import getStormArea from "../src/http/getStormArea.js";

test("maps NHC basins and geographic positions to one of the five allowed areas", () => {
    assert.equal(getStormArea({ stormId: "nhc:AL012026", lat: 20, lon: -60 }), "AO");
    assert.equal(getStormArea({ stormId: "nhc:EP012026", lat: 20, lon: -120 }), "PO");
    assert.equal(getStormArea({ stormId: "gdacs:TC:100:1", lat: -20, lon: 70 }), "IO");
    assert.equal(getStormArea({ stormId: "gdacs:TC:100:1", lat: -65, lon: 70 }), "SO");
    assert.equal(getStormArea({ stormId: "gdacs:TC:100:1", lat: 70, lon: 70 }), "AR");
});
