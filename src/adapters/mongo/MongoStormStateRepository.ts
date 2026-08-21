import StormState from "../../domain/entities/alert/StormState.js";
import StormStateRepository from "../../domain/repositories/alert/IStormStateRepository.js";
import { StormStateModel } from "./models.js";
import { StateCollection, isMongoConnected, runMongoOperation } from "./runMongoOperation.js";

export { MongoStormStateRepository as default };

class MongoStormStateRepository implements StormStateRepository {
    public constructor (
        private readonly _states: StateCollection = StormStateModel,
        private readonly _isConnected: () => boolean = isMongoConnected,
    ) {}

    public async listStates (): Promise<StormState[]> {
        const documents = await runMongoOperation(() => this._states.find({}).lean(), this._isConnected);

        return documents.map(toStormState);
    }

    public async saveState (state: StormState): Promise<void> {
        await runMongoOperation(
            () => this._states.updateOne({ trackingId: state.trackingId }, { $set: state }, { upsert: true }),
            this._isConnected,
        );
    }

    public async removeState (trackingId: string): Promise<void> {
        await runMongoOperation(() => this._states.deleteOne({ trackingId }), this._isConnected);
    }
}

function toStormState (document: Record<string, unknown>): StormState {
    return {
        trackingId: String(document.trackingId ?? document.stormId),
        stormId: String(document.stormId),
        name: String(document.name),
        lat: Number(document.lat),
        lon: Number(document.lon),
        windSpeed: typeof document.windSpeed === "number" ? document.windSpeed : null,
        category: isStormCategory(document.category) ? document.category : null,
        alertLevel: typeof document.alertLevel === "string" ? document.alertLevel : null,
        watchWarning: typeof document.watchWarning === "string" ? document.watchWarning : null,
        bearing: typeof document.bearing === "number" ? document.bearing : null,
        // Rows written before this field existed have none; the next cycle fills it in.
        datetime: typeof document.datetime === "string" ? document.datetime : null,
    };
}

function isStormCategory (value: unknown): value is NonNullable<StormState["category"]> {
    return value === "category_1"
        || value === "category_2"
        || value === "category_3"
        || value === "category_4"
        || value === "category_5";
}
