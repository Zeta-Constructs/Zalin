/*

    tunnels/v1/internal/model.ts
    request & response validation schemas for tunnel management endpoints

*/

import { t } from "elysia";

// fields

const TunnelID = t.String({ pattern: "^[a-f0-9]{16,32}$" });
const AliasSlug = t.String({ pattern: "^[a-z0-9](?:[a-z0-9-]{2,61}[a-z0-9])?$" });
const AccessToken = t.String({ minLength: 8, maxLength: 256 });

// model

export const TunnelModel = {
    Params: t.Object({
        id: TunnelID,
    }),

    CreateBody: t.Optional(
        t.Object({
            FixedAlias: t.Optional(AliasSlug),
            FixedEnabled: t.Optional(t.Boolean()),
            AccessToken: t.Optional(AccessToken),
        })
    ),

    UpdateBody: t.Object({
        FixedEnabled: t.Optional(t.Boolean()),
        AccessToken: t.Optional(t.Union([AccessToken, t.Null()])),
    }),

    Created: t.Object({
        ID: t.String(),
        Subdomain: t.String(),
        Url: t.String(),
        FixedEnabled: t.Boolean(),
        WorkerSecret: t.String(),
    }),

    Rotated: t.Object({
        ID: t.String(),
        Subdomain: t.String(),
        Url: t.String(),
        FixedEnabled: t.Boolean(),
    }),

    Updated: t.Object({
        ID: t.String(),
        Subdomain: t.String(),
        Url: t.String(),
        FixedEnabled: t.Boolean(),
        HasAccessToken: t.Boolean(),
    }),

    Error: t.Object({
        Message: t.String(),
    }),
};

// end
