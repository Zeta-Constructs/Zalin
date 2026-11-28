/*

    services/tunnel/types.ts
    types & interfaces for tunnel sessions, lifecycle & worker protocol

*/

// sockets & server

export interface TunnelSocket {
    readonly id: string;
    readonly readyState: number;
    send: (Data: string) => unknown;
    close: (Code?: number, Reason?: string) => void;
}

export interface ProxyWebSocket {
    readonly readyState: number;
    sendText: (Data: string) => unknown;
    sendBinary: (Data: Uint8Array | ArrayBuffer) => unknown;
    close: (Code?: number, Reason?: string) => void;
}

export interface UpgradeServer {
    upgrade: <T = unknown>(
        Req: Request,
        Options: {
            headers?: Record<string, string>;
            data: T;
        }
    ) => boolean;
}

// session & pending state

export interface PendingRequest {
    Resolve: (Res: Response) => void;
    Timer: ReturnType<typeof setTimeout>;
}

export interface PendingWsOpen {
    Resolve: (Result: { Opened: boolean; Protocol?: string; Status?: number; Reason?: string }) => void;
    Timer: ReturnType<typeof setTimeout>;
}

export interface WsStreamEntry {
    Socket?: ProxyWebSocket;
    Queued: Array<{ Binary: boolean; Data: string | Buffer }>;
    PendingClose?: { Code?: number; Reason?: string };
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
    PendingWs: Map<string, PendingWsOpen>;
    WsStreams: Map<string, WsStreamEntry>;
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

// stats

export interface TunnelStats {
    Active: number;
    ConnectedWorkers: number;
    PendingRequests: number;
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

export interface TunnelWsOpenFrame {
    Type: "ws-open";
    StreamID: string;
    Path: string;
    Headers: [string, string][];
}

export interface TunnelWsOpenedFrame {
    Type: "ws-opened";
    StreamID: string;
    Protocol?: string;
}

export interface TunnelWsDataFrame {
    Type: "ws-data";
    StreamID: string;
    DataBase64: string;
    Binary: boolean;
}

export interface TunnelWsCloseFrame {
    Type: "ws-close";
    StreamID: string;
    Code?: number;
    Reason?: string;
    Status?: number;
}

export interface TunnelPingFrame {
    Type: "ping";
}

export type TunnelOutboundFrame =
    | TunnelRequestFrame
    | TunnelWsOpenFrame
    | TunnelWsDataFrame
    | TunnelWsCloseFrame;

export type TunnelInboundFrame =
    | TunnelResponseFrame
    | TunnelWsOpenedFrame
    | TunnelWsDataFrame
    | TunnelWsCloseFrame
    | TunnelPingFrame;

// end
