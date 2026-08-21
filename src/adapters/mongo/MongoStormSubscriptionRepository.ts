import StormSubscription from "../../domain/entities/subscription/StormSubscription.js";
import StormSubscriptionRepository from "../../domain/repositories/subscription/IStormSubscriptionRepository.js";
import { toStormTrackingId } from "../../domain/services/stormIdentity.js";
import { StormSubscriptionModel } from "./models.js";
import {
    SubscriptionCollection,
    isDuplicateKeyError,
    isMongoConnected,
    runMongoOperation,
} from "./runMongoOperation.js";

export { MongoStormSubscriptionRepository as default };

class MongoStormSubscriptionRepository implements StormSubscriptionRepository {
    public constructor (
        private readonly _subscriptions: SubscriptionCollection = StormSubscriptionModel,
        private readonly _isConnected: () => boolean = isMongoConnected,
    ) {}

    public async subscribe (subscription: StormSubscription): Promise<boolean> {
        const filter = {
            deviceToken: subscription.deviceToken,
            stormId: subscription.stormId,
        };

        try {
            const result = await runMongoOperation(
                () => this._subscriptions.updateOne(
                    filter,
                    { $setOnInsert: { ...filter, trackingId: toStormTrackingId(subscription.stormId) } },
                    { upsert: true },
                ),
                this._isConnected,
            );

            return (result.upsertedCount ?? 0) > 0;
        } catch (error) {
            if (isDuplicateKeyError(error)) {
                return false;
            }

            throw error;
        }
    }

    public async listDeviceTokensForStorm (trackingId: string): Promise<string[]> {
        const documents = await runMongoOperation(
            () => this._subscriptions.find({ trackingId }).lean(),
            this._isConnected,
        );

        return documents
            .map((document) => document.deviceToken)
            .filter((deviceToken): deviceToken is string => typeof deviceToken === "string");
    }

    public async unsubscribe (subscription: StormSubscription): Promise<boolean> {
        const result = await runMongoOperation(
            () => this._subscriptions.deleteOne({
                deviceToken: subscription.deviceToken,
                stormId: subscription.stormId,
            }),
            this._isConnected,
        );

        return (result.deletedCount ?? 0) > 0;
    }
}
