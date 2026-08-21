import AlertDeliveryRepository from "../../domain/repositories/alert/IAlertDeliveryRepository.js";
import { AlertDeliveryModel } from "./models.js";
import {
    DeliveryCollection,
    isDuplicateKeyError,
    isMongoConnected,
    runMongoOperation,
} from "./runMongoOperation.js";

export { MongoAlertDeliveryRepository as default };

class MongoAlertDeliveryRepository implements AlertDeliveryRepository {
    public constructor (
        private readonly _deliveries: DeliveryCollection = AlertDeliveryModel,
        private readonly _isConnected: () => boolean = isMongoConnected,
    ) {}

    /** The unique index is what makes this safe: only one caller can claim a pair. */
    public async claimDelivery (deviceToken: string, alertKey: string): Promise<boolean> {
        const filter = { deviceToken, alertKey };

        try {
            const result = await runMongoOperation(
                () => this._deliveries.updateOne(
                    filter,
                    { $setOnInsert: { ...filter, stormId: alertKey.split("|")[0] ?? alertKey } },
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

    public async removeDeliveries (stormId: string): Promise<void> {
        await runMongoOperation(() => this._deliveries.deleteMany({ stormId }), this._isConnected);
    }
}
