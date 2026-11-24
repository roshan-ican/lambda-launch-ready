import { createHmac, timingSafeEqual } from "node:crypto";

export function verifySignature(body: string, signature: string | undefined, secret: string): boolean {
    if (!signature) {
        return false
    }
    const expected = createHmac("sha256", secret).update(body).digest("hex")
    const expectedBuffer = Buffer.from(expected, "hex")
    const signatureBuffer = Buffer.from(signature, "hex")

    if (expectedBuffer.length !== signatureBuffer.length) {
        return false
    }
    return timingSafeEqual(expectedBuffer, signatureBuffer)
}