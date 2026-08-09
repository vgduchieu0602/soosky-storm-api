import Device from "../../domain/entities/Device.js";
import DeviceRepository from "../../domain/repositories/IDeviceRepository.js";
import { DeviceModel } from "./models.js";
import {
    UpsertCollection,
    isDuplicateKeyError,
    isMongoConnected,
    runMongoOperation,
} from "./runMongoOperation.js";

export { MongoDeviceRepository as default };

class MongoDeviceRepository implements DeviceRepository {
    public constructor (
        private readonly _devices: UpsertCollection = DeviceModel,
        private readonly _isConnected: () => boolean = isMongoConnected,
    ) {}

    /**
     * An upsert keyed on the token makes registration idempotent; a concurrent
     * insert losing the unique index race means the device is already registered.
     */
    public async registerDevice (device: Device): Promise<boolean> {
        try {
            const result = await runMongoOperation(
                () => this._devices.updateOne(
                    { deviceToken: device.deviceToken },
                    { $setOnInsert: { deviceToken: device.deviceToken } },
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
}
