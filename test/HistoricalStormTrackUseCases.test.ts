import assert from "node:assert/strict";
import test from "node:test";
import HistoricalStormTrack from "../src/domain/entities/storm/HistoricalStormTrack.js";
import HistoricalStormTrackRepository from "../src/domain/repositories/storm/IHistoricalStormTrackRepository.js";
import GetHistoricalStormTrackUseCase from "../src/domain/use-cases/storm/GetHistoricalStormTrackUseCase.js";

test("Historical storm track use case returns the requested track from its repository", async () => {
    const repository = new MemoryHistoricalStormTrackRepository();
    const useCase = new GetHistoricalStormTrackUseCase(repository);

    const result = await useCase.execute({ stormId: "nhc:EP072026" });

    assert.equal(repository.requestedStormId, "nhc:EP072026");
    assert.deepEqual(result, repository.track);
});

class MemoryHistoricalStormTrackRepository implements HistoricalStormTrackRepository {
    public requestedStormId: string | null = null;
    public readonly track: HistoricalStormTrack = {
        stormId: "nhc:EP072026",
        name: "Genevieve",
        source: "nhc",
        trackKind: "best_track",
        cachedUntil: null,
        availability: "available",
        history: [{
            lat: 22.3,
            lon: -130.2,
            datetime: "2026-07-31T21:00:00.000Z",
            windSpeed: 50,
            category: null,
        }],
    };

    public async getHistoricalStormTrack (stormId: string): Promise<HistoricalStormTrack> {
        this.requestedStormId = stormId;

        return this.track;
    }
}
