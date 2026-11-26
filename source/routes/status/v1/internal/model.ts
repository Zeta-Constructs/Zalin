/*

    status/v1/internal/model.ts
    response schemas for server health & authenticated metrics endpoints

*/

import { t } from "elysia";

// model

export const StatusModel = {
    Public: t.Object({
        Status: t.Literal("ok"),
        Version: t.String(),
        Commit: t.String(),
        BuiltAt: t.String(),
        UptimeSeconds: t.Number(),
    }),

    Metrics: t.Object({
        Status: t.Literal("ok"),
        UptimeSeconds: t.Number(),
        Tunnels: t.Object({
            Active: t.Number(),
            ConnectedWorkers: t.Number(),
            PendingRequests: t.Number(),
        }),
        MemoryRssMB: t.Number(),
    }),

    Error: t.Object({
        Message: t.String(),
    }),
};

// end
