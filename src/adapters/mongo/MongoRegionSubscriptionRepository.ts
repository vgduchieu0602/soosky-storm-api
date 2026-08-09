import RegionSubscription from "../../domain/entities/RegionSubscription.js";
import RegionSubscriptionRepository from "../../domain/repositories/IRegionSubscriptionRepository.js";
import { RegionSubscriptionModel } from "./models.js";
import { StateCollection, isMongoConnected, runMongoOperation } from "./runMongoOperation.js";

export { MongoRegionSubscriptionRepository as default };

class MongoRegionSubscriptionRepository implements RegionSubscriptionRepository {
    public constructor (
        private readonly _regions: StateCollection = RegionSubscriptionModel,
        private readonly _isConnected: () => boolean = isMongoConnected,
    ) {}

    public async listRegions (): Promise<RegionSubscription[]> {
        const documents = await runMongoOperation(() => this._regions.find({}).lean(), this._isConnected);

        return documents
            .map(toRegionSubscription)
            .filter((region): region is RegionSubscription => region !== null);
    }

    /** A device follows one region, so saving replaces whatever was stored before. */
    public async saveRegion (subscription: RegionSubscription): Promise<void> {
        await runMongoOperation(
            () => this._regions.updateOne(
                { deviceToken: subscription.deviceToken },
                {
                    $set: {
                        lat: subscription.lat,
                        lon: subscription.lon,
                        radiusKm: subscription.radiusKm,
                    },
                    $setOnInsert: { deviceToken: subscription.deviceToken },
                },
                { upsert: true },
            ),
            this._isConnected,
        );
    }
}

function toRegionSubscription (document: Record<string, unknown>): RegionSubscription | null {
    const { deviceToken, lat, lon, radiusKm } = document;

    if (
        typeof deviceToken !== "string"
        || typeof lat !== "number"
        || typeof lon !== "number"
        || typeof radiusKm !== "number"
    ) {
        return null;
    }

    return { deviceToken, lat, lon, radiusKm };
}
