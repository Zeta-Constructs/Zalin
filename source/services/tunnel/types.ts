/*

    services/tunnel/types.ts
    types & interfaces for tunnel sessions, lifecycle & worker protocol

*/

// socket

export interface TunnelSocket {
    readonly id: string;
    readonly readyState: number;
    send: (Data: string) => unknown;
    close: (Code?: number, Reason?: string) => void;
}

// session

export interface PendingRequest {
    Resolve: (Res: Response) => void;
    Timer: ReturnType<typeof setTimeout>;
}

export interface TunnelSession {
    ID: string;
    Subdomain: string;
    FixedAlias?: string;
    FixedEnabled: boolean;
    WorkerSecretHash: Buffer;
    AccessTokenHash?: Buffer;
    Socket?: TunnelSocket;
    LastDisconnectedAt: number;
    CreatedAt: number;
    Pending: Map<string, PendingRequest>;
}

// options

export interface CreateTunnelOptions {
    FixedAlias?: string;
    FixedEnabled?: boolean;
    AccessToken?: string;
}

export interface UpdateTunnelOptions {
    FixedEnabled?: boolean;
    AccessToken?: string | null;
}

// results

export interface CreatedTunnel {
    ID: string;
    Subdomain: string;
    Url: string;
    FixedEnabled: boolean;
    WorkerSecret: string;
}

export interface RotatedTunnel {
    ID: string;
    Subdomain: string;
    Url: string;
    FixedEnabled: boolean;
}

export interface UpdatedTunnel {
    ID: string;
    Subdomain: string;
    Url: string;
    FixedEnabled: boolean;
    HasAccessToken: boolean;
}

// worker protocol frames

export interface TunnelRequestFrame {
    Type: "req";
    ReqID: string;
    Method: string;
    Path: string;
    Headers: [string, string][];
    BodyBase64?: string;
}

export interface TunnelResponseFrame {
    Type: "res";
    ReqID: string;
    Status: number;
    Headers: [string, string][];
    BodyBase64?: string;
}

export interface TunnelPingFrame {
    Type: "ping";
}

export type TunnelInboundFrame = TunnelResponseFrame | TunnelPingFrame;

// end
