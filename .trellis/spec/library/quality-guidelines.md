# Quality Guidelines

> Code standards, constraints, and testing practices.

---

## Hard Constraints

| Constraint | Requirement |
|------------|-------------|
| Client bundle size | Zero dependencies, < 5KB gzip |
| Framework coupling | SDK must be framework-agnostic |
| Origin validation | All cross-boundary communication must validate origin |
| Host isolation | Guest apps must never access host globals |
| Iframe security | No `sandbox` attribute — rely on cross-origin isolation |

---

## Testing

- **Framework**: Vitest
- **Current**: 48 tests across 8 test files
- **Run**: `pnpm test`

### Test File Locations

```
packages/shared/src/__tests__/guards.test.ts      # 17 tests - type guards
packages/shared/src/__tests__/errors.test.ts       # 3 tests - error classes
packages/shared/src/__tests__/schema.test.ts       # 3 tests - schema converters
packages/client/src/__tests__/client.test.ts       # 4 tests - BridgeClient
packages/client/src/__tests__/queue.test.ts        # 2 tests - OfflineQueue
packages/host/src/__tests__/connection.test.ts     # 7 tests - Connection
packages/host/src/__tests__/sandbox.test.ts        # 8 tests - Sandboxes
packages/host/src/__tests__/peer-routing.test.ts   # 4 tests - Peer routing
```

---

## Build & Verify

```bash
pnpm -r build        # Build all packages (dependency order)
pnpm test            # Run all tests
pnpm run examples    # Build + serve examples on port 3000
```

---

## Code Style

- TypeScript strict mode
- No default exports (use named exports)
- Explicit return types on public API methods
- JSDoc comments on all public interfaces and methods

---

## Examples

4 working examples in `examples/`:

| Example | Description |
|---------|-------------|
| 01-basic-inline | Inline mount mode with bidirectional actions |
| 02-iframe-mode | Iframe mount with cross-origin isolation |
| 03-llm-tool-calling | LLM tool-calling integration pattern |
| 04-peer-communication | Multi-client peer messaging, broadcast, discovery |

**Rule**: All examples must be browser-verified before committing.
