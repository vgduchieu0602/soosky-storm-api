import { connect, constants } from "node:http2";

export { createApnsHttp2Transport as default };
export type { ApnsRequest, ApnsResponse, ApnsTransport };

interface ApnsRequest {
    origin: string;
    path: string;
    headers: Record<string, string>;
    body: string;
}

interface ApnsResponse {
    status: number;
    body: string;
}

type ApnsTransport = (request: ApnsRequest) => Promise<ApnsResponse>;

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * APNs only speaks HTTP/2, which the global fetch does not provide, so the
 * transport is built on node:http2. One short-lived session per request keeps
 * this phase small; connection pooling is not needed at this volume.
 */
function createApnsHttp2Transport (): ApnsTransport {
    return (request) => new Promise<ApnsResponse>((resolve, reject) => {
        const session = connect(request.origin);
        let settled = false;

        const settle = (finish: () => void): void => {
            if (settled) {
                return;
            }

            settled = true;
            session.close();
            finish();
        };

        session.once("error", (error) => {
            settle(() => reject(error));
        });

        const stream = session.request({
            ...request.headers,
            [constants.HTTP2_HEADER_METHOD]: "POST",
            [constants.HTTP2_HEADER_PATH]: request.path,
        });

        stream.setTimeout(REQUEST_TIMEOUT_MS, () => {
            stream.close();
            settle(() => reject(new Error("APNs request timed out.")));
        });

        let status = 0;
        let body = "";

        stream.on("response", (headers) => {
            status = Number(headers[constants.HTTP2_HEADER_STATUS]) || 0;
        });
        stream.setEncoding("utf-8");
        stream.on("data", (chunk: string) => {
            body += chunk;
        });
        stream.once("error", (error) => {
            settle(() => reject(error));
        });
        stream.once("end", () => {
            settle(() => resolve({ status, body }));
        });

        stream.end(request.body);
    });
}
