export { DEVICE_TOKEN_PATTERN, isDeviceToken };
export type { Device as default };

/** APNs device tokens are hexadecimal; 32 bytes today, with room for longer ones. */
const DEVICE_TOKEN_PATTERN = /^[0-9a-fA-F]{64,200}$/;

interface Device {
    deviceToken: string;
}

function isDeviceToken (value: unknown): value is string {
    return typeof value === "string" && DEVICE_TOKEN_PATTERN.test(value);
}
