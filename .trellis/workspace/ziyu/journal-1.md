# Journal - ziyu (Part 1)

> AI development session journal
> Started: 2026-03-14

---

## Session 1: Project Bootstrap & v0.1 Core Implementation

**Date**: 2026-03-14
**Task**: v01-core-sdk

### Summary

Bootstrapped the AgentBridge SDK monorepo and implemented the complete v0.1 core: shared protocol types, client SDK, and host SDK with two mount modes.

### Main Changes

- Created monorepo with pnpm workspaces, tsup build, vitest testing
- Implemented `@agent_bridge/shared`: protocol types, type guards, schema converters, BridgeError, constants
- Implemented `@agent_bridge/client`: BridgeClient, OfflineQueue, ClientTransport, IIFE build
- Implemented `@agent_bridge/host`: AgentBridgeHost, Connection, HostTransport, IframeSandbox, InlineSandbox
- Added 39 unit tests across shared, client, and host packages

### Git Commits

| Hash | Message |
|------|---------|
| `cc9945b` | chore: initialize monorepo workspace and build configuration |
| `91851b9` | docs: add product design and implementation plan |
| `45831a7` | feat(shared): add protocol types, constants, and error definitions |
| `534becc` | feat(shared): add type guards and schema converters with tests |
| `71fe6ea` | feat(client): add bridge client with offline queue and transport |
| `0fb6012` | test(client): add client and queue unit tests |
| `b472b84` | feat(host): add host SDK with connection, transport, and sandboxes |
| `b60337f` | test(host): add connection and sandbox unit tests |

### Testing

- [OK] 39 unit tests passing

### Status

[OK] **Completed**

### Next Steps

- Create example demos
- Fix any integration issues discovered during demo creation

---

## Session 2: Examples & Bug Fixes

**Date**: 2026-03-14
**Task**: v01-core-sdk

### Summary

Created 3 example demos (basic inline, iframe mode, LLM tool-calling) and fixed multiple integration bugs discovered during testing: capabilities handshake, race conditions, and iframe sandbox issues.

### Main Changes

- Created Example 01: basic inline mode with bidirectional actions
- Created Example 02: iframe mode with cross-origin isolation
- Created Example 03: LLM tool-calling integration pattern
- Created examples landing page
- Fixed capabilities handshake: moved from ACK1 to ACK2, added CAPABILITIES_UPDATE message
- Fixed handshake race conditions and channel mismatch
- Fixed iframe sandbox: removed `sandbox` attribute, rely on cross-origin isolation
- Added serve scripts for examples

### Git Commits

| Hash | Message |
|------|---------|
| `2777258` | feat(examples): add basic inline mode demo |
| `7209a91` | feat(examples): add iframe mode demo with separate host and guest pages |
| `770a84f` | feat(examples): add LLM tool-calling integration demo |
| `ac7d16b` | fix(shared): move capabilities from ACK1 to ACK2, add CAPABILITIES_UPDATE message |
| `18970f0` | fix(client): send capabilities in ACK2 and CAPABILITIES_UPDATE on connect and post-connect registerAction |
| `8130489` | fix(host): read capabilities from ACK2 and handle CAPABILITIES_UPDATE at runtime |
| `b700357` | feat(examples): add landing page linking all demos |
| `9b5c205` | feat(examples): improve basic inline demo with inputs, state indicator, auto-mount |
| `65fd234` | feat(examples): improve iframe demo with timezone input, state indicator, live clock |
| `f954b35` | feat(examples): improve LLM demo with prompt input, format tabs, response synthesis |
| `71c945a` | chore: add serve scripts for examples |
| `37d351d` | fix: remove invalid serve config from examples script |
| `7698def` | fix: resolve handshake race conditions and channel mismatch |
| `c5a125a` | fix(iframe): remove default sandbox attribute, use cross-origin isolation |

### Testing

- [OK] All 3 examples verified working in browser
- [OK] Unit tests still passing

### Status

[OK] **Completed**

### Next Steps

- Prepare for npm publish

---

## Session 3: Publish v0.1.0

**Date**: 2026-03-14
**Task**: v01-core-sdk

### Summary

Prepared publish configuration, renamed npm scope from `@agent-bridge` to `@agent_bridge` due to org availability, and published v0.1.0 to npm. Pushed to GitHub.

### Main Changes

- Prepared v0.1.0 publish configuration (package.json files, exports, etc.)
- Renamed scope from `@agent-bridge` to `@agent_bridge` (npm org `agent-bridge` was unavailable)
- Published `@agent_bridge/client@0.1.0` and `@agent_bridge/host@0.1.0` to npm
- Added repository field to package.json
- Created GitHub repo and pushed all code

### Git Commits

| Hash | Message |
|------|---------|
| `8fe3836` | chore: prepare v0.1.0 publish configuration |
| `d256c2c` | chore: rename scope from @agent-bridge to @agent_bridge for npm org |
| `43f4952` | chore: add repository field to package.json |

### Testing

- [OK] npm packages published successfully
- [OK] GitHub push successful

### Status

[OK] **Completed**

### Next Steps

- Design multi-client peer communication for v0.2

---

## Session 4: Multi-Client Peer Communication (v0.2)

**Date**: 2026-03-15
**Task**: v02-peer-communication

### Summary

Designed and implemented star-topology peer communication. Added 6 new protocol message types, updated Host and Client with peer APIs, created Example 04 with full peer communication demo. Fixed script escaping and cross-origin iframe issues. All features browser-verified.

### Main Changes

- Designed star-topology peer communication (all messages routed through Host)
- Added 6 new protocol message types: PEER_MESSAGE, PEER_MESSAGE_DELIVERY, BROADCAST, PEER_LIST_REQUEST, PEER_LIST_RESPONSE, PEER_CHANGE
- Updated Host: `setupPeerRouting()`, `notifyPeerChange()`, `getConnectedPeers()`
- Updated Client: `sendToPeer()`, `broadcast()`, `onPeerMessage()`, `onPeerChange()`, `getPeers()`
- Added 9 new tests (48 total): 5 guard tests + 4 peer routing tests
- Created Example 04: multi-client peer communication demo (3 clients, direct messaging, broadcast, dynamic mount/unmount)
- Fixed `</script>` escaping in template literals (used `${'<'}/script>` pattern)
- Fixed cross-origin iframe access (implemented `__demo_cmd__` / `__demo_resp__` postMessage protocol)

### Git Commits

| Hash | Message |
|------|---------|
| `1251bc0` | feat: add multi-client peer communication support |
| `0438dcb` | feat: add example 04 - multi-client peer communication demo |
| `24336f6` | fix: resolve script escaping and cross-origin iframe issues in example 04 |

### Testing

- [OK] 48 unit tests passing (9 new)
- [OK] Browser-verified: connection (3 clients)
- [OK] Browser-verified: peer discovery (Query Peers)
- [OK] Browser-verified: direct message (Alice → Bob)
- [OK] Browser-verified: broadcast (Alice → all)
- [OK] Browser-verified: mount 4th client (Diana)
- [OK] Browser-verified: unmount last client

### Status

[OK] **Completed**

### Next Steps

- Bump version to 0.2.0 and publish updated packages
- Record project state in Trellis documentation
