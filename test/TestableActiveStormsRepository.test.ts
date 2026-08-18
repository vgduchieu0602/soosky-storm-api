import { describe, expect, it, jest } from "@jest/globals";
import TestableActiveStormsRepository from "../src/adapters/storm/TestableActiveStormsRepository.js";
import StormSummary from "../src/domain/entities/StormSummary.js";
import ActiveStormsRepository from "../src/domain/repositories/IActiveStormsRepository.js";

describe("TestableActiveStormsRepository", () => {
    const mockStorm1: StormSummary = { stormId: "nhc:AL012024", name: "Alpha", category: "TS", source: "nhc", active: true };
    const mockStorm2: StormSummary = { stormId: "nhc:AL022024", name: "Beta", category: "TD", source: "nhc", active: true };
    const mockStorm3: StormSummary = { stormId: "gdacs:TC:123:456", name: "Gamma", category: "TS", source: "gdacs", active: true };

    let mockSourceRepository: ActiveStormsRepository;
    let hiddenStormIds: Set<string>;

    beforeEach(() => {
        mockSourceRepository = {
            getActiveStorms: jest.fn(async () => [mockStorm1, mockStorm2, mockStorm3]),
        };
        hiddenStormIds = new Set<string>();
    });

    it("should return all storms from source when testMode is false", async () => {
        const repo = new TestableActiveStormsRepository(mockSourceRepository, hiddenStormIds, false);
        const storms = await repo.getActiveStorms();
        expect(storms).toEqual([mockStorm1, mockStorm2, mockStorm3]);
        expect(mockSourceRepository.getActiveStorms).toHaveBeenCalledTimes(1);
    });

    it("should return all storms from source when testMode is true but no storms are hidden", async () => {
        const repo = new TestableActiveStormsRepository(mockSourceRepository, hiddenStormIds, true);
        const storms = await repo.getActiveStorms();
        expect(storms).toEqual([mockStorm1, mockStorm2, mockStorm3]);
        expect(mockSourceRepository.getActiveStorms).toHaveBeenCalledTimes(1);
    });

    it("should filter out hidden storms when testMode is true", async () => {
        const repo = new TestableActiveStormsRepository(mockSourceRepository, hiddenStormIds, true);
        repo.hideStorm(mockStorm1.stormId);
        const storms = await repo.getActiveStorms();
        expect(storms).toEqual([mockStorm2, mockStorm3]);
        expect(mockSourceRepository.getActiveStorms).toHaveBeenCalledTimes(1);
    });

    it("should correctly report if a storm is hidden", () => {
        const repo = new TestableActiveStormsRepository(mockSourceRepository, hiddenStormIds, true);
        repo.hideStorm(mockStorm2.stormId);
        expect(repo.isHidden(mockStorm1.stormId)).toBe(false);
        expect(repo.isHidden(mockStorm2.stormId)).toBe(true);
    });

    it("should clear all hidden storms", async () => {
        const repo = new TestableActiveStormsRepository(mockSourceRepository, hiddenStormIds, true);
        repo.hideStorm(mockStorm1.stormId);
        repo.hideStorm(mockStorm3.stormId);
        expect(hiddenStormIds.size).toBe(2);
        repo.clearHidden();
        expect(hiddenStormIds.size).toBe(0);
        const storms = await repo.getActiveStorms();
        expect(storms).toEqual([mockStorm1, mockStorm2, mockStorm3]);
    });

    it("should not hide storms when testMode is false, but operations still work on the set", async () => {
        const repo = new TestableActiveStormsRepository(mockSourceRepository, hiddenStormIds, false);
        repo.hideStorm(mockStorm1.stormId); // this just adds to the set
        const storms = await repo.getActiveStorms(); // but the filter isn't applied
        expect(storms).toEqual([mockStorm1, mockStorm2, mockStorm3]);
        expect(repo.isHidden(mockStorm1.stormId)).toBe(true); // the set still knows
    });
});
