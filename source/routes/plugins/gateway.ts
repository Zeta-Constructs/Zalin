/*

    plugins/gateway.ts
    per-IP rate limiting & subdomain request isolation

*/

import Elysia from "elysia";

import { Config } from "@/libraries/config";
import { GetClientIp, ParseSubdomain } from "@/libraries/security";

import { TunnelService } from "@/services/tunnel";

// types

interface RateBucket {
    Count: number;
    ResetAt: number;
}

// limits

const RateLimitMax = 120;
const RateLimitWindowMs = 10_000;
const Buckets = new Map<string, RateBucket>();

function AllowIp(Ip: string): boolean {
    const Now = Date.now();
    let Bucket = Buckets.get(Ip);

    if (!Bucket || Now >= Bucket.ResetAt) {
        if (Bucket) {
            Buckets.delete(Ip);
        } else if (Buckets.size >= 10_000) {
            const Oldest = Buckets.keys().next().value;
            if (Oldest !== undefined) Buckets.delete(Oldest);
        }

        Bucket = { Count: 0, ResetAt: Now + RateLimitWindowMs };
        Buckets.set(Ip, Bucket);
    }

    Bucket.Count++;
    return Bucket.Count <= RateLimitMax;
}

// plugin

export const Gateway = new Elysia({ name: "zalin.gateway" })
    .onRequest(({ request, server }) => {
        const ClientIp = GetClientIp(request, server);
        if (!AllowIp(ClientIp)) {
            return new Response("Too Many Requests", { status: 429 });
        }

        const Host = ParseSubdomain(request, Config.BaseDomain);

        switch (Host.Kind) {
            case "invalid":
                return new Response("Invalid Tunnel Host", { status: 400 });

            case "apex":
                return;

            case "tunnel": {
                const Session = TunnelService.LookupByHost(Host.Subdomain);
                if (!Session) return new Response("Tunnel Not Found", { status: 404 });

                return TunnelService.ForwardHttp(request, Session, ClientIp);
            }
        }
    });

// end
