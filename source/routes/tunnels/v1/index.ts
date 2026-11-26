/*

    tunnels/v1/index.ts
    tunnel lifecycle routes & authenticated worker websocket

*/

import { HTTPError } from "elysia";

import { Config } from "@/libraries/config";
import { VerifyBearer } from "@/libraries/security";

import { TunnelService } from "@/services/tunnel";
import { TunnelsV1 } from "@/routes/route";
import { TunnelModel } from "./internal/model";

// errors

const TunnelNotFound = HTTPError.id("TUNNEL_NOT_FOUND", 404);
const TunnelForbidden = HTTPError.id("TUNNEL_FORBIDDEN", 403);
const TunnelConflict = HTTPError.id("TUNNEL_CONFLICT", 409);

// routes

export const Tunnels = TunnelsV1
    .ws("/:id/connect", {
        params: TunnelModel.Params,

        // Authenticate once on HTTP upgrade
        upgrade({ params, request }) {
            const Code = TunnelService.AuthenticateWorker(
                params.id ?? "",
                request.headers.get("x-tunnel-secret") ?? ""
            );

            switch (Code) {
                case 404:
                    throw new TunnelNotFound("Not Found");
                case 403:
                    throw new TunnelForbidden("Forbidden");
                case 409:
                    throw new TunnelConflict("Worker already connected");
            }

            return { "x-zalin": "1" };
        },

        open(Ws) {
            if (!TunnelService.AttachWorker(Ws.params.id, Ws)) {
                Ws.close(1008, "Unknown tunnel");
            }
        },

        message(Ws, Message) {
            TunnelService.HandleWorkerMessage(Ws.params.id, Ws, Message);
        },

        close(Ws) {
            TunnelService.DetachWorker(Ws.params.id, Ws);
        },
    })
    .guard({
        beforeHandle({ request, status }) {
            if (!VerifyBearer(request, Config.InstanceSecretHash)) {
                return status(401, { Message: "Unauthorized" });
            }
        },
    }, (App) =>
        App
            .post("/", {
                body: TunnelModel.CreateBody,
                response: {
                    201: TunnelModel.Created,
                    400: TunnelModel.Error,
                    401: TunnelModel.Error,
                    503: TunnelModel.Error,
                },
                detail: { summary: "Create tunnel", tags: ["tunnels"] },
            }, ({ body, status }) => {
                try {
                    return status(201, TunnelService.Create(body ?? {}));
                } catch (Err: unknown) {
                    switch (Err instanceof Error ? Err.message : "") {
                        case "CAPACITY_EXCEEDED":
                            return status(503, { Message: "Max tunnel capacity reached" });
                        case "ALIAS_UNAVAILABLE":
                            return status(400, { Message: "FixedAlias is invalid or taken" });
                        case "NO_FIXED_ALIAS":
                            return status(400, { Message: "FixedEnabled requires a FixedAlias" });
                        default:
                            throw Err;
                    }
                }
            })
            .post("/:id/rotate", {
                params: TunnelModel.Params,
                response: {
                    200: TunnelModel.Rotated,
                    401: TunnelModel.Error,
                    404: TunnelModel.Error,
                },
                detail: {
                    summary:
                        "Rotate ephemeral subdomain", tags: ["tunnels"]
                },
            }, ({ params, status }) => {
                const Rotated = TunnelService.Rotate(params.id);
                if (!Rotated) return status(404, { Message: "Tunnel not found" });

                return status(200, Rotated);
            })
            .patch("/:id", {
                params: TunnelModel.Params,
                body: TunnelModel.UpdateBody,
                response: {
                    200: TunnelModel.Updated,
                    400: TunnelModel.Error,
                    401: TunnelModel.Error,
                    404: TunnelModel.Error,
                },
                detail: {
                    summary: "Toggle fixed alias or update access token",
                    tags: ["tunnels"]
                },
            }, ({ params, body, status }) => {
                try {
                    const Updated = TunnelService.Update(params.id, body);
                    if (!Updated) return status(404, { Message: "Tunnel not found" });

                    return status(200, Updated);
                } catch (Err: unknown) {
                    if (Err instanceof Error && Err.message === "NO_FIXED_ALIAS") {
                        return status(400, { Message: "Tunnel has no FixedAlias to enable" });
                    }
                    throw Err;
                }
            })
            .delete("/:id", {
                params: TunnelModel.Params,
                detail: {
                    summary: "Destroy tunnel",
                    tags: ["tunnels"]
                },
            }, ({ params, set, status }) => {
                if (!TunnelService.Destroy(params.id, "Tunnel revoked")) {
                    return status(404, { Message: "Tunnel not found" });
                }

                set.status = 204;
                return null;
            })
    );

// end
