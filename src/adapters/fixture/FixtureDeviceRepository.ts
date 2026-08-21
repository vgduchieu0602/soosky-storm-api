import Device from "../../domain/entities/device/Device.js";
import DeviceRepository from "../../domain/repositories/device/IDeviceRepository.js";

export { FixtureDeviceRepository as default };

/** Process-local device storage for fixture mode. It resets when the API restarts. */
class FixtureDeviceRepository implements DeviceRepository {
    private readonly _deviceTokens = new Set<string>();

    public async registerDevice (device: Device): Promise<boolean> {
        if (this._deviceTokens.has(device.deviceToken)) {
            return false;
        }

        this._deviceTokens.add(device.deviceToken);
        return true;
    }
}
