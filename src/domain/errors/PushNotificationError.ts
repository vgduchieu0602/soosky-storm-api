export { PushNotificationError as default };
export type { PushNotificationErrorKind };

/**
 * `invalid_device_token` is the caller's fault, `not_configured` is a deployment
 * problem, and `provider_unavailable` is APNs failing. The kind decides the HTTP
 * status; the message never carries credentials or raw provider payloads.
 */
type PushNotificationErrorKind = "invalid_device_token" | "not_configured" | "provider_unavailable";

class PushNotificationError extends Error {
    public constructor (
        message: string,
        public readonly kind: PushNotificationErrorKind,
        options?: ErrorOptions,
    ) {
        super(message, options);
        this.name = "PushNotificationError";
    }
}
