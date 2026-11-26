/*

    status/v1/index.ts
    public health endpoint & bearer-guarded runtime metrics

*/

import Version from "@zalin/version";

import { Config } from "@/libraries/config";
import { VerifyBearer } from "@/libraries/security";

import { TunnelService } from "@/services/tunnel";

import { StatusV1 } from "@/routes/route";
import { StatusModel } from "./internal/model";

// routes

export const Status = StatusV1
    .get("/", {
        response: {
            200: StatusModel.Public,
        },
        detail: {
            summary: "Public health & build check",
            tags: ["status"]
        },
    }, () => ({
        Status: "ok" as const,
        Version: Version.version || "dev",
        Commit: Version.commit || "unknown",
        BuiltAt: Version.builtAt || "unknown",
        UptimeSeconds: Math.floor(process.uptime()),
    }))

    .get("/metrics", {
        beforeHandle({ request, status }) {
            if (!VerifyBearer(request, Config.InstanceSecretHash)) {
                return status(401, { Message: "Unauthorized" });
            }
        },
        response: {
            200: StatusModel.Metrics,
            401: StatusModel.Error,
        },
        detail: {
            summary: "Authenticated tunnel & runtime metrics",
            tags: ["status"]
        },
    }, () => ({
        Status: "ok" as const,
        UptimeSeconds: Math.floor(process.uptime()),
        Tunnels: TunnelService.GetStats(),
        MemoryRssMB: Number((process.memoryUsage.rss() / (1024 * 1024)).toFixed(2)),
    }));

// end
