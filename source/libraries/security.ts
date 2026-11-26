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
    return A.length === B.length && timingSafeEqual(A, B);
}

export function VerifyBearer(Req: Request, ExpectedHash: Buffer): boolean {
    const Auth = Req.headers.get("authorization");
    if (!Auth?.startsWith("Bearer ")) return false;

    const Token = Auth.slice(7).trim();
    return Token.length > 0 && SafeEqual(Sha256(Token), ExpectedHash);
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
    // Reject empty or nested subdomains to prevent host confusion
    if (!Sub || Sub.includes(".")) {
        return { Kind: "invalid" };
    }

    return { Kind: "tunnel", Subdomain: Sub };
}

export function GetClientIp(
    Req: Request,
    Srv: { requestIP: Server<unknown>["requestIP"] } | null
): string {
    if (process.env.TRUST_PROXY === "1" || process.env.TRUST_PROXY === "true") {
        const CfIp = Req.headers.get("cf-connecting-ip")?.trim();
        if (CfIp) return CfIp;

        const Xff = Req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
        if (Xff) return Xff;
    }

    return Srv?.requestIP(Req)?.address ?? "unknown";
}

// end
