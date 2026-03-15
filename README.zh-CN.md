# AgentBridge

轻量级 TypeScript SDK，让宿主应用挂载 AI 生成的子应用，并通过 `postMessage` 建立双向通信。

- `@agent_bridge/host` — 宿主端 SDK：挂载、通信、执行 action、路由 peer 消息
- `@agent_bridge/client` — 子应用端 SDK：零依赖，~1.7KB gzip

## 安装

```bash
# 宿主应用
npm install @agent_bridge/host

# 子应用（仅 iframe URI 模式需要独立安装）
npm install @agent_bridge/client
```

## 快速开始

### 宿主端（Host）

```typescript
import { AgentBridgeHost, toOpenAITool } from '@agent_bridge/host';

const host = new AgentBridgeHost();

// Inline 模式 — 注入代码到 iframe srcdoc
const conn = await host.mount(
  { type: 'raw', code: guestHtmlString, codeType: 'html' },
  { container: document.getElementById('sandbox') }
);

// 或 Iframe 模式 — 加载远程 URL
const conn = await host.mount(
  { type: 'uri', url: 'https://guest-app.example.com' },
  { container: document.getElementById('sandbox') }
);

// 监听子应用注册的 capabilities
conn.on('capabilities', (caps) => {
  const tools = caps.map(toOpenAITool); // 也支持 toAnthropicTool、toGeminiTool
});

// 执行子应用的 action
const result = await host.executeAction(conn.id, 'greet', { name: 'World' });

// 监听通知和状态同步
conn.on('notification', (evt) => console.log(evt.eventName, evt.eventData));
conn.on('stateSync', (snapshot) => console.log(snapshot));
```

### 子应用端（Client）

```typescript
import { BridgeClient } from '@agent_bridge/client';

const client = new BridgeClient();

// 在 initialize() 之前注册 action
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

> Inline 模式下，Client SDK 由宿主自动注入（IIFE），子应用代码直接使用 `new AgentBridgeClient.BridgeClient()` 即可，无需 import。

## Peer 通信

同一宿主挂载的多个子应用可以互相发现并交换消息。所有 peer 消息通过宿主路由（星形拓扑）。

```typescript
// 向指定子应用发送消息
client.sendToPeer(targetConnectionId, 'chat', { text: 'Hello!' });

// 广播给所有其他子应用
client.broadcast('update', { round: 2 });

// 监听 peer 消息
client.onPeerMessage((msg) => {
  console.log(`[${msg.topic}] from ${msg.from}:`, msg.payload);
});

// 监听 peer 连接/断开
client.onPeerChange((event, peer) => {
  console.log(`Peer ${event}:`, peer.connectionId);
});

// 查询当前连接的 peers
const peers = await client.getPeers();
```

## API 概览

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
| `conn.on('capabilities', cb)` | 监听 capabilities 注册/更新 |
| `conn.on('notification', cb)` | 监听子应用通知 |
| `conn.on('stateSync', cb)` | 监听状态快照同步 |
| `toOpenAITool(schema)` | ActionSchema → OpenAI tool 格式 |
| `toAnthropicTool(schema)` | ActionSchema → Anthropic tool 格式 |
| `toGeminiTool(schema)` | ActionSchema → Gemini tool 格式 |

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

## License

MIT
