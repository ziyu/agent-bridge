# AgentBridge

轻量级 TypeScript SDK，让宿主应用挂载 AI 生成的子应用，并通过 `postMessage` 建立双向通信。

- `@agent-bridge/host` — 宿主端 SDK，负责挂载、通信、执行 action
- `@agent-bridge/client` — 子应用端 SDK，零依赖，~1.7KB gzip

## 安装

```bash
# 宿主应用
npm install @agent-bridge/host

# 子应用（iframe 模式需要独立安装）
npm install @agent-bridge/client
```

## 快速开始

### 宿主端（Host）

```typescript
import { AgentBridgeHost, toOpenAITool } from '@agent-bridge/host';

const host = new AgentBridgeHost();

// 方式一：Inline 模式 — 注入代码到 iframe srcdoc
const conn = await host.mount(
  { type: 'raw', code: guestHtmlString, codeType: 'html' },
  { container: document.getElementById('sandbox') }
);

// 方式二：Iframe 模式 — 加载远程 URL
const conn = await host.mount(
  { type: 'uri', url: 'https://guest-app.example.com' },
  { container: document.getElementById('sandbox') }
);

// 监听子应用注册的 capabilities
conn.on('capabilities', (caps) => {
  console.log('可用 actions:', caps.map(c => c.name));
  // 转换为 LLM tool-calling 格式
  const tools = caps.map(toOpenAITool);
});

// 执行子应用的 action
const result = await host.executeAction(conn.id, 'greet', { name: 'World' });

// 监听通知和状态同步
conn.on('notification', (evt) => console.log(evt.eventName, evt.eventData));
conn.on('stateSync', (snapshot) => console.log(snapshot));
```

### 子应用端（Client）

```typescript
import { BridgeClient } from '@agent-bridge/client';

const client = new BridgeClient();

// 注册 action（可在 initialize 前后调用）
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

// 建立连接
await client.initialize();

// 通知宿主 / 同步状态
client.notifyHost('ready', { timestamp: Date.now() });
client.syncState({ status: 'running' });
```

> Inline 模式下，Client SDK 由宿主自动注入（IIFE: `@agent-bridge/client/dist/index.global.js`），子应用代码直接使用 `new AgentBridgeClient.BridgeClient()` 即可。

## API 概览

### @agent-bridge/host

| API | 说明 |
|-----|------|
| `AgentBridgeHost.mount(source, config)` | 挂载子应用，返回 `Connection` |
| `AgentBridgeHost.executeAction(connId, name, params)` | 调用子应用的 action |
| `AgentBridgeHost.getCapabilities(connId)` | 获取子应用注册的 capabilities |
| `AgentBridgeHost.unmount(connId)` | 卸载子应用 |
| `Connection.on('capabilities', cb)` | 监听 capabilities 变更 |
| `Connection.on('notification', cb)` | 监听子应用通知 |
| `Connection.on('stateSync', cb)` | 监听状态同步 |
| `toOpenAITool(schema)` | ActionSchema → OpenAI tool 格式 |
| `toAnthropicTool(schema)` | ActionSchema → Anthropic tool 格式 |
| `toGeminiTool(schema)` | ActionSchema → Gemini tool 格式 |

### @agent-bridge/client

| API | 说明 |
|-----|------|
| `BridgeClient.initialize()` | 与宿主建立连接 |
| `BridgeClient.registerAction(name, desc, schema, cb)` | 注册可被宿主调用的 action |
| `BridgeClient.notifyHost(event, data)` | 向宿主发送通知 |
| `BridgeClient.syncState(snapshot)` | 同步状态快照到宿主 |
| `BridgeClient.destroy()` | 断开连接 |

## License

MIT
