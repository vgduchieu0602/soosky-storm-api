import ActiveStormsRepository from "../../domain/repositories/IActiveStormsRepository.js";
import StormSummary from "../../domain/entities/StormSummary.js";

export { TestableActiveStormsRepository as default };

/**
 * A thin wrapper around an ActiveStormsRepository that can hide specific storms
 * when STORM_ALERT_TEST_MODE is active. This allows simulating a storm
 * disappearing from the active storm source without modifying production data.
 *
 * When test mode is inactive, behavior is identical to the source repository.
 */
class TestableActiveStormsRepository implements ActiveStormsRepository {
    public constructor (
        private readonly _source: ActiveStormsRepository,
        private readonly _hiddenStormIds: Set<string>,
        private readonly _testMode: boolean,
    ) {}

    public async getActiveStorms (): Promise<StormSummary[]> {
        const storms = await this._source.getActiveStorms();

        if (!this._testMode) {
            return storms;
        }

        return storms.filter((storm) => !this._hiddenStormIds.has(storm.stormId));
    }

    /** Marks a storm as hidden (simulated dissipated) in test mode. */
    public hideStorm (stormId: string): void {
        this._hiddenStormIds.add(stormId);
    }

    /** Checks if a storm is currently hidden. */
    public isHidden (stormId: string): boolean {
        return this._hiddenStormIds.has(stormId);
    }

    /** Clears all hidden storms (useful for test cleanup). */
    public clearHidden (): void {
        this._hiddenStormIds.clear();
    }
}