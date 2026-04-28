# AgentBridge

[中文文档](./README.zh-CN.md)

Universal agent-to-agent communication protocol. Connect AI agents across browsers, Node.js, and any runtime — via postMessage, WebSocket, stdio, or in-memory transport.

## Packages

| Package | Description |
|---------|-------------|
| `@agent_bridge/protocol` | Pure protocol spec — message types, error codes, compliance levels, serialization. **Zero dependencies.** |
| `@agent_bridge/agent` | Universal peer agent — transport-agnostic `AgentBridgeAgent` for any runtime |
| `@agent_bridge/host` | Browser host SDK — mount iframe sandboxes, communicate with guest apps |
| `@agent_bridge/client` | Browser client SDK — run inside iframe, register AI-callable actions (~1.7KB gzip) |
| `@agent_bridge/transport-memory` | In‑memory transport — same‑process agent communication, ideal for testing |
| `@agent_bridge/transport-postmessage` | Browser postMessage + MessageChannel transport |
| `@agent_bridge/shared` | Convenience re‑exports + LLM tool‑format converters (OpenAI / Anthropic / Gemini) |

## Quick Start

### Universal Peer-to-Peer (no iframe, no host)

```typescript
import { AgentBridgeAgent } from '@agent_bridge/agent';
import { createMemoryTransportPair } from '@agent_bridge/transport-memory';

const [t1, t2] = createMemoryTransportPair();
const agentA = new AgentBridgeAgent({ name: 'AgentA' });
const agentB = new AgentBridgeAgent({ name: 'AgentB' });

// Register actions on B
agentB.registerAction('greet', 'Greet someone', {
  type: 'object',
  properties: { name: { type: 'string' } },
  required: ['name'],
}, (params) => ({ message: `Hello, ${params.name}!` }));

// Connect both
await Promise.all([agentA.acceptConnection(t1), agentB.acceptConnection(t2)]);

// A calls B's action
const [peer] = agentA.getPeers();
const result = await agentA.executeAction(peer.connectionId, 'greet', { name: 'World' });
// → { message: 'Hello, World!' }
```

### Browser Host + Guest

```typescript
import { AgentBridgeHost, toOpenAITool } from '@agent_bridge/host';

const host = new AgentBridgeHost();

// Inline mode — inject code into iframe srcdoc
const conn = await host.mount(
  { type: 'raw', code: guestHtmlString, codeType: 'html' },
  { container: document.getElementById('sandbox') }
);

conn.on('capabilities', (caps) => console.log(toOpenAITool(caps[0])));
const result = await host.executeAction(conn.id, 'greet', { name: 'World' });
```

```typescript
import { BridgeClient } from '@agent_bridge/client';

const client = new BridgeClient();
client.registerAction('greet', 'Greet a person', {
  type: 'object', properties: { name: { type: 'string' } }, required: ['name'],
}, (params) => ({ message: `Hello, ${params.name}!` }));

await client.initialize();
client.notifyHost('ready', { timestamp: Date.now() });
```

### Peer Communication

```typescript
client.sendToPeer(targetConnectionId, 'chat', { text: 'Hello!' });
client.broadcast('update', { round: 2 });
client.onPeerMessage((msg) => console.log(`[${msg.topic}] from ${msg.from}:`, msg.payload));
client.onPeerChange((event, peer) => console.log(`Peer ${event}:`, peer.connectionId));
```

## API Reference

### @agent_bridge/agent

| API | Description |
|-----|-------------|
| `new AgentBridgeAgent(options?)` | Create an agent (optional `name`, `transports[]`) |
| `agent.registerAction(name, desc, schema, cb)` | Register an AI-callable action |
| `agent.acceptConnection(transport)` | Accept incoming connection, returns `PeerConnection` |
| `agent.executeAction(connId, name, params)` | Invoke a remote action |
| `agent.notifyPeers(event, data, suggestion?)` | Send notification to all peers |
| `agent.syncState(snapshot)` | Push state snapshot to all peers |
| `agent.sendToPeer(connId, topic, payload)` | Direct message to a peer |
| `agent.broadcast(topic, payload)` | Broadcast to all peers |
| `agent.getPeers()` | List connected peers |
| `agent.destroy()` | Disconnect all peers |

### @agent_bridge/host

| API | Description |
|-----|-------------|
| `host.mount(source, config)` | Mount a guest app, returns `Connection` |
| `host.executeAction(connId, name, params)` | Invoke a guest action |
| `host.getCapabilities(connId)` | Get registered capabilities |
| `host.getAllCapabilities()` | Get capabilities across all connections |
| `host.unmount(connId)` | Unmount a guest |
| `host.getConnectedPeers(excludeId?)` | List connected peers |
| `host.destroyAll()` | Tear down all connections |

### @agent_bridge/client

| API | Description |
|-----|-------------|
| `client.initialize()` | Connect to host |
| `client.registerAction(name, desc, schema, cb)` | Register a callable action |
| `client.notifyHost(event, data, suggestion?)` | Send notification to host |
| `client.syncState(snapshot)` | Push full state snapshot |
| `client.sendToPeer(targetId, topic, payload)` | Direct message to a peer |
| `client.broadcast(topic, payload)` | Message all peers |
| `client.getPeers()` | List connected peers |
| `client.onPeerMessage(handler)` | Subscribe to peer messages |
| `client.onPeerChange(handler)` | Subscribe to peer connect/disconnect |
| `client.destroy()` | Disconnect |

### LLM Tool Converters (from `@agent_bridge/shared`)

| API | Description |
|-----|-------------|
| `toOpenAITool(schema)` | Convert action schema to OpenAI tool format |
| `toAnthropicTool(schema)` | Convert to Anthropic tool format |
| `toGeminiTool(schema)` | Convert to Gemini tool format |

## Examples

```bash
pnpm run examples   # Build and serve on port 3000
```

| Example | Description |
|---------|-------------|
| [01 - Basic Inline](examples/01-basic-inline/) | Inline mount with bidirectional actions |
| [02 - Iframe Mode](examples/02-iframe-mode/) | Iframe mount with cross-origin isolation |
| [03 - LLM Tool Calling](examples/03-llm-tool-calling/) | LLM tool-calling integration pattern |
| [04 - Peer Communication](examples/04-peer-communication/) | Multi-client peer messaging and broadcast |
| [05 - Universal Peer](examples/05-universal-peer/) | Two `AgentBridgeAgent` via InMemoryTransport — no iframe |

## Documentation

| Document | Description |
|----------|-------------|
| [DESIGN.md](docs/DESIGN.md) | Original product requirements & architecture (v1.0) |
| [IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) | Detailed implementation plan with protocol specs |
| [UNIVERSAL_PROTOCOL_DESIGN.md](docs/UNIVERSAL_PROTOCOL_DESIGN.md) | Evolution from host‑sandbox to universal protocol |

## License

MIT
