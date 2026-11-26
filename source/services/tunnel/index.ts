/*

    services/tunnel/index.ts
    tunnel registry, authenticated worker multi-plexing & request forwarding

*/

import { randomBytes } from "crypto";

import Logger from "@/libraries/logger";
import { Config } from "@/libraries/config";
import { SafeEqual, Sha256 } from "@/libraries/security";

import type {
    CreatedTunnel,
    CreateTunnelOptions,
    RotatedTunnel,
    TunnelInboundFrame,
    TunnelRequestFrame,
    TunnelSession,
    TunnelSocket,
    UpdatedTunnel,
    UpdateTunnelOptions,
} from "./types";

// logger

const TunnelLog = Logger.child({ name: "TunnelService" });

// limits & protocol defaults

const MaxBodyBytes = 10 * 1024 * 1024;
const RequestTimeoutMs = 30_000;
const MaxInFlightPerTunnel = 500;
const MaxTunnels = 1000;
const IdleDisconnectMs = 60_000;

const ReservedSubdomains = new Set(["www", "api", "admin", "status", "_zalin"]);
const HopByHopHeaders = new Set([
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "proxy-connection",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
]);

// service

export abstract class TunnelService {
    // Account for ~33% Base64 expansion on 10 MiB payloads plus headers/envelope overhead
    public static readonly MaxPayloadLength = Math.ceil((MaxBodyBytes * 4) / 3) + 262_144;

    private static ByID = new Map<string, TunnelSession>();
    private static ByHost = new Map<string, TunnelSession>();
    private static ReaperStarted = false;

    public static StartReaper(): void {
        if (this.ReaperStarted) return;
        this.ReaperStarted = true;

        setInterval(() => {
            const Now = Date.now();
            for (const Session of this.ByID.values()) {
                const Connected = Session.Socket?.readyState === 1;
                if (!Connected && Now - Session.LastDisconnectedAt > IdleDisconnectMs) {
                    TunnelLog.debug(`Reaping idle tunnel ${Session.ID}`);
                    this.Destroy(Session.ID, "Idle timeout");
                }
            }
        }, 15_000).unref();
    }

    public static LookupByHost(Subdomain: string): TunnelSession | undefined {
        return this.ByHost.get(Subdomain);
    }

    public static Create(Input: CreateTunnelOptions = {}): CreatedTunnel {
        if (this.ByID.size >= MaxTunnels) {
            throw new Error("CAPACITY_EXCEEDED");
        }

        const FixedAlias = Input.FixedAlias?.toLowerCase();
        if (Input.FixedEnabled === true && !FixedAlias) {
            throw new Error("NO_FIXED_ALIAS");
        }

        if (FixedAlias && !this.IsSlugAvailable(FixedAlias)) {
            throw new Error("ALIAS_UNAVAILABLE");
        }

        const ID = randomBytes(12).toString("hex");
        const Subdomain = this.GenerateSubdomain(FixedAlias);
        const WorkerSecret = randomBytes(32).toString("hex");
        const Now = Date.now();

        const Session: TunnelSession = {
            ID,
            Subdomain,
            FixedAlias,
            FixedEnabled: Boolean(FixedAlias) && (Input.FixedEnabled ?? true),
            WorkerSecretHash: Sha256(WorkerSecret),
            AccessTokenHash: Input.AccessToken ? Sha256(Input.AccessToken) : undefined,
            LastDisconnectedAt: Now,
            CreatedAt: Now,
            Pending: new Map(),
        };

        this.ByID.set(ID, Session);
        this.RegisterHost(Session);

        const Active = this.ActiveSubdomain(Session);

        return {
            ID,
            Subdomain: Active,
            Url: `${Config.Scheme}://${Active}.${Config.BaseDomain}`,
            FixedEnabled: Session.FixedEnabled,
            WorkerSecret,
        };
    }

    public static Rotate(ID: string): RotatedTunnel | undefined {
        const Session = this.ByID.get(ID);
        if (!Session) return undefined;

        this.UnregisterHost(Session);
        Session.Subdomain = this.GenerateSubdomain(Session.FixedAlias);
        Session.FixedEnabled = false;
        this.RegisterHost(Session);

        return {
            ID: Session.ID,
            Subdomain: Session.Subdomain,
            Url: `${Config.Scheme}://${Session.Subdomain}.${Config.BaseDomain}`,
            FixedEnabled: false,
        };
    }

    public static Update(ID: string, Patch: UpdateTunnelOptions): UpdatedTunnel | undefined {
        const Session = this.ByID.get(ID);
        if (!Session) return undefined;

        if (Patch.FixedEnabled === true && !Session.FixedAlias) {
            throw new Error("NO_FIXED_ALIAS");
        }

        this.UnregisterHost(Session);

        if (typeof Patch.FixedEnabled === "boolean") {
            Session.FixedEnabled = Patch.FixedEnabled;
        }
        if (Patch.AccessToken === null) {
            Session.AccessTokenHash = undefined;
        } else if (typeof Patch.AccessToken === "string") {
            Session.AccessTokenHash = Sha256(Patch.AccessToken);
        }

        this.RegisterHost(Session);
        const Active = this.ActiveSubdomain(Session);

        return {
            ID: Session.ID,
            Subdomain: Active,
            Url: `${Config.Scheme}://${Active}.${Config.BaseDomain}`,
            FixedEnabled: Session.FixedEnabled,
            HasAccessToken: Boolean(Session.AccessTokenHash),
        };
    }

    public static Destroy(ID: string, Reason = "Tunnel revoked"): boolean {
        const Session = this.ByID.get(ID);
        if (!Session) return false;

        this.ByID.delete(ID);
        this.UnregisterHost(Session);
        this.FailPending(Session, Reason, 502);

        try {
            Session.Socket?.close(1000, Reason);
        } catch {}
        Session.Socket = undefined;
        return true;
    }

    public static AuthenticateWorker(ID: string, Secret: string): 200 | 403 | 404 | 409 {
        const Session = this.ByID.get(ID);
        if (!Session) return 404;
        if (!Secret || !SafeEqual(Sha256(Secret), Session.WorkerSecretHash)) return 403;
        if (Session.Socket?.readyState === 1) return 409;
        return 200;
    }

    public static AttachWorker(ID: string, Socket: TunnelSocket): boolean {
        const Session = this.ByID.get(ID);
        if (!Session || Session.Socket?.readyState === 1) return false;

        Session.Socket = Socket;
        TunnelLog.info(`Worker attached to tunnel ${ID} (${this.ActiveSubdomain(Session)})`);
        return true;
    }

    public static DetachWorker(ID: string, Socket: TunnelSocket): void {
        const Session = this.ByID.get(ID);
        if (!Session || Session.Socket?.id !== Socket.id) return;

        Session.Socket = undefined;
        Session.LastDisconnectedAt = Date.now();
        this.FailPending(Session, "Tunnel offline", 502);
        TunnelLog.info(`Worker detached from tunnel ${ID}`);
    }

    public static HandleWorkerMessage(ID: string, Socket: TunnelSocket, Raw: unknown): void {
        const Session = this.ByID.get(ID);
        if (!Session || Session.Socket?.id !== Socket.id) return;

        let Frame: TunnelInboundFrame;
        try {
            if (typeof Raw === "string") {
                Frame = JSON.parse(Raw) as TunnelInboundFrame;
            } else if (Raw instanceof Uint8Array) {
                Frame = JSON.parse(Buffer.from(Raw).toString("utf8")) as TunnelInboundFrame;
            } else {
                Frame = Raw as TunnelInboundFrame;
            }
        } catch {
            return;
        }

        switch (Frame?.Type) {
            case "ping":
                Socket.send(JSON.stringify({ Type: "pong" }));
                return;

            case "res": {
                if (typeof Frame.ReqID !== "string") return;
                const Pending = Session.Pending.get(Frame.ReqID);
                if (!Pending) return;

                const HeadersOut = new Headers();
                if (Array.isArray(Frame.Headers)) {
                    for (const [K, V] of Frame.Headers) {
                        if (typeof K === "string" && typeof V === "string" && !HopByHopHeaders.has(K.toLowerCase())) {
                            try {
                                HeadersOut.append(K, V);
                            } catch {}
                        }
                    }
                }
                HeadersOut.set("x-content-type-options", "nosniff");

                const Status = Number.isInteger(Frame.Status) && Frame.Status >= 200 && Frame.Status <= 599
                    ? Frame.Status
                    : 502;
                const NullBodyStatus = Status === 204 || Status === 205 || Status === 304;
                const Body = !NullBodyStatus && Frame.BodyBase64 ? Buffer.from(Frame.BodyBase64, "base64") : null;
                if (Body) HeadersOut.delete("content-length");

                Pending.Resolve(new Response(Body, { status: Status, headers: HeadersOut }));
                return;
            }
        }
    }

    public static async ForwardHttp(Req: Request, Session: TunnelSession, ClientIp: string): Promise<Response> {
        // Optional per-tunnel edge gate before touching worker or buffering body
        if (Session.AccessTokenHash) {
            const Token = Req.headers.get("x-tunnel-auth") ?? "";
            if (!Token || !SafeEqual(Sha256(Token), Session.AccessTokenHash)) {
                return new Response(null, { status: 403 });
            }
        }

        if (Session.Socket?.readyState !== 1) {
            return new Response("Tunnel offline", { status: 503 });
        }

        if (Session.Pending.size >= MaxInFlightPerTunnel) {
            return new Response("Tunnel busy", { status: 429 });
        }

        const RawLen = Req.headers.get("content-length");
        if (RawLen !== null) {
            const Trimmed = RawLen.trim();
            if (!/^\d+$/.test(Trimmed)) {
                return new Response("Invalid Content-Length", { status: 400 });
            }
            if (Number(Trimmed) > MaxBodyBytes) {
                return new Response("Payload Too Large", { status: 413 });
            }
        }

        let BodyBase64: string | undefined;
        if (Req.body && Req.method !== "GET" && Req.method !== "HEAD") {
            let Bytes: Buffer | null;
            try {
                Bytes = await this.ReadBodyWithLimit(Req.body, MaxBodyBytes);
            } catch {
                return new Response(null, { status: Req.signal.aborted ? 499 : 400 });
            }
            if (Bytes === null) {
                return new Response("Payload Too Large", { status: 413 });
            }
            if (Bytes.byteLength > 0) {
                BodyBase64 = Bytes.toString("base64");
            }
        }

        // Re-check after awaiting request body in case worker disconnected mid-upload
        if (!this.ByID.has(Session.ID) || Session.Socket?.readyState !== 1) {
            return new Response("Tunnel offline", { status: 503 });
        }

        const ForwardHeaders: [string, string][] = [];
        for (const [K, V] of Req.headers) {
            const Lower = K.toLowerCase();
            if (HopByHopHeaders.has(Lower) || Lower === "x-tunnel-auth" || Lower === "x-forwarded-for") continue;
            ForwardHeaders.push([K, V]);
        }
        ForwardHeaders.push(["x-forwarded-for", ClientIp]);

        let Path: string;
        try {
            const Url = new URL(Req.url);
            Path = `${Url.pathname}${Url.search}`;
        } catch {
            return new Response("Bad Request", { status: 400 });
        }

        const ReqID = randomBytes(12).toString("hex");
        const Frame: TunnelRequestFrame = {
            Type: "req",
            ReqID,
            Method: Req.method,
            Path,
            Headers: ForwardHeaders,
            ...(BodyBase64 ? { BodyBase64 } : {}),
        };

        return new Promise<Response>((Resolve) => {
            const Cleanup = () => {
                clearTimeout(Timer);
                Session.Pending.delete(ReqID);
                Req.signal.removeEventListener("abort", OnAbort);
            };

            const OnAbort = () => {
                Cleanup();
                Resolve(new Response(null, { status: 499 }));
            };

            const Timer = setTimeout(() => {
                Cleanup();
                Resolve(new Response("Gateway Timeout", { status: 504 }));
            }, RequestTimeoutMs);

            Req.signal.addEventListener("abort", OnAbort, { once: true });
            Session.Pending.set(ReqID, {
                Resolve: (Res) => {
                    Cleanup();
                    Resolve(Res);
                },
                Timer,
            });

            try {
                const Sent = Session.Socket!.send(JSON.stringify(Frame));
                if (Sent === 0) {
                    Cleanup();
                    Resolve(new Response("Bad Gateway", { status: 502 }));
                }
            } catch {
                Cleanup();
                Resolve(new Response("Bad Gateway", { status: 502 }));
            }
        });
    }

    private static ActiveSubdomain(Session: TunnelSession): string {
        return Session.FixedEnabled && Session.FixedAlias
            ? Session.FixedAlias
            : Session.Subdomain;
    }

    private static IsSlugAvailable(Slug: string, Ignore?: TunnelSession): boolean {
        if (ReservedSubdomains.has(Slug)) return false;

        const Mapped = this.ByHost.get(Slug);
        if (Mapped && Mapped !== Ignore) return false;

        for (const Existing of this.ByID.values()) {
            if (Existing === Ignore) continue;
            if (Existing.Subdomain === Slug || Existing.FixedAlias === Slug) return false;
        }

        return true;
    }

    private static GenerateSubdomain(Exclude?: string): string {
        let Sub = randomBytes(8).toString("hex");
        while (Sub === Exclude || !this.IsSlugAvailable(Sub)) {
            Sub = randomBytes(8).toString("hex");
        }
        return Sub;
    }

    private static RegisterHost(Session: TunnelSession): void {
        this.ByHost.set(this.ActiveSubdomain(Session), Session);
    }

    private static UnregisterHost(Session: TunnelSession): void {
        const Active = this.ActiveSubdomain(Session);
        if (this.ByHost.get(Active) === Session) this.ByHost.delete(Active);
    }

    private static async ReadBodyWithLimit(Stream: ReadableStream<Uint8Array>, Limit: number): Promise<Buffer | null> {
        const Reader = Stream.getReader();
        const Chunks: Buffer[] = [];
        let Total = 0;

        try {
            while (true) {
                const { value, done } = await Reader.read();
                if (done) break;
                if (!value) continue;

                Total += value.byteLength;
                if (Total > Limit) {
                    await Reader.cancel().catch(() => {});
                    return null;
                }
                Chunks.push(Buffer.from(value));
            }
            return Total > 0 ? Buffer.concat(Chunks, Total) : Buffer.alloc(0);
        } finally {
            Reader.releaseLock();
        }
    }

    private static FailPending(Session: TunnelSession, Reason: string, Status: number): void {
        for (const [ReqID, Pending] of Session.Pending) {
            clearTimeout(Pending.Timer);
            Pending.Resolve(new Response(Reason, { status: Status }));
            Session.Pending.delete(ReqID);
        }
    }
}

// end
