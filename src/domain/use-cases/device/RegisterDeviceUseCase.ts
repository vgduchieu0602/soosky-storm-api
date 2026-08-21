import Device from "../../entities/device/Device.js";
import DeviceRepository from "../../repositories/device/IDeviceRepository.js";

export { RegisterDeviceUseCase as default };
export type { RegisterDeviceResult };

interface RegisterDeviceResult {
    registered: true;
    alreadyRegistered: boolean;
}

class RegisterDeviceUseCase {
    public constructor (private readonly _deviceRepo: DeviceRepository) {}

    public async execute (device: Device): Promise<RegisterDeviceResult> {
        const created = await this._deviceRepo.registerDevice(device);

        return {
            registered: true,
            alreadyRegistered: !created,
        };
    }
}
