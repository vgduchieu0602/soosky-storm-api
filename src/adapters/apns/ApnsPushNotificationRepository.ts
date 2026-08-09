import { readFile } from "node:fs/promises";
import PushNotification from "../../domain/entities/PushNotification.js";
import PushNotificationError from "../../domain/errors/PushNotificationError.js";
import PushNotificationRepository from "../../domain/repositories/IPushNotificationRepository.js";
import createApnsHttp2Transport, { ApnsTransport } from "./createApnsHttp2Transport.js";
import signApnsJwt from "./signApnsJwt.js";

export { ApnsPushNotificationRepository as default };
export type { ApnsConfig };

type ApnsEnvironment = "development" | "production";

interface ApnsConfig {
    teamId: string | undefined;
    keyId: string | undefined;
    bundleId: string | undefined;
    privateKeyPath: string | undefined;
    environment: ApnsEnvironment;
}

interface ResolvedApnsConfig {
    teamId: string;
    keyId: string;
    bundleId: string;
    privateKeyPath: string;
    environment: ApnsEnvironment;
}

interface CachedJwt {
    token: string;
    issuedAtMs: number;
}

const APNS_ORIGINS: Readonly<Record<ApnsEnvironment, string>> = {
    development: "https://api.sandbox.push.apple.com",
    production: "https://api.push.apple.com",
};

// Apple accepts a provider token for one hour and rejects refreshes made more
// often than every 20 minutes, so it is renewed comfortably inside both bounds.
const JWT_LIFETIME_MS = 3_000_000;

// Device tokens invalid on their face are rejected before spending an APNs call.
const DEVICE_TOKEN_PATTERN = /^[0-9a-fA-F]{64,200}$/;

const REJECTED_TOKEN_REASONS = new Set([
    "BadDeviceToken",
    "DeviceTokenNotForTopic",
    "Unregistered",
    "TopicDisallowed",
]);

class ApnsPushNotificationRepository implements PushNotificationRepository {
    private _privateKey: string | null = null;
    private _cachedJwt: CachedJwt | null = null;

    public constructor (
        private readonly _config: ApnsConfig,
        private readonly _transport: ApnsTransport = createApnsHttp2Transport(),
        private readonly _now: () => number = Date.now,
        private readonly _readPrivateKey: (path: string) => Promise<string> = (path) => readFile(path, "utf-8"),
    ) {}

    public async sendPushNotification (notification: PushNotification): Promise<void> {
        const config = this._resolveConfig();

        if (!DEVICE_TOKEN_PATTERN.test(notification.deviceToken)) {
            throw new PushNotificationError("The device token is not a valid APNs token.", "invalid_device_token");
        }

        const response = await this._send(config, notification);

        if (response.status === 200) {
            return;
        }

        throw this._toError(response.status, response.body);
    }

    private async _send (config: ResolvedApnsConfig, notification: PushNotification) {
        const token = await this._getJwt(config);

        try {
            return await this._transport({
                origin: APNS_ORIGINS[config.environment],
                path: "/3/device/" + notification.deviceToken,
                headers: {
                    authorization: "bearer " + token,
                    "apns-topic": config.bundleId,
                    "apns-push-type": "alert",
                    "apns-priority": "10",
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    aps: {
                        alert: {
                            title: notification.title,
                            body: notification.description,
                        },
                        sound: "default",
                    },
                }),
            });
        } catch (error) {
            throw new PushNotificationError("The APNs request could not be completed.", "provider_unavailable", {
                cause: error,
            });
        }
    }

    private async _getJwt (config: ResolvedApnsConfig): Promise<string> {
        const now = this._now();

        if (this._cachedJwt && now - this._cachedJwt.issuedAtMs < JWT_LIFETIME_MS) {
            return this._cachedJwt.token;
        }

        const privateKey = await this._getPrivateKey(config.privateKeyPath);
        let token: string;

        try {
            token = signApnsJwt({
                teamId: config.teamId,
                keyId: config.keyId,
                privateKey,
            }, Math.floor(now / 1000));
        } catch (error) {
            throw new PushNotificationError("The APNs signing key could not be used.", "not_configured", {
                cause: error,
            });
        }

        this._cachedJwt = { token, issuedAtMs: now };

        return token;
    }

    private async _getPrivateKey (privateKeyPath: string): Promise<string> {
        if (this._privateKey !== null) {
            return this._privateKey;
        }

        let privateKey: string;

        try {
            privateKey = await this._readPrivateKey(privateKeyPath);
        } catch (error) {
            throw new PushNotificationError("The APNs signing key could not be read.", "not_configured", {
                cause: error,
            });
        }

        if (!privateKey.trim()) {
            throw new PushNotificationError("The APNs signing key is empty.", "not_configured");
        }

        this._privateKey = privateKey;

        return privateKey;
    }

    private _resolveConfig (): ResolvedApnsConfig {
        const { teamId, keyId, bundleId, privateKeyPath, environment } = this._config;

        if (!teamId?.trim() || !keyId?.trim() || !bundleId?.trim() || !privateKeyPath?.trim()) {
            throw new PushNotificationError("Push notifications are not configured.", "not_configured");
        }

        return { teamId, keyId, bundleId, privateKeyPath, environment };
    }

    /**
     * The APNs reason is classified but never forwarded, so provider internals stay
     * out of the API response.
     */
    private _toError (status: number, body: string): PushNotificationError {
        const reason = readApnsReason(body);

        if (status === 403 || status === 401) {
            this._cachedJwt = null;

            return new PushNotificationError("Push notifications are not configured correctly.", "not_configured");
        }

        if (reason && REJECTED_TOKEN_REASONS.has(reason)) {
            return new PushNotificationError("APNs rejected the device token.", "invalid_device_token");
        }

        if (status === 400 || status === 410) {
            return new PushNotificationError("APNs rejected the notification.", "invalid_device_token");
        }

        return new PushNotificationError("APNs is temporarily unavailable.", "provider_unavailable");
    }
}

function readApnsReason (body: string): string | null {
    try {
        const payload: unknown = JSON.parse(body);

        if (typeof payload === "object" && payload !== null && "reason" in payload) {
            const reason = (payload as { reason: unknown }).reason;

            return typeof reason === "string" ? reason : null;
        }
    } catch {
        return null;
    }

    return null;
}
