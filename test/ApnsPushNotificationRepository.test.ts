import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync } from "node:crypto";
import test from "node:test";
import ApnsPushNotificationRepository, { ApnsConfig } from "../src/adapters/apns/ApnsPushNotificationRepository.js";
import { ApnsRequest, ApnsResponse } from "../src/adapters/apns/createApnsHttp2Transport.js";
import PushNotificationError from "../src/domain/errors/PushNotificationError.js";

const DEVICE_TOKEN = "a".repeat(64);
const NOTIFICATION = {
    deviceToken: DEVICE_TOKEN,
    title: "Storm Warning",
    description: "Hurricane Erin may affect your area.",
};

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const PRIVATE_KEY_PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

test("APNs repository posts only the alert payload to the sandbox host", async () => {
    const requests: ApnsRequest[] = [];
    const repository = createRepository({ requests });

    await repository.sendPushNotification(NOTIFICATION);

    const [request] = requests;

    assert.equal(requests.length, 1);
    assert.equal(request?.origin, "https://api.sandbox.push.apple.com");
    assert.equal(request?.path, "/3/device/" + DEVICE_TOKEN);
    assert.deepEqual(JSON.parse(request?.body ?? "{}"), {
        aps: {
            alert: {
                title: "Storm Warning",
                body: "Hurricane Erin may affect your area.",
            },
            sound: "default",
        },
    });
});

test("APNs repository sends the bundle ID as the topic and marks the push as an alert", async () => {
    const requests: ApnsRequest[] = [];
    const repository = createRepository({ requests });

    await repository.sendPushNotification(NOTIFICATION);

    assert.equal(requests[0]?.headers["apns-topic"], "com.soosky.storm");
    assert.equal(requests[0]?.headers["apns-push-type"], "alert");
    assert.equal(requests[0]?.headers["content-type"], "application/json");
});

test("APNs repository targets the production host when configured for production", async () => {
    const requests: ApnsRequest[] = [];
    const repository = createRepository({ requests, config: { environment: "production" } });

    await repository.sendPushNotification(NOTIFICATION);

    assert.equal(requests[0]?.origin, "https://api.push.apple.com");
});

test("APNs repository signs a verifiable ES256 provider token", async () => {
    const requests: ApnsRequest[] = [];
    const repository = createRepository({ requests, now: () => 1_786_209_711_000 });

    await repository.sendPushNotification(NOTIFICATION);

    const token = (requests[0]?.headers.authorization ?? "").replace("bearer ", "");
    const [header, payload, signature] = token.split(".");

    assert.deepEqual(JSON.parse(Buffer.from(header ?? "", "base64url").toString("utf-8")), {
        alg: "ES256",
        kid: "KEY123456",
        typ: "JWT",
    });
    assert.deepEqual(JSON.parse(Buffer.from(payload ?? "", "base64url").toString("utf-8")), {
        iss: "TEAM123456",
        iat: 1_786_209_711,
    });

    const verified = createVerify("SHA256")
        .update(header + "." + payload)
        .verify(
            { key: publicKey, dsaEncoding: "ieee-p1363" },
            Buffer.from(signature ?? "", "base64url"),
        );

    assert.equal(verified, true, "expected the provider token signature to verify");
});

test("APNs repository reuses the cached provider token and reads the key once", async () => {
    const requests: ApnsRequest[] = [];
    let now = 1_786_209_711_000;
    let keyReads = 0;
    const repository = createRepository({
        requests,
        now: () => now,
        readPrivateKey: async () => {
            keyReads += 1;
            return PRIVATE_KEY_PEM;
        },
    });

    await repository.sendPushNotification(NOTIFICATION);
    now += 2_999_999;
    await repository.sendPushNotification(NOTIFICATION);
    await repository.sendPushNotification(NOTIFICATION);

    assert.equal(keyReads, 1, "expected the .p8 key to be read once");
    assert.equal(requests.length, 3);
    assert.equal(requests[0]?.headers.authorization, requests[1]?.headers.authorization);
    assert.equal(requests[1]?.headers.authorization, requests[2]?.headers.authorization);
});

test("APNs repository renews the provider token once it ages out", async () => {
    const requests: ApnsRequest[] = [];
    let now = 1_786_209_711_000;
    const repository = createRepository({ requests, now: () => now });

    await repository.sendPushNotification(NOTIFICATION);
    now += 3_000_000;
    await repository.sendPushNotification(NOTIFICATION);

    assert.notEqual(requests[0]?.headers.authorization, requests[1]?.headers.authorization);
});

test("APNs repository reports missing configuration without calling the provider", async (context) => {
    const incompleteConfigs: Partial<ApnsConfig>[] = [
        { teamId: undefined },
        { keyId: undefined },
        { bundleId: undefined },
        { privateKeyPath: undefined },
        { teamId: "   " },
    ];

    for (const [index, config] of incompleteConfigs.entries()) {
        await context.test("configuration " + index, async () => {
            const requests: ApnsRequest[] = [];
            const repository = createRepository({ requests, config });

            await assert.rejects(
                repository.sendPushNotification(NOTIFICATION),
                (error: unknown) => error instanceof PushNotificationError && error.kind === "not_configured",
            );
            assert.equal(requests.length, 0);
        });
    }
});

test("APNs repository reports an unreadable or empty signing key as a configuration problem", async (context) => {
    await context.test("unreadable", async () => {
        const repository = createRepository({
            readPrivateKey: async () => {
                throw new Error("ENOENT: no such file");
            },
        });

        await assert.rejects(
            repository.sendPushNotification(NOTIFICATION),
            (error: unknown) => error instanceof PushNotificationError && error.kind === "not_configured",
        );
    });

    await context.test("empty", async () => {
        const repository = createRepository({ readPrivateKey: async () => "   " });

        await assert.rejects(
            repository.sendPushNotification(NOTIFICATION),
            (error: unknown) => error instanceof PushNotificationError && error.kind === "not_configured",
        );
    });

    await context.test("not a usable key", async () => {
        const repository = createRepository({ readPrivateKey: async () => "-----BEGIN PRIVATE KEY-----\nnope\n-----END PRIVATE KEY-----" });

        await assert.rejects(
            repository.sendPushNotification(NOTIFICATION),
            (error: unknown) => error instanceof PushNotificationError && error.kind === "not_configured",
        );
    });
});

test("APNs repository rejects a malformed device token before calling the provider", async (context) => {
    for (const deviceToken of ["", "   ", "not-hex-token", "abc123", "z".repeat(64), "a".repeat(300)]) {
        await context.test(JSON.stringify(deviceToken), async () => {
            const requests: ApnsRequest[] = [];
            const repository = createRepository({ requests });

            await assert.rejects(
                repository.sendPushNotification({ ...NOTIFICATION, deviceToken }),
                (error: unknown) => error instanceof PushNotificationError && error.kind === "invalid_device_token",
            );
            assert.equal(requests.length, 0);
        });
    }
});

test("APNs repository maps a rejected device token to an invalid-token error", async (context) => {
    const rejections: [number, string][] = [
        [400, JSON.stringify({ reason: "BadDeviceToken" })],
        [400, JSON.stringify({ reason: "DeviceTokenNotForTopic" })],
        [410, JSON.stringify({ reason: "Unregistered" })],
        [400, JSON.stringify({ reason: "PayloadTooLarge" })],
        [400, ""],
    ];

    for (const [status, body] of rejections) {
        await context.test(status + " " + body, async () => {
            const repository = createRepository({ response: { status, body } });

            await assert.rejects(
                repository.sendPushNotification(NOTIFICATION),
                (error: unknown) => error instanceof PushNotificationError && error.kind === "invalid_device_token",
            );
        });
    }
});

test("APNs repository treats an authentication rejection as a configuration problem and drops the token", async () => {
    const requests: ApnsRequest[] = [];
    let status = 403;
    const repository = createRepository({
        requests,
        respond: () => ({ status, body: JSON.stringify({ reason: "InvalidProviderToken" }) }),
    });

    await assert.rejects(
        repository.sendPushNotification(NOTIFICATION),
        (error: unknown) => error instanceof PushNotificationError && error.kind === "not_configured",
    );

    status = 200;
    await repository.sendPushNotification(NOTIFICATION);

    assert.notEqual(
        requests[0]?.headers.authorization,
        requests[1]?.headers.authorization,
        "expected a rejected provider token to be re-signed",
    );
});

test("APNs repository maps provider outages to a provider-unavailable error", async (context) => {
    for (const status of [429, 500, 503]) {
        await context.test(String(status), async () => {
            const repository = createRepository({ response: { status, body: JSON.stringify({ reason: "TooManyRequests" }) } });

            await assert.rejects(
                repository.sendPushNotification(NOTIFICATION),
                (error: unknown) => error instanceof PushNotificationError && error.kind === "provider_unavailable",
            );
        });
    }

    await context.test("transport failure", async () => {
        const repository = createRepository({
            respond: () => {
                throw new Error("socket hang up");
            },
        });

        await assert.rejects(
            repository.sendPushNotification(NOTIFICATION),
            (error: unknown) => error instanceof PushNotificationError && error.kind === "provider_unavailable",
        );
    });
});

test("APNs repository never leaks credentials in its error messages", async () => {
    const repository = createRepository({ response: { status: 403, body: JSON.stringify({ reason: "InvalidProviderToken" }) } });
    const error = await repository.sendPushNotification(NOTIFICATION).catch((thrown: unknown) => thrown);
    const message = error instanceof Error ? error.message : String(error);

    for (const secret of ["TEAM123456", "KEY123456", "BEGIN PRIVATE KEY", "bearer", "InvalidProviderToken"]) {
        assert.equal(message.includes(secret), false, "expected the message to omit " + secret);
    }
});

interface RepositoryOptions {
    requests?: ApnsRequest[];
    config?: Partial<ApnsConfig>;
    response?: ApnsResponse;
    respond?: () => ApnsResponse;
    now?: () => number;
    readPrivateKey?: (path: string) => Promise<string>;
}

function createRepository (options: RepositoryOptions = {}): ApnsPushNotificationRepository {
    const config: ApnsConfig = {
        teamId: "TEAM123456",
        keyId: "KEY123456",
        bundleId: "com.soosky.storm",
        privateKeyPath: "./secrets/AuthKey_TEST.p8",
        environment: "development",
        ...options.config,
    };

    return new ApnsPushNotificationRepository(
        config,
        async (request) => {
            options.requests?.push(request);

            if (options.respond) {
                return options.respond();
            }

            return options.response ?? { status: 200, body: "" };
        },
        options.now ?? (() => 1_786_209_711_000),
        options.readPrivateKey ?? (async () => PRIVATE_KEY_PEM),
    );
}
