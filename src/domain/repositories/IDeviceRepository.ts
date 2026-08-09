import Device from "../entities/Device.js";

export { DeviceRepository as default };

interface DeviceRepository {
    /** Registers the token, returning false when it was already registered. */
    registerDevice (device: Device): Promise<boolean>;
}
