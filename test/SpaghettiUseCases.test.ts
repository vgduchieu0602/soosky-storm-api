import assert from "node:assert/strict";
import test from "node:test";
import StormSpaghetti from "../src/domain/entities/storm/StormSpaghetti.js";
import StormNotFoundError from "../src/domain/errors/StormNotFoundError.js";
import SpaghettiRepository from "../src/domain/repositories/storm/ISpaghettiRepository.js";
import GetStormSpaghettiUseCase from "../src/application/use-cases/storm/GetStormSpaghettiUseCase.js";

test("Spaghetti use case gets the requested storm from its repository", async () => {
    const repository = new MemorySpaghettiRepository();
    const useCase = new GetStormSpaghettiUseCase(repository);

    assert.equal((await useCase.execute({ stormId: "nhc:EP072026" })).stormId, "nhc:EP072026");
    assert.deepEqual(repository.stormIds, ["nhc:EP072026"]);
});

test("Spaghetti use case rejects an empty storm ID", async () => {
    const useCase = new GetStormSpaghettiUseCase(new MemorySpaghettiRepository());

    await assert.rejects(
        useCase.execute({ stormId: " " }),
        StormNotFoundError,
    );
});

class MemorySpaghettiRepository implements SpaghettiRepository {
    public readonly stormIds: string[] = [];

    public async getStormSpaghetti (stormId: string): Promise<StormSpaghetti> {
        this.stormIds.push(stormId);

        return {
            stormId,
            source: "nhc-atcf",
            cycleTime: "2026-08-05T00:00:00.000Z",
            cachedUntil: null,
            availability: "available",
            models: [],
        };
    }
}
