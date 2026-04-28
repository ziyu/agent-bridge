# AgentBridge

通用 Agent 间通信协议。跨浏览器、Node.js 和任何运行时连接 AI Agent — 通过 postMessage、WebSocket、stdio 或内存传输。

## 包列表

| 包 | 说明 |
|---------|-------------|
| `@agent_bridge/protocol` | 纯协议规范 — 消息类型、错误码、合规级别、序列化。**零依赖。** |
| `@agent_bridge/agent` | 通用对等 Agent — 传输无关的 `AgentBridgeAgent`，适用于任何运行时 |
| `@agent_bridge/host` | 浏览器宿主 SDK — 挂载 iframe 沙箱，与子应用通信 |
| `@agent_bridge/client` | 浏览器客户端 SDK — 运行在 iframe 内，注册 AI 可调用的 action（~1.7KB gzip） |
| `@agent_bridge/transport-memory` | 内存传输 — 同进程 Agent 通信，适合测试 |
| `@agent_bridge/transport-postmessage` | 浏览器 postMessage + MessageChannel 传输 |
| `@agent_bridge/shared` | 便捷重导出 + LLM tool 格式转换器（OpenAI / Anthropic / Gemini） |

## 快速开始

### 通用 Peer-to-Peer（无需 iframe，无需宿主）

```typescript
import { AgentBridgeAgent } from '@agent_bridge/agent';
import { createMemoryTransportPair } from '@agent_bridge/transport-memory';

const [t1, t2] = createMemoryTransportPair();
const agentA = new AgentBridgeAgent({ name: 'AgentA' });
const agentB = new AgentBridgeAgent({ name: 'AgentB' });

// B 注册 action
agentB.registerAction('greet', '问候某人', {
  type: 'object',
  properties: { name: { type: 'string' } },
  required: ['name'],
}, (params) => ({ message: `你好，${params.name}！` }));

// 双向连接
await Promise.all([agentA.acceptConnection(t1), agentB.acceptConnection(t2)]);

// A 调用 B 的 action
const [peer] = agentA.getPeers();
const result = await agentA.executeAction(peer.connectionId, 'greet', { name: '世界' });
// → { message: '你好，世界！' }
```

### 浏览器宿主 + 子应用

```typescript
import { AgentBridgeHost, toOpenAITool } from '@agent_bridge/host';

const host = new AgentBridgeHost();

// Inline 模式 — 注入代码到 iframe srcdoc
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
client.registerAction('greet', '问候某人', {
  type: 'object', properties: { name: { type: 'string' } }, required: ['name'],
}, (params) => ({ message: `你好，${params.name}！` }));

await client.initialize();
client.notifyHost('ready', { timestamp: Date.now() });
```

### Peer 通信

```typescript
client.sendToPeer(targetConnectionId, 'chat', { text: '你好！' });
client.broadcast('update', { round: 2 });
client.onPeerMessage((msg) => console.log(`[${msg.topic}] from ${msg.from}:`, msg.payload));
client.onPeerChange((event, peer) => console.log(`Peer ${event}:`, peer.connectionId));
```

## API 概览

### @agent_bridge/agent

| API | 说明 |
|-----|------|
| `new AgentBridgeAgent(options?)` | 创建 Agent（可选 `name`、`transports[]`） |
| `agent.registerAction(name, desc, schema, cb)` | 注册 AI 可调用的 action |
| `agent.acceptConnection(transport)` | 接受传入连接，返回 `PeerConnection` |
| `agent.executeAction(connId, name, params)` | 调用远程 action |
| `agent.notifyPeers(event, data, suggestion?)` | 向所有 peers 发送通知 |
| `agent.syncState(snapshot)` | 向所有 peers 推送状态快照 |
| `agent.sendToPeer(connId, topic, payload)` | 向指定 peer 发送消息 |
| `agent.broadcast(topic, payload)` | 广播给所有 peers |
| `agent.getPeers()` | 列出已连接的 peers |
| `agent.destroy()` | 断开所有 peers |

### @agent_bridge/host

| API | 说明 |
|-----|------|
| `host.mount(source, config)` | 挂载子应用，返回 `Connection` |
| `host.executeAction(connId, name, params)` | 调用子应用的 action |
| `host.getCapabilities(connId)` | 获取子应用注册的 capabilities |
| `host.getAllCapabilities()` | 获取所有连接的 capabilities |
| `host.unmount(connId)` | 卸载子应用 |
| `host.getConnectedPeers(excludeId?)` | 获取已连接的 peers |
| `host.destroyAll()` | 销毁所有连接 |

### @agent_bridge/client

| API | 说明 |
|-----|------|
| `client.initialize()` | 与宿主建立连接 |
| `client.registerAction(name, desc, schema, cb)` | 注册可被宿主调用的 action |
| `client.notifyHost(event, data, suggestion?)` | 向宿主发送通知 |
| `client.syncState(snapshot)` | 同步完整状态快照到宿主 |
| `client.sendToPeer(targetId, topic, payload)` | 向指定 peer 发送消息 |
| `client.broadcast(topic, payload)` | 广播给所有 peers |
| `client.getPeers()` | 查询已连接的 peers |
| `client.onPeerMessage(handler)` | 订阅 peer 消息 |
| `client.onPeerChange(handler)` | 订阅 peer 连接/断开事件 |
| `client.destroy()` | 断开连接 |

### LLM Tool 转换器（来自 `@agent_bridge/shared`）

| API | 说明 |
|-----|------|
| `toOpenAITool(schema)` | ActionSchema → OpenAI tool 格式 |
| `toAnthropicTool(schema)` | ActionSchema → Anthropic tool 格式 |
| `toGeminiTool(schema)` | ActionSchema → Gemini tool 格式 |

## 示例

```bash
pnpm run examples   # 构建并在 3000 端口启动
```

| 示例 | 说明 |
|------|------|
| [01 - 基础 Inline 模式](examples/01-basic-inline/) | Inline 挂载，双向 action 通信 |
| [02 - Iframe 模式](examples/02-iframe-mode/) | Iframe 挂载，跨域隔离 |
| [03 - LLM Tool Calling](examples/03-llm-tool-calling/) | LLM tool-calling 集成模式 |
| [04 - Peer 通信](examples/04-peer-communication/) | 多客户端 peer 消息与广播 |
| [05 - 通用 Peer](examples/05-universal-peer/) | 双 `AgentBridgeAgent` 通过 InMemoryTransport — 无需 iframe |

## 文档

| 文档 | 说明 |
|----------|-------------|
| [DESIGN.md](docs/DESIGN.md) | 原始产品需求与架构设计 (v1.0) |
| [IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) | 详细实现规划与协议规范 |
| [UNIVERSAL_PROTOCOL_DESIGN.md](docs/UNIVERSAL_PROTOCOL_DESIGN.md) | 从宿主-沙盒到通用协议的演进设计 |

## License

MIT
