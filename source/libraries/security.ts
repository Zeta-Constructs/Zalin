/*

    security.ts
    hashing, constant-time auth, client IP & host isolation helpers

*/

import type { Server } from "bun";
import { createHash, timingSafeEqual } from "crypto";

// types

export type ParsedHost =
    | { Kind: "apex" }
    | { Kind: "tunnel"; Subdomain: string }
    | { Kind: "invalid" };

// variables

const LoopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

// helpers

export function Sha256(Value: string): Buffer {
    return createHash("sha256").update(Value, "utf8").digest();
}

export function SafeEqual(A: Buffer, B: Buffer): boolean {
    const SameLength = A.length === B.length;
    // Compare B against itself when lengths differ so timingSafeEqual always runs
    // Thank you Ceat!
    const Match = timingSafeEqual(SameLength ? A : B, B);
    return Match && SameLength;
}

export function VerifyBearer(Req: Request, ExpectedHash: Buffer): boolean {
    const Auth = Req.headers.get("authorization");
    if (!Auth?.startsWith("Bearer ")) return false;

    const Token = Auth.slice(7).trim();
    return SafeEqual(Sha256(Token), ExpectedHash) && Token.length > 0;
}

export function ParseSubdomain(Req: Request, BaseDomain: string): ParsedHost {
    let Raw = Req.headers.get("host");
    if (!Raw) {
        try {
            Raw = new URL(Req.url).host;
        } catch {
            return { Kind: "invalid" };
        }
    }
    if (!Raw) return { Kind: "invalid" };

    const Host = (Raw.startsWith("[")
        ? Raw.slice(0, Raw.indexOf("]") + 1)
        : (Raw.split(":")[0] ?? "")
    ).replace(/\.$/, "").toLowerCase();

    if (!Host) return { Kind: "invalid" };

    if (Host === BaseDomain || LoopbackHosts.has(Host)) {
        return { Kind: "apex" };
    }

    const Suffix = `.${BaseDomain}`;
    if (!Host.endsWith(Suffix)) {
        return { Kind: "invalid" };
    }

    const Sub = Host.slice(0, Host.length - Suffix.length);

    if (!Sub || Sub.includes(".")) {
        return { Kind: "invalid" };
    }

    return { Kind: "tunnel", Subdomain: Sub };
}

export function GetClientIp(
    Req: Request,
    Srv: { requestIP: Server<unknown>["requestIP"] } | null
): string {
    return Srv?.requestIP(Req)?.address ?? "unknown";
}

// end
