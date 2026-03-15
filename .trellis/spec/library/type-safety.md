# Type Safety

> Type patterns, runtime validation, and error handling.

---

## Protocol Types

All protocol messages are strictly typed in `packages/shared/src/protocol.ts`. Each message type has a dedicated TypeScript interface with a discriminated union on the `type` field.

```typescript
// Example: All messages extend a base with 'type' discriminant
interface HandshakeInitMessage {
  type: 'HANDSHAKE_INIT';
  version: string;
  timestamp: number;
}
```

---

## Type Guards

Runtime type guards in `packages/shared/src/guards.ts` validate incoming messages:

- `isHandshakeInit(msg)`, `isAck1(msg)`, `isAck2(msg)`, `isReady(msg)`
- `isActionCall(msg)`, `isActionResult(msg)`
- `isPeerMessage(msg)`, `isBroadcast(msg)`, `isPeerListRequest(msg)`, etc.

**Rule**: Always validate incoming postMessage data with type guards before processing.

---

## Schema Converters

`packages/shared/src/schema.ts` provides converters for transforming between internal and external data representations.

---

## Error Handling

Custom `BridgeError` class in `packages/shared/src/errors.ts` with typed error codes:

- `NOT_CONNECTED` — Operation requires connected state
- `TIMEOUT` — Operation timed out
- `INVALID_MESSAGE` — Malformed message received
- `ACTION_NOT_FOUND` — Requested action not registered

---

## Forbidden Patterns

| Pattern | Why |
|---------|-----|
| `as any` | Defeats type safety entirely |
| `@ts-ignore` | Hides real type errors |
| `@ts-expect-error` | Same as above |
| Empty `catch(e) {}` | Swallows errors silently |
| `// @ts-nocheck` | Disables all checking |

**Zero tolerance** — these patterns are never acceptable in this codebase.
