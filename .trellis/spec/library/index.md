# Library Development Guidelines

> Best practices for developing the AgentBridge SDK.

---

## Overview

AgentBridge is a lightweight TypeScript SDK monorepo enabling host apps to mount AI-generated guest apps (via iframe or code injection) with bidirectional communication and peer-to-peer messaging.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Architecture](./architecture.md) | Monorepo structure, build system, mount modes | Filled |
| [Protocol](./protocol.md) | Message types, handshake flow, peer communication | Filled |
| [Type Safety](./type-safety.md) | Type patterns, guards, schema validation | Filled |
| [Quality Guidelines](./quality-guidelines.md) | Code standards, constraints, testing | Filled |

---

## Quick Reference

- **npm scope**: `@agent_bridge/*`
- **Published packages**: `@agent_bridge/client`, `@agent_bridge/host`
- **Private package**: `@agent_bridge/shared` (bundled into host)
- **Build**: `pnpm -r build` (client before host)
- **Test**: `pnpm test` (vitest, 48 tests)
- **Examples**: `pnpm run examples` (build + serve on port 3000)
