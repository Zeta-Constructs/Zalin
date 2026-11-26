<!-- markdownlint-disable MD033 -->
<!-- markdownlint-disable MD041 -->

<div align="center">
  <h1>Zalin</h1>
  <p>Impromptu Tunneling Service</p>
  <p>Created by <strong>Cxrn_45</strong> at <strong>Zeta Constructs</strong></p>

  <p>
    <a href="https://bun.com">
      <img src="https://img.shields.io/badge/Runtime-Bun-fbf0df?logo=bun&logoColor=black" alt="Built with Bun" />
    </a>
    <a href="https://www.typescriptlang.org/">
      <img src="https://img.shields.io/badge/Language-TypeScript-3178c6?logo=typescript&logoColor=white" alt="Written in TypeScript" />
    </a>
    <a href="./LICENSE">
      <img src="https://img.shields.io/badge/License-MIT-informational" alt="MIT License" />
    </a>
  </p>
</div>

<br/>

## Quick Start
```bash
bun install
bun start
```
On startup, Zalin generates a fresh per-instance Bearer token and logs it once:
```text
Config: Instance secret: <64-hex-token>
```
Optional environment variables:
| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `7000` | Port to listen on |
| `BASE_DOMAIN` | `localhost` | domain for control API & tunnel routing |

---
## How Routing Works
- **Apex domain** (`<BASE_DOMAIN>`) handles management routes (`/v1/status`, `/v1/tunnels`) and worker WebSockets.
- **Tunnel subdomains** (`<slug>.<BASE_DOMAIN>`) are intercepted by the gateway and proxied over the tunnel's WebSocket (`10 MiB` max request/response body, `120 req/10s` per-IP rate limit). Subdomains cannot access `/v1/*`.
- **Nested or unrecognized hosts** (e.g. `a.b.<BASE_DOMAIN>`) are rejected with `400`.
---
## Endpoints
Management endpoints (and `/v1/status/metrics`) require:
```http
Authorization: Bearer <InstanceSecret>
```
### Status
| Method & Path | Auth | Description |
| :--- | :--- | :--- |
| `GET /v1/status` | None | Public health & build info (`Status`, `Version`, `Commit`, `BuiltAt`, `UptimeSeconds`) |
| `GET /v1/status/metrics` | Bearer | Aggregate tunnel stats (`Active`, `ConnectedWorkers`, `PendingRequests`) and `MemoryRssMB` |
### Tunnels
| Method & Path | Auth | Description |
| :--- | :--- | :--- |
| `POST /v1/tunnels` | Bearer | Create a tunnel and receive `ID`, `Subdomain`, `Url`, `FixedEnabled`, and `WorkerSecret` |
| `WS /v1/tunnels/:id/connect` | `x-tunnel-secret` | Attach a worker WebSocket (`101` on success, `403` bad secret, `409` already connected) |
| `POST /v1/tunnels/:id/rotate` | Bearer | Generate a new random `Subdomain` (sets `FixedEnabled: false`) without disconnecting the worker |
| `PATCH /v1/tunnels/:id` | Bearer | Toggle `FixedEnabled` or update/clear `AccessToken` (`null` removes it) |
| `DELETE /v1/tunnels/:id` | Bearer | Revoke the tunnel (`204`), close the active worker socket, and fail pending requests (`502`) |
#### `POST /v1/tunnels` Body (Optional)
```json
{
  "FixedAlias": "myapp",
  "FixedEnabled": true,
  "AccessToken": "my-edge-token"
}
```
- **`FixedAlias`** (lowercase alphanumeric + hyphens, no dots): Reserves a custom `<alias>.<BASE_DOMAIN>` slug. When `FixedEnabled` is `true` (default when `FixedAlias` is provided), it replaces the random ephemeral `Subdomain`. Toggling `FixedEnabled` to `false` switches back to the random subdomain while keeping `FixedAlias` reserved until deleted.
- **`AccessToken`** (`8–256` chars): Optional edge gate. Visitors hitting the tunnel subdomain must pass `x-tunnel-auth: <AccessToken>` or get `403` before hitting the worker.
