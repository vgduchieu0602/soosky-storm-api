import assert from "node:assert/strict";
import { AddressInfo } from "node:net";
import { Http2Server, createServer } from "node:http2";
import test from "node:test";
import createApnsHttp2Transport from "../src/adapters/apns/createApnsHttp2Transport.js";

interface ReceivedRequest {
    method: string;
    path: string;
    topic: string;
    authorization: string;
    body: string;
}

test("APNs HTTP/2 transport sends the request and reads the response", async (context) => {
    const received: ReceivedRequest[] = [];
    const { server, origin } = await startServer(received, (stream) => {
        stream.respond({ ":status": 200 });
        stream.end();
    });

    context.after(() => closeServer(server));

    const response = await createApnsHttp2Transport()({
        origin,
        path: "/3/device/abc",
        headers: {
            authorization: "bearer token-value",
            "apns-topic": "com.soosky.storm",
            "content-type": "application/json",
        },
        body: JSON.stringify({ aps: { alert: { title: "t", body: "d" }, sound: "default" } }),
    });

    assert.deepEqual(response, { status: 200, body: "" });
    assert.equal(received.length, 1);
    assert.equal(received[0]?.method, "POST");
    assert.equal(received[0]?.path, "/3/device/abc");
    assert.equal(received[0]?.topic, "com.soosky.storm");
    assert.equal(received[0]?.authorization, "bearer token-value");
    assert.deepEqual(JSON.parse(received[0]?.body ?? "{}"), {
        aps: { alert: { title: "t", body: "d" }, sound: "default" },
    });
});

test("APNs HTTP/2 transport returns the status and body of a rejection", async (context) => {
    const { server, origin } = await startServer([], (stream) => {
        stream.respond({ ":status": 410 });
        stream.end(JSON.stringify({ reason: "Unregistered" }));
    });

    context.after(() => closeServer(server));

    const response = await createApnsHttp2Transport()({
        origin,
        path: "/3/device/abc",
        headers: {},
        body: "{}",
    });

    assert.equal(response.status, 410);
    assert.deepEqual(JSON.parse(response.body), { reason: "Unregistered" });
});

test("APNs HTTP/2 transport rejects when the connection cannot be made", async () => {
    await assert.rejects(createApnsHttp2Transport()({
        origin: "http://127.0.0.1:1",
        path: "/3/device/abc",
        headers: {},
        body: "{}",
    }));
});

async function startServer (
    received: ReceivedRequest[],
    respond: (stream: import("node:http2").ServerHttp2Stream) => void,
): Promise<{ server: Http2Server; origin: string }> {
    const server = createServer();

    server.on("stream", (stream, headers) => {
        let body = "";

        stream.setEncoding("utf-8");
        stream.on("data", (chunk: string) => {
            body += chunk;
        });
        stream.once("end", () => {
            received.push({
                method: String(headers[":method"]),
                path: String(headers[":path"]),
                topic: String(headers["apns-topic"]),
                authorization: String(headers.authorization),
                body,
            });
            respond(stream);
        });
    });

    await new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", resolve);
    });

    const address = server.address() as AddressInfo;

    return { server, origin: "http://127.0.0.1:" + address.port };
}

function closeServer (server: Http2Server): Promise<void> {
    return new Promise((resolve) => {
        server.close(() => resolve());
    });
}
