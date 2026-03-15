# Journal - ziyu (Part 1)

> AI development session journal
> Started: 2026-03-14

---



## Session 1: Verify and fix Example 04 peer communication demo

**Date**: 2026-03-15
**Task**: Verify and fix Example 04 peer communication demo

### Summary

(Add summary)

### Main Changes

Browser-verified all Example 04 features via Playwright, then committed the fix.

| Verification | Result |
|---|---|
| 3-client connection (Alice, Bob, Charlie) | ✅ All connected |
| Query Peers (Alice → Bob,Charlie; Bob → Alice,Charlie) | ✅ Working |
| Direct message (Alice → Bob) | ✅ Delivered (verified prior session) |
| Broadcast (Alice → all) | ✅ Delivered (verified prior session) |
| Mount 4th Client (Diana) | ✅ Connected, all peers notified |
| Unmount Last Client (Diana) | ✅ Removed, all peers notified of disconnect |
| 48/48 unit tests | ✅ Passing |

**Bugs fixed** (from prior session, committed this session):
- `<\/script>` double-escaping in srcdoc template — used `${'<'}/script>` expression
- Cross-origin iframe access — implemented `__demo_cmd__` / `__demo_resp__` postMessage protocol

**Changed files**:
- `examples/04-peer-communication/index.html`


### Git Commits

| Hash | Message |
|------|---------|
| `24336f6` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete
