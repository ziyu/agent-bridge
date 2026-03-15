# AgentBridge

[中文文档](./README.zh-CN.md)

Lightweight TypeScript SDK that lets host apps mount AI-generated guest apps and establish bidirectional communication via `postMessage`.

- `@agent_bridge/host` — Host SDK: mount, communicate, execute actions, route peer messages
- `@agent_bridge/client` — Client SDK: zero dependencies, ~1.7KB gzip

## Install

```bash
# Host app
npm install @agent_bridge/host

# Guest app (only needed for iframe URI mode)
npm install @agent_bridge/client
```

## Quick Start

### Host

```typescript
import { AgentBridgeHost, toOpenAITool } from '@agent_bridge/host';

const host = new AgentBridgeHost();

// Inline mode — inject code into iframe srcdoc
const conn = await host.mount(
  { type: 'raw', code: guestHtmlString, codeType: 'html' },
  { container: document.getElementById('sandbox') }
);

// Or iframe mode — load remote URL
const conn = await host.mount(
  { type: 'uri', url: 'https://guest-app.example.com' },
  { container: document.getElementById('sandbox') }
);

// Listen for guest capabilities
conn.on('capabilities', (caps) => {
  const tools = caps.map(toOpenAITool); // Also: toAnthropicTool, toGeminiTool
});

// Execute a guest action
const result = await host.executeAction(conn.id, 'greet', { name: 'World' });

// Listen for notifications and state sync
conn.on('notification', (evt) => console.log(evt.eventName, evt.eventData));
conn.on('stateSync', (snapshot) => console.log(snapshot));
```

### Guest (Client)

```typescript
import { BridgeClient } from '@agent_bridge/client';

const client = new BridgeClient();

// Register actions before initialize()
client.registerAction(
  'greet',
  'Greet a person by name',
  {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name to greet' }
    },
    required: ['name'],
  },
  (params) => ({ message: `Hello, ${params.name}!` })
);

await client.initialize();

client.notifyHost('ready', { timestamp: Date.now() });
client.syncState({ status: 'running' });
```

> In inline mode, the Client SDK is auto-injected by the host (IIFE). Guest code uses `new AgentBridgeClient.BridgeClient()` directly — no import needed.

## Peer Communication

Multiple guests mounted by the same host can discover each other and exchange messages. All peer messages are routed through the host (star topology).

```typescript
// Send direct message to another guest
client.sendToPeer(targetConnectionId, 'chat', { text: 'Hello!' });

// Broadcast to all other guests
client.broadcast('update', { round: 2 });

// Listen for peer messages
client.onPeerMessage((msg) => {
  console.log(`[${msg.topic}] from ${msg.from}:`, msg.payload);
});

// Listen for peer connect/disconnect
client.onPeerChange((event, peer) => {
  console.log(`Peer ${event}:`, peer.connectionId);
});

// Query connected peers
const peers = await client.getPeers();
```

## API Reference

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
| `conn.on('capabilities', cb)` | Capabilities registered/updated |
| `conn.on('notification', cb)` | Guest notification event |
| `conn.on('stateSync', cb)` | Guest state snapshot |
| `toOpenAITool(schema)` | Convert to OpenAI tool format |
| `toAnthropicTool(schema)` | Convert to Anthropic tool format |
| `toGeminiTool(schema)` | Convert to Gemini tool format |

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

## License

MIT
