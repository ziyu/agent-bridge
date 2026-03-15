# Protocol Specification

> Message types, handshake flow, and peer communication protocol.

---

## Handshake Flow

```
Host                          Client
  │                              │
  │──── HANDSHAKE_INIT ─────────>│   Host initiates with protocol version
  │<──── ACK1 ──────────────────│   Client acknowledges
  │──── ACK2 ───────────────────>│   Host confirms (client sends capabilities here)
  │<──── READY ─────────────────│   Client is ready
  │                              │
```

---

## v0.1 Message Types

| Type | Direction | Purpose |
|------|-----------|---------|
| `HANDSHAKE_INIT` | Host → Client | Initiate connection with protocol version |
| `ACK1` | Client → Host | Client acknowledges handshake |
| `ACK2` | Host → Client | Host confirms, client includes capabilities |
| `READY` | Client → Host | Client is fully ready |
| `ACTION_CALL` | Host → Client | Invoke a registered action on client |
| `ACTION_RESULT` | Client → Host | Return action result to host |
| `CAPABILITIES_UPDATE` | Client → Host | Update registered actions post-connect |
| `ERROR` | Bidirectional | Error notification |
| `DESTROY` | Host → Client | Tear down connection |

---

## v0.2 Peer Message Types

| Type | Direction | Purpose |
|------|-----------|---------|
| `PEER_MESSAGE` | Client → Host | Send message to specific peer |
| `PEER_MESSAGE_DELIVERY` | Host → Client | Deliver peer message to target |
| `BROADCAST` | Client → Host | Broadcast message to all peers |
| `PEER_LIST_REQUEST` | Client → Host | Request list of connected peers |
| `PEER_LIST_RESPONSE` | Host → Client | Return peer list |
| `PEER_CHANGE` | Host → Client | Notify peer connect/disconnect |

### PeerInfo Interface

```typescript
interface PeerInfo {
  clientId: string;
  name?: string;
  metadata?: Record<string, unknown>;
}
```

### Delivery Model

- **Fire-and-forget**: No delivery acknowledgment
- **Sender must be connected**: All peer methods require `CONNECTED` state
- **Host routes all messages**: Clients never communicate directly
- **Auto-notification**: Host notifies all clients on peer connect/disconnect
