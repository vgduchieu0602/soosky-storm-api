import { createSign } from "node:crypto";

export { signApnsJwt as default };
export type { ApnsJwtCredentials };

interface ApnsJwtCredentials {
    teamId: string;
    keyId: string;
    privateKey: string;
}

/**
 * APNs provider tokens are ES256 JWTs. Node signs ECDSA in DER by default, while
 * JWS requires the raw r||s pair, hence `dsaEncoding: "ieee-p1363"`.
 */
function signApnsJwt (credentials: ApnsJwtCredentials, issuedAtSeconds: number): string {
    const header = toBase64Url(JSON.stringify({
        alg: "ES256",
        kid: credentials.keyId,
        typ: "JWT",
    }));
    const payload = toBase64Url(JSON.stringify({
        iss: credentials.teamId,
        iat: issuedAtSeconds,
    }));
    const signingInput = header + "." + payload;
    const signature = createSign("SHA256")
        .update(signingInput)
        .sign({ key: credentials.privateKey, dsaEncoding: "ieee-p1363" });

    return signingInput + "." + signature.toString("base64url");
}

function toBase64Url (value: string): string {
    return Buffer.from(value, "utf-8").toString("base64url");
}
