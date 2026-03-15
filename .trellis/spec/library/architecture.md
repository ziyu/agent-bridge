# Architecture

> Monorepo structure, build system, and communication model.

---

## Monorepo Structure

```
packages/
├── shared/   # @agent_bridge/shared (private, NOT published)
│             # Protocol types, guards, schema converters, errors, constants
├── client/   # @agent_bridge/client (published)
│             # BridgeClient, OfflineQueue, ClientTransport
│             # Builds: CJS + ESM + IIFE
└── host/     # @agent_bridge/host (published)
              # AgentBridgeHost, Connection, HostTransport
              # IframeSandbox, InlineSandbox
              # Bundles shared internally, inlines client IIFE
```

---

## Build System

- **Tool**: tsup (esbuild-based)
- **Client**: Builds CJS, ESM, and IIFE formats
- **Host**: Bundles `@agent_bridge/shared` via `noExternal` config; inlines client IIFE at build time via `define: { __CLIENT_BUNDLE__: ... }`

### Build Order (CRITICAL)

```bash
pnpm -r build   # Builds in dependency order: shared → client → host
```

**Host MUST be rebuilt AFTER client** — the client IIFE bundle gets embedded into the host package at build time. If you change client code, you must rebuild both.

---

## Mount Modes

### Iframe Mode
- Guest runs in a cross-origin `<iframe>` with `srcdoc`
- **No `sandbox` attribute** — relies on cross-origin isolation for security
- Host injects the client IIFE bundle into the iframe's HTML
- Communication via `window.postMessage` across frame boundary

### Inline Mode (Code Injection)
- Guest code runs in the same window context
- Uses `MessageChannel` for isolated communication
- Host creates a `MessagePort` pair, passes one to guest

---

## Communication Topology

### Host-Client (v0.1)
```
Host ←→ Client    (1:1 per connection, postMessage/MessageChannel)
```

### Peer Communication (v0.2)
```
        ┌── Client A
Host ◄──┼── Client B    (Star topology, all peer messages routed through Host)
        └── Client C
```

All peer messages are routed through the Host — clients never communicate directly. This simplifies security and allows the Host to enforce access control.
