# AgentBridge 通用协议升级设计文档

**文档版本**：v0.1（草案）
**日期**：2026-04-27
**状态**：设计阶段

---

## 1. 愿景与动机

### 1.1 当前现状

AgentBridge v1.0 是一套**宿主-沙盒通信 SDK**，核心能力：

- 宿主通过 iframe 挂载 AI 生成的子应用（Guest）
- 基于 `postMessage` + `MessageChannel` 的双向通信
- 子应用通过 `BridgeClient` 注册能力、上报事件、同步状态
- 宿主通过 `AgentBridgeHost` 下发指令、聚合能力、路由对等消息

当前架构的核心约束：**通信双方必须是浏览器宿主和 iframe 沙盒**。

### 1.2 目标愿景

将 AgentBridge 升级为**语言无关、传输无关、角色对等的通用 Agent-to-Agent 通信协议**。

目标场景：

```
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│ 浏览器 Agent  │◄───────►│ Node.js Agent│◄───────►│ Python Agent │
│ (iframe UI)   │ WS/stdio│ (CLI 工具)   │  HTTP/2 │ (ML 模型)    │
└──────────────┘         └──────────────┘         └──────────────┘
                                   │
                          ┌────────┴────────┐
                          │  发现 & 注册中心  │
                          └─────────────────┘
```

### 1.3 核心设计原则

| 原则 | 说明 |
|------|------|
| **协议与传输分离** | 消息类型、握手流程、错误模型独立于具体传输介质 |
| **角色对等** | 不再区分 Host/Guest，所有参与者均为 Agent |
| **渐进合规** | 定义多级合规级别，从最简单的内存通信到完整的网络联邦 |
| **极简核心** | 核心协议层零依赖，类型定义即规范 |
| **传输可插拔** | postMessage、WebSocket、stdio、in-memory 等传输实现可互换 |
| **安全可选配** | 基本模式下无安全要求，生产模式下支持 mTLS/JWT/能力授权 |

---

## 2. 当前架构耦合分析

### 2.1 包依赖现状

```
@agent-bridge/host ──→ @agent-bridge/shared
@agent-bridge/client ──→ @agent-bridge/shared
```

### 2.2 逐层耦合清单

#### 🔴 强耦合（阻塞通用化）

| 位置 | 耦合点 | 具体表现 |
|------|--------|----------|
| `HostTransport` | `window.postMessage()` | 硬编码浏览器 DOM API |
| `HostTransport` | `MessageChannel` | 浏览器专用管道 |
| `HostTransport` | `window.addEventListener('message')` | 浏览器事件循环 |
| `HostTransport` | origin 校验 | 浏览器安全模型 |
| `ClientTransport` | `window.parent.postMessage()` | 隐式假设自己运行在 iframe 中 |
| `ClientTransport` | `window.addEventListener('message')` | 浏览器事件循环 |
| `IframeSandbox` | `document.createElement('iframe')` | DOM API |
| `IframeSandbox` | `iframe.sandbox` / `iframe.allow` | 浏览器安全属性 |
| `InlineSandbox` | `iframe.srcdoc` | 代码直出强依赖 iframe |
| `Connection.handshake()` | `targetWindow: Window` 参数 | 握手与 Window 对象绑定 |
| `AgentBridgeHost.mount()` | `config.container: HTMLElement` | 挂载与 DOM 元素绑定 |

#### 🟡 中度耦合（需要重构但在浏览器场景下合理）

| 位置 | 耦合点 | 具体表现 |
|------|--------|----------|
| `BridgeClient.detectChannel()` | URL hash / `__AGENT_BRIDGE_CHANNEL__` | Channel 发现硬编码两种方式 |
| `AgentBridgeHost` | `Map<string, Connection>` 内存管理 | 对等路由耦合在 Host 类中 |
| `Connection` | 同时管理传输+沙盒生命周期 | 职责混合，沙盒应由 Host 层管理 |

#### 🟢 已解耦（可直接复用）

| 位置 | 内容 | 说明 |
|------|------|------|
| `protocol.ts` | `BridgeMessage` 联合类型 | 纯类型，无运行时依赖 |
| `protocol.ts` | `Transport` 接口 | `send/onMessage/destroy` 抽象 |
| `schema.ts` | `ActionSchema`、LLM 转换器 | 纯函数，无副作用 |
| `errors.ts` | `BridgeError`、`BridgeErrorCode` | 标准错误模型 |
| `guards.ts` | 类型守卫函数 | 纯函数 |
| `OfflineQueue` | 离线消息队列 | 通用的 buffer 模式 |
| 握手协议逻辑 | SYN→ACK1→ACK2 + leader 选举 | 协议本身传输无关 |
| 对等消息类型 | PEER_MESSAGE、BROADCAST 等 | 已具备对等通信雏形 |

---

## 3. 目标架构

### 3.1 新包结构

```
agent-bridge/
├── packages/
│   │
│   ├── protocol/                    # @agent-bridge/protocol （新增 — 纯协议规范）
│   │   ├── src/
│   │   │   ├── messages.ts          # BridgeMessage 联合类型（所有消息类型）
│   │   │   ├── schema.ts            # ActionSchema、JSONSchemaProperty
│   │   │   ├── errors.ts            # BridgeError、BridgeErrorCode
│   │   │   ├── constants.ts         # NAMESPACE、PROTOCOL_VERSION
│   │   │   ├── guards.ts            # 消息类型守卫
│   │   │   ├── transport.ts         # Transport 抽象接口
│   │   │   ├── serializer.ts        # MessageSerializer 抽象接口（新增）
│   │   │   ├── identity.ts          # AgentIdentity 类型（新增）
│   │   │   ├── compliance.ts        # 合规级别定义（新增）
│   │   │   └── index.ts
│   │   └── package.json             # dependencies: {}（零运行时依赖）
│   │
│   ├── shared/                      # @agent-bridge/shared （缩减 — 仅转换器）
│   │   ├── src/
│   │   │   ├── converters.ts        # toOpenAITool / toAnthropicTool / toGeminiTool
│   │   │   └── index.ts             # re-export protocol/*
│   │   └── package.json
│   │
│   ├── transport/                   # 传输实现包（新增目录）
│   │   ├── memory/                  # @agent-bridge/transport-memory
│   │   │   ├── src/
│   │   │   │   ├── memory-transport.ts   # 同进程 Agent 通信
│   │   │   │   └── index.ts
│   │   │   └── package.json
│   │   │
│   │   ├── postmessage/             # @agent-bridge/transport-postmessage
│   │   │   ├── src/
│   │   │   │   ├── host-transport.ts     # 宿主侧 postMessage（从 host 包迁移）
│   │   │   │   ├── client-transport.ts   # 子应用侧 postMessage（从 client 包迁移）
│   │   │   │   └── index.ts
│   │   │   └── package.json
│   │   │
│   │   ├── websocket/               # @agent-bridge/transport-websocket（新增）
│   │   │   ├── src/
│   │   │   │   ├── ws-server.ts          # WebSocket 服务端
│   │   │   │   ├── ws-client.ts          # WebSocket 客户端
│   │   │   │   └── index.ts
│   │   │   └── package.json
│   │   │
│   │   └── stdio/                   # @agent-bridge/transport-stdio（新增）
│   │       ├── src/
│   │       │   ├── stdio-transport.ts    # stdin/stdout 进程间通信（Node.js）
│   │       │   └── index.ts
│   │       └── package.json
│   │
│   ├── agent/                       # @agent-bridge/agent （新增 — 通用 Agent）
│   │   ├── src/
│   │   │   ├── agent.ts             # AgentBridgeAgent — 核心类
│   │   │   ├── connection.ts        # PeerConnection — 泛化的连接管理
│   │   │   ├── handshake.ts         # 握手协议引擎（传输无关）
│   │   │   ├── router.ts            # MessageRouter — 消息路由
│   │   │   ├── discovery.ts         # 发现接口（新增）
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── host/                        # @agent-bridge/host （缩减 — 仅沙盒管理）
│   │   ├── src/
│   │   │   ├── host.ts              # AgentBridgeHost（保留，委托给 agent）
│   │   │   ├── sandbox/
│   │   │   │   ├── types.ts
│   │   │   │   ├── iframe.ts
│   │   │   │   └── inline.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── client/                      # @agent-bridge/client （缩减 — 薄包装）
│       ├── src/
│       │   ├── client.ts            # BridgeClient（保留，委托给 agent）
│       │   └── index.ts
│       └── package.json
```

### 3.2 依赖关系图

```
@agent-bridge/protocol          ← 零依赖，纯类型 + 接口
    ↑
    ├── @agent-bridge/shared    ← 仅转换器
    ├── @agent-bridge/agent     ← 通用 Agent 实现
    │       ↑
    │       ├── @agent-bridge/transport-memory
    │       ├── @agent-bridge/transport-postmessage
    │       ├── @agent-bridge/transport-websocket
    │       └── @agent-bridge/transport-stdio
    │
    ├── @agent-bridge/host      ← 沙盒管理（依赖 agent + transport-postmessage）
    └── @agent-bridge/client    ← 薄包装（依赖 agent + transport-postmessage）
```

### 3.3 架构演进对比

```
BEFORE (宿主-沙盒模型)              AFTER (通用协议模型)
─────────────────────────          ───────────────────────

┌─────────────────┐                ┌──────────────────────────┐
│   AgentBridge   │                │    AgentBridge Protocol   │
│     Host        │                │  (纯 TypeScript 类型定义)  │
│  ┌───────────┐  │                └──────────┬───────────────┘
│  │ Sandbox   │  │                           │
│  │ Manager   │  │          ┌────────────────┼────────────────┐
│  ├───────────┤  │          │                │                │
│  │postMessage│  │    ┌─────▼─────┐   ┌──────▼──────┐  ┌─────▼─────┐
│  │ Transport │  │    │  Agent A  │   │  Agent B    │  │  Agent C  │
│  ├───────────┤  │    │ (browser) │   │ (node.js)   │  │ (python)  │
│  │ Connection│  │    │           │   │             │  │           │
│  │ State     │  │    │ postMsg   │   │ WebSocket   │  │ HTTP/2    │
│  ├───────────┤  │    │ memory    │   │ stdio       │  │ gRPC      │
│  │ Peer      │  │    └─────┬─────┘   └──────┬──────┘  └─────┬─────┘
│  │ Router    │  │          │                │                │
│  └───────────┘  │          └────────────────┼────────────────┘
└─────────────────┘                           │
                                    ┌─────────▼─────────┐
                                    │  Discovery Layer  │
                                    │ (registry / mDNS) │
                                    └───────────────────┘
```

---

## 4. 核心抽象

### 4.1 Transport 接口（传输抽象）

```typescript
// packages/protocol/src/transport.ts

/**
 * 传输层抽象接口。
 * 所有具体传输实现（postMessage、WebSocket、stdio、内存）必须实现此接口。
 */
export interface Transport {
  /** 发送消息 */
  send(message: BridgeMessage, transferables?: Transferable[]): void;

  /** 注册消息处理器，返回取消注册函数 */
  onMessage(handler: (message: BridgeMessage) => void): () => void;

  /** 销毁传输层，清理所有资源 */
  destroy(): void;
}

/**
 * 可连接的传输层 — 用于主动发起连接的场景。
 */
export interface ConnectableTransport extends Transport {
  /** 发起连接，返回 Promise，在传输层就绪后 resolve */
  connect(address: string | URL): Promise<void>;
}

/**
 * 可监听的传输层 — 用于被动接受连接的场景。
 */
export interface ListenableTransport extends Transport {
  /** 开始监听，当有新连接建立时触发回调 */
  listen(
    address: string | URL,
    onConnection: (transport: Transport) => void
  ): Promise<void>;
}
```

### 4.2 MessageSerializer 接口（序列化抽象）

```typescript
// packages/protocol/src/serializer.ts

/**
 * 序列化器接口。
 * 将 BridgeMessage 对象转换为传输介质期望的格式（字符串或二进制）。
 * 当前 browser postMessage 使用 structured clone（无需序列化），
 * WebSocket / stdio 需要 JSON 或 MessagePack。
 */
export interface MessageSerializer {
  /** 序列化消息为传输格式 */
  serialize(message: BridgeMessage): string | Uint8Array;

  /** 反序列化从传输介质接收的原始数据 */
  deserialize(raw: string | Uint8Array): BridgeMessage;
}

/**
 * JSON 序列化器 — 默认实现，适用于 WebSocket、stdio。
 */
export class JSONSerializer implements MessageSerializer {
  serialize(message: BridgeMessage): string {
    return JSON.stringify(message);
  }

  deserialize(raw: string): BridgeMessage {
    const parsed = JSON.parse(raw);
    if (!isValidBridgeMessage(parsed)) {
      throw new Error('Deserialized data is not a valid BridgeMessage');
    }
    return parsed;
  }
}
```

### 4.3 AgentIdentity（Agent 身份）

```typescript
// packages/protocol/src/identity.ts

/**
 * Agent 身份标识。
 * 每个 Agent 在握手时携带此信息，用于能力协商和传输选择。
 */
export interface AgentIdentity {
  /** 全局唯一标识符（UUID v4） */
  id: string;

  /** 人类可读的名称 */
  name: string;

  /** 协议版本（语义化版本） */
  protocolVersion: string;

  /** 当前 Agent 提供的传输能力 */
  transports: TransportPreference[];

  /** 当前 Agent 声明的能力（能力注册表） */
  capabilities: CapabilitiesDeclaration;
}

/**
 * 传输偏好声明。
 * 按优先级排序，第一个为首选传输。
 */
export interface TransportPreference {
  /** 传输类型标识，如 "postmessage"、"websocket"、"stdio"、"memory" */
  type: string;

  /** 传输层协议版本 */
  version: string;

  /** 连接地址（可选，用于被连接方） */
  address?: string;
}

/**
 * 能力声明。
 * 描述 Agent 提供和需要的功能。
 */
export interface CapabilitiesDeclaration {
  /** 支持的合规级别 */
  complianceLevel: ComplianceLevel;

  /** 支持的消息类型 */
  supportedMessages: BridgeMessageType[];

  /** 可选特性 */
  features: {
    /** 是否支持 CALL 调用 */
    toolCalling: boolean;
    /** 是否支持 STATE_SYNC 状态同步 */
    stateSync: boolean;
    /** 是否支持 NOTIFY 事件上报 */
    notifications: boolean;
    /** 是否支持点对点消息 */
    peerMessaging: boolean;
    /** 是否支持广播消息 */
    broadcast: boolean;
    /** 是否支持流式响应（v0.2） */
    streaming: boolean;
  };
}
```

### 4.4 ComplianceLevel（合规级别）

```typescript
// packages/protocol/src/compliance.ts

/**
 * 协议合规级别。
 * 允许 Agent 声明自己的能力范围，实现渐进式采用。
 */
export type ComplianceLevel =
  | 'core'           // L1：SYN/ACK/CALL/REPLY/DESTROY
  | 'notifications'  // L2：L1 + NOTIFY/STATE_SYNC/CAPABILITIES_UPDATE
  | 'peer'           // L3：L2 + PEER_MESSAGE/BROADCAST/PEER_LIST
  | 'streaming'      // L4：L3 + STREAM_*（未来）
  ;

/**
 * 各合规级别的必需消息类型。
 */
export const COMPLIANCE_REQUIREMENTS: Record<ComplianceLevel, BridgeMessageType[]> = {
  core:          ['SYN', 'ACK1', 'ACK2', 'CALL', 'REPLY', 'DESTROY'],
  notifications: ['SYN', 'ACK1', 'ACK2', 'CALL', 'REPLY', 'DESTROY',
                  'NOTIFY', 'STATE_SYNC', 'CAPABILITIES_UPDATE'],
  peer:          ['SYN', 'ACK1', 'ACK2', 'CALL', 'REPLY', 'DESTROY',
                  'NOTIFY', 'STATE_SYNC', 'CAPABILITIES_UPDATE',
                  'PEER_MESSAGE', 'BROADCAST', 'PEER_LIST_REQUEST',
                  'PEER_LIST_RESPONSE', 'PEER_CHANGE'],
  streaming:     [], // TBD
};
```

### 4.5 AgentBridgeAgent（通用 Agent 类）

```typescript
// packages/agent/src/agent.ts

import type {
  Transport,
  AgentIdentity,
  ActionSchema,
  BridgeMessage,
  PeerInfo,
  NotificationEvent,
  ConnectionState,
} from '@agent-bridge/protocol';

/**
 * 通用 AgentBridge Agent。
 * 替代当前的 Host/Client 角色二分法 — 所有参与者均为 Agent。
 *
 * 每个 Agent 可以：
 *  - 主动连接（connect）另一个 Agent
 *  - 被动监听（listen）等待连接
 *  - 注册本地能力（registerAction）
 *  - 调用远程能力（executeAction）
 *  - 点到点消息（sendToPeer / broadcast）
 */
export class AgentBridgeAgent {
  readonly identity: AgentIdentity;

  /** 注册本地 AI 可调用的能力 */
  registerAction(
    name: string,
    description: string,
    parameterSchema: ActionSchema['parameters'],
    callback: (params: Record<string, unknown>) => unknown | Promise<unknown>,
  ): void;

  /** 主动连接到另一个 Agent */
  connect(transport: ConnectableTransport, address: string): Promise<PeerConnection>;

  /** 被动监听，接受其他 Agent 的连接 */
  listen(transport: ListenableTransport, address: string): Promise<void>;

  /** 调用指定连接的远程能力 */
  executeAction(
    connectionId: string,
    actionName: string,
    parameters: Record<string, unknown>,
    options?: { timeout?: number },
  ): Promise<unknown>;

  /** 上报事件 */
  notifyPeer(eventName: string, eventData: Record<string, unknown>, suggestion?: string): void;

  /** 同步状态快照 */
  syncState(snapshot: Record<string, unknown>): void;

  /** 发送点到点消息 */
  sendToPeer(connectionId: string, topic: string, payload: Record<string, unknown>): void;

  /** 广播消息到所有已连接的 Agent */
  broadcast(topic: string, payload: Record<string, unknown>): void;

  /** 获取已连接的对等 Agent 列表 */
  getPeers(): PeerInfo[];

  /** 事件订阅 */
  onPeerConnect(handler: (peer: PeerInfo) => void): () => void;
  onPeerDisconnect(handler: (peer: PeerInfo) => void): () => void;
  onPeerCapabilities(handler: (connectionId: string, caps: ActionSchema[]) => void): () => void;
  onPeerMessage(handler: (msg: PeerMessageEvent) => void): () => void;
  onNotification(handler: (connectionId: string, event: NotificationEvent) => void): () => void;
  onStateSync(handler: (connectionId: string, snapshot: Record<string, unknown>) => void): () => void;

  /** 销毁当前 Agent，断开所有连接 */
  destroy(): void;
}
```

### 4.6 PeerConnection（泛化连接）

```typescript
// packages/agent/src/connection.ts

/**
 * 对等连接。
 * 表示当前 Agent 与另一个 Agent 之间的已建立连接。
 *
 * 与当前 Connection 类的关键区别：
 *  - 不再绑定沙盒（sandbox 由 Host 层管理）
 *  - 仅在握手期间持有 Transport 引用，握手后传输由握手引擎管理
 *  - 不再持有 targetWindow / allowedOrigins 等浏览器概念
 */
export class PeerConnection {
  readonly id: string;
  readonly remoteIdentity: AgentIdentity;

  getState(): ConnectionState;
  getCapabilities(): ActionSchema[];

  on<K extends keyof ConnectionEvents>(event: K, handler: ConnectionEvents[K]): () => void;

  executeAction(actionName: string, params: Record<string, unknown>, timeout?: number): Promise<unknown>;

  destroy(): void;
}

interface ConnectionEvents {
  stateChange: ConnectionStateEvent;
  capabilities: ActionSchema[];
  notification: NotificationEvent;
  stateSync: Record<string, unknown>;
}
```

---

## 5. 传输层设计

### 5.1 传输实现规范

每个传输实现包必须：

1. 实现 `Transport` 接口
2. 可选择性实现 `ConnectableTransport` 和/或 `ListenableTransport`
3. 在 `package.json` 中声明代理 `@agent-bridge/protocol` 依赖
4. 提供握手阶段的消息收发能力（在握手完升级到端口前使用）
5. 不引入 Agent 逻辑（能力注册、状态机、路由等由 `agent` 包处理）

### 5.2 InMemoryTransport（同进程通信）

```typescript
// packages/transport/memory/src/memory-transport.ts

/**
 * 内存传输 — 用于同进程内的 Agent 通信。
 * 最简单的传输实现，无网络开销，无需序列化。
 */
export class InMemoryTransport implements Transport {
  private handlers = new Set<(msg: BridgeMessage) => void>();
  private peer: InMemoryTransport | null = null;

  /** 与另一个 InMemoryTransport 建立连接 */
  connect(peer: InMemoryTransport): void {
    this.peer = peer;
  }

  send(message: BridgeMessage): void {
    // 直接调用对端的 onMessage 处理器
    if (this.peer) {
      queueMicrotask(() => {
        this.peer!.handlers.forEach(h => h(message));
      });
    }
  }

  onMessage(handler: (msg: BridgeMessage) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  destroy(): void {
    this.peer = null;
    this.handlers.clear();
  }
}

/**
 * 双向内存传输对 — 用于测试和同进程场景。
 */
export function createMemoryTransportPair(): [InMemoryTransport, InMemoryTransport] {
  const a = new InMemoryTransport();
  const b = new InMemoryTransport();
  a.connect(b);
  b.connect(a);
  return [a, b];
}
```

### 5.3 WebSocket Transport（网络通信）

```typescript
// packages/transport/websocket/src/ws-client.ts

/**
 * WebSocket 客户端传输。
 * 适用于 Node.js / Deno / 浏览器环境。
 */
export class WebSocketClientTransport implements ConnectableTransport {
  private ws: WebSocket | null = null;
  private handlers = new Set<(msg: BridgeMessage) => void>();
  private serializer: MessageSerializer;

  constructor(options?: { serializer?: MessageSerializer }) {
    this.serializer = options?.serializer ?? new JSONSerializer();
  }

  async connect(address: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(address);

      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(new Error(`WebSocket connection failed: ${e}`));
      this.ws.onclose = () => {
        this.handlers = new Set();
      };
      this.ws.onmessage = (event) => {
        try {
          const msg = this.serializer.deserialize(
            typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data)
          );
          this.handlers.forEach(h => h(msg));
        } catch {
          // 忽略非协议消息
        }
      };
    });
  }

  send(message: BridgeMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }
    this.ws.send(this.serializer.serialize(message));
  }

  onMessage(handler: (msg: BridgeMessage) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  destroy(): void {
    this.ws?.close();
    this.ws = null;
    this.handlers.clear();
  }
}
```

### 5.4 StdioTransport（进程间通信）

```typescript
// packages/transport/stdio/src/stdio-transport.ts

/**
 * Stdio 传输 — 用于子进程 / MCP 场景。
 * 通过 stdin 接收、stdout 发送 JSON-RPC 风格消息。
 * 适用于 Node.js 环境，与 Claude Code、Cursor 等工具的 Agent 通信。
 */
export class StdioTransport implements Transport {
  private handlers = new Set<(msg: BridgeMessage) => void>();
  private serializer: MessageSerializer;

  constructor(options?: { serializer?: MessageSerializer }) {
    this.serializer = options?.serializer ?? new JSONSerializer();

    // 监听 stdin
    process.stdin.on('data', (chunk: Buffer) => {
      try {
        const msg = this.serializer.deserialize(chunk.toString());
        this.handlers.forEach(h => h(msg));
      } catch {
        // 忽略非协议消息
      }
    });
  }

  send(message: BridgeMessage): void {
    const raw = this.serializer.serialize(message);
    process.stdout.write(raw + '\n');
  }

  onMessage(handler: (msg: BridgeMessage) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  destroy(): void {
    this.handlers.clear();
    // 不关闭 stdin/stdout，由进程管理
  }
}
```

### 5.5 传输协商协议

握手协议扩展，支持传输选择和协商：

```
Agent A (initiator)                          Agent B (responder)
      │                                            │
      │── SYN {                                    │
      │     participantId: "abc",                  │
      │     protocolVersion: "1.0",                │
      │     identity: {                            │
      │       name: "MyAgent",                     │
      │       transports: [                        │
      │         { type: "websocket", addr: "..." },│  ① A 发包，声明支持的传输列表
      │         { type: "memory", addr: "..." }    │
      │       ]                                    │
      │     }                                      │
      │   } ──────────────────────────────────────>│
      │                                            │
      │                                ② B 选择第一个共同传输
      │                                            │
      │<── SYN {                                   │
      │     participantId: "xyz",                  │
      │     identity: { transports: [...] }        │
      │   } ───────────────────────────────────────│
      │                                            │
      │  [leader 选举：participantId 比较]          │
      │  [假设 "xyz" > "abc"，B 为 leader]         │
      │                                            │
      │<── ACK1 {                                  │
      │     selectedTransport: "websocket",        │  ③ B 发送 ACK1，携带选定的传输
      │     capabilities: B 的能力注册表             │
      │   } ───────────────────────────────────────│
      │                                            │
      │── ACK2 {                                   │
      │     capabilities: A 的能力注册表             │  ④ A 发送 ACK2，连接建立
      │   } ──────────────────────────────────────>│
      │                                            │
      │  ═════ 连接建立完成 ═════                   │
      │  [如果 selectedTransport 需要升级，          │
      │   双方按传输类型执行升级流程]                   │
```

**传输升级规则**：

| selectedTransport | 升级行为 |
|-------------------|----------|
| `postmessage` | `MessageChannel` 创建 → port transfer（保留当前实现） |
| `websocket` | 已通过 WebSocket 连接通信，无需升级 |
| `stdio` | 已通过 stdio 通信，无需升级 |
| `memory` | 已通过内存引用通信，无需升级 |

---

## 6. 向后兼容策略

### 6.1 旧 Host/Client API 兼容

`AgentBridgeHost` 和 `BridgeClient` 作为兼容层保留，内部委托给新 `AgentBridgeAgent`：

```typescript
// packages/host/src/host.ts（简化示意）

import { AgentBridgeAgent } from '@agent-bridge/agent';
import { PostMessageHostTransport } from '@agent-bridge/transport-postmessage';
import type { Sandbox } from './sandbox/types.js';

export class AgentBridgeHost {
  // 内部持有通用 Agent
  private agent = new AgentBridgeAgent({
    identity: { name: 'AgentBridgeHost', ... },
  });

  // 保留旧 API，内部委托
  async mount(source: MountSource, config: SandboxConfig): Promise<Connection> {
    // 1. 创建 sandbox（iframe）
    // 2. 创建 PostMessageHostTransport
    // 3. agent.listen() / handshake
    // 4. 返回 Connection（包装 PeerConnection）
  }

  async executeAction(connId: string, actionName: string, params: Record<string, unknown>): Promise<unknown> {
    return this.agent.executeAction(connId, actionName, params);
  }

  // ...其余 API 类似委托
}
```

### 6.2 协议版本兼容

- `protocolVersion` 字段已存在于 SYN 消息中（当前值为 `"1.0"`）
- 握手时比较双方的 version，若主流（major）版本不一致则拒绝连接
- 副版本（minor）差异允许连接，使用较低版本的功能集

---

## 7. 安全模型

### 7.1 安全分层

```
┌──────────────────────────────────────────────────┐
│  Layer 4: 能力授权（Capability-Based Auth）       │
│  - Agent 声明 needs，Host 声明 grants             │
│  - 超出权限的能力调用直接拒绝                        │
├──────────────────────────────────────────────────┤
│  Layer 3: 身份认证（Identity Auth）               │
│  - JWT / API Key / mTLS                          │
│  - 连接建立前完成身份验证                           │
├──────────────────────────────────────────────────┤
│  Layer 2: 传输加密（Transport Encryption）        │
│  - TLS (WebSocket) / 进程内 (memory)             │
│  - MessageChannel (postMessage，浏览器隐式隔离)    │
├──────────────────────────────────────────────────┤
│  Layer 1: 消息校验（Message Validation）          │
│  - namespace 过滤                                 │
│  - channel 隔离                                   │
│  - message type 校验                              │
│  - origin 校验（仅 postMessage 传输）              │
└──────────────────────────────────────────────────┘
```

### 7.2 安全级别

| 级别 | 适用场景 | 安全机制 |
|------|----------|----------|
| **none** | InMemoryTransport、同进程测试 | 无（信任进程内通信） |
| **basic** | postMessage（浏览器 iframe） | origin 校验 + MessageChannel 升级 |
| **standard** | WebSocket（内网 Agent 通信） | TLS + API Key |
| **strict** | WebSocket（跨网络 Agent 通信） | mTLS + JWT + 能力授权 |

### 7.3 安全配置

```typescript
interface SecurityConfig {
  /** 安全级别 */
  level: 'none' | 'basic' | 'standard' | 'strict';

  /** 身份验证配置 */
  auth?: {
    /** 认证方式 */
    method: 'jwt' | 'api-key' | 'mtls' | 'none';
    /** JWT 密钥或 API Key */
    secret?: string;
    /** mTLS 证书路径 */
    certPath?: string;
  };

  /** 能力授权配置 */
  authorization?: {
    /** 允许的能力白名单 */
    allowedActions?: string[];
    /** 是否需要授权回调 */
    authorize?: (connectionId: string, actionName: string) => boolean | Promise<boolean>;
  };
}
```

---

## 8. 迁移路径

### Phase 1：协议提取（1-2 周，零破坏性变更）

**目标**：将 `packages/shared/` 中纯协议类型提取到 `packages/protocol/`。

| 步骤 | 产出 | 验收标准 |
|------|------|----------|
| 1.1 创建 `@agent-bridge/protocol` 包 | `packages/protocol/` 目录结构 + `package.json` | `pnpm install` 成功 |
| 1.2 迁移类型定义 | `messages.ts`、`errors.ts`、`guards.ts`、`constants.ts`、`transport.ts` | 类型编译通过 |
| 1.3 保留 shared 包向后兼容 | `@agent-bridge/shared` re-export `@agent-bridge/protocol` | 现有代码无需修改 |
| 1.4 迁移后清理 shared 包 | shared 仅保留 `converters.ts` | 构建通过 |

**破坏性变更**：无。`@agent-bridge/shared` 通过 re-export 保持兼容。

### Phase 2：传输抽取（2-3 周，零破坏性变更）

**目标**：将 Transport 实现从 Host/Client 包迁移到独立传输包。

| 步骤 | 产出 | 验收标准 |
|------|------|----------|
| 2.1 创建 `@agent-bridge/transport-postmessage` | 迁移 HostTransport + ClientTransport | 现有集成测试通过 |
| 2.2 Host/Client 包引用新传输包 | 通过依赖而非内联使用 Transport | 构建通过 |
| 2.3 创建 `@agent-bridge/transport-memory` | InMemoryTransport + `createMemoryTransportPair` | 单元测试：双 Agent 握手+调用 |
| 2.4 验证跨包集成 | 旧 API（`AgentBridgeHost` / `BridgeClient`）行为不变 | E2E 测试全部通过 |

**破坏性变更**：无。旧包内部依赖路径改变，但 API 不变。

### Phase 3：通用 Agent（2-3 周，新增能力，旧 API 兼容）

**目标**：创建 `@agent-bridge/agent`，实现角色对等的通用 Agent。

| 步骤 | 产出 | 验收标准 |
|------|------|----------|
| 3.1 实现 `AgentBridgeAgent` 核心 | 握手引擎、消息路由、能力管理 | InMemoryTransport 双 Agent 全流程通过 |
| 3.2 实现 `PeerConnection` | 泛化连接状态机 | 连接生命周期管理测试通过 |
| 3.3 添加 AgentIdentity + 传输协商 | SYN 消息携带身份和传输列表 | 多传输 Agent 协商正确 |
| 3.4 Host/Client 迁移到委托模式 | `AgentBridgeHost` / `BridgeClient` 内部使用 `AgentBridgeAgent` | 所有现有测试通过 |
| 3.5 文档更新 | README、API 参考、迁移指南 | 开发者可按文档使用新 API |

**破坏性变更**：无。旧 API 完全保留。

### Phase 4：多传输 + 发现（3-4 周，新增能力）

**目标**：支持 WebSocket、stdio 传输，添加发现机制。

| 步骤 | 产出 | 验收标准 |
|------|------|----------|
| 4.1 `@agent-bridge/transport-websocket` | WebSocket 客户端/服务端传输 | Node.js 环境双 Agent WebSocket 通信 |
| 4.2 `@agent-bridge/transport-stdio` | stdio 传输（子进程场景） | 父子进程 Agent 通信 |
| 4.3 发现接口 + 内存注册中心 | `DiscoveryProvider` 接口 + `InMemoryRegistry` | 3 Agent 通过注册中心互相发现 |
| 4.4 序列化层 | `MessageSerializer` + `JSONSerializer` | WebSocket 收发正确 |
| 4.5 Node.js 适配 | `@agent-bridge/agent` 可在 Node.js 使用 | Node.js demo 运行成功 |

**破坏性变更**：无。全部新增。

### Phase 5：安全增强（3-4 周）

| 步骤 | 产出 |
|------|------|
| 5.1 JWT 身份认证 | Agent 握手时携带签名的 JWT |
| 5.2 mTLS 传输加密 | WebSocket 传输支持 mTLS |
| 5.3 能力授权 | `SecurityConfig.authorization.allowedActions` |
| 5.4 审计日志 | 消息记录插件接口 |

---

## 9. 关键设计决策

| # | 决策 | 理由 | 替代方案 | 否决原因 |
|---|------|------|----------|----------|
| D1 | 保留 Host/Client 命名，内部委托 Agent | 现有 API 不破坏，平滑迁移 | 直接废弃 Host/Client | 用户已有集成，激进废弃不可接受 |
| D2 | Transport 接口保持简单（send/onMessage/destroy） | 降低传输实现门槛 | 增加 connect/listen 到核心 Transport | 部分传输无连接概念（如 memory） |
| D3 | 传输协商在 SYN 阶段完成 | 一次往返确定传输，后续无需再协商 | 先握手再协商 | 多一次 RTT |
| D4 | 能力随 ACK1/ACK2 传递 | 减少往返，与现有设计一致 | 握手后单独请求 | 额外往返，能力在握手时已确定 |
| D5 | 协议包零运行时依赖 | 可作为独立规范被其他语言实现 | 允许小依赖 | 协议规范应不绑定特定运行时 |
| D6 | 保留 `channel` 字段用于多路复用 | 同一传输上支持多条逻辑连接 | 要求传输层原生支持多路复用 | 增加传输实现复杂度 |
| D7 | 不采用 JSON-RPC 作为基础 | 当前消息格式已足够，额外封装增加开销 | 基于 JSON-RPC | JSON-RPC 的方法调用模型与 Agent 的多种消息类型不匹配 |
| D8 | 序列化器可选而非强制 | browser postMessage 用 structured clone 更快 | 强制 JSON 序列化 | 性能损失，且 structured clone 天然存在 |

---

## 10. 协议规范（独立于实现）

### 10.1 消息格式规范

所有 AgentBridge 消息共享统一信封：

```typescript
interface MessageEnvelope {
  /** 协议命名空间，固定值 "agent-bridge" */
  namespace: "agent-bridge";

  /** 逻辑通道标识，用于同一传输上的多路复用 */
  channel: string;

  /** 消息发送时间戳（毫秒） */
  timestamp: number;

  /** 消息类型 */
  type: MessageType;
}
```

**消息类型全集**（`protocol/src/messages.ts`）：

| type | 方向 | 说明 | 合规级别 |
|------|------|------|----------|
| `SYN` | ↔️ | 握手同步，携带身份和传输列表 | core |
| `ACK1` | → | 握手确认第一步（leader 发送） | core |
| `ACK2` | → | 握手确认第二步，携带能力清单 | core |
| `CALL` | → | 远程能力调用（RPC） | core |
| `REPLY` | ← | CALL 的响应 | core |
| `DESTROY` | ↔️ | 请求断连 | core |
| `NOTIFY` | → | 事件通知 | notifications |
| `STATE_SYNC` | → | 状态快照同步 | notifications |
| `CAPABILITIES_UPDATE` | → | 能力动态注册/更新 | notifications |
| `PEER_MESSAGE` | → | 点到点消息（发给 Host 路由） | peer |
| `PEER_MESSAGE_DELIVERY` | ← | 点到点消息送达（Host 路由） | peer |
| `BROADCAST` | → | 广播消息（发给 Host 分发） | peer |
| `PEER_LIST_REQUEST` | → | 请求对等 Agent 列表 | peer |
| `PEER_LIST_RESPONSE` | ← | 对等 Agent 列表响应 | peer |
| `PEER_CHANGE` | ← | 对等 Agent 连接/断连通知 | peer |

### 10.2 握手协议规范

```
状态机：
  DISCONNECTED → CONNECTING → CONNECTED
                     ↓
                   ERROR

握手流程：
  1. 双方各自发送 SYN（可无序到达）
  2. 任一收到对方的 SYN → 发送自己的 SYN（若尚未发送）
  3. 比较 participantId（字典序）→ 确定 leader
  4. leader 发送 ACK1（携带选定传输）
  5. non-leader 收到 ACK1 → 发送 ACK2（携带能力清单）
  6. 双方标记为 CONNECTED
  7. 如需传输升级，执行升级流程

超时处理：
  - 默认握手超时：10 秒
  - 超时后进入 ERROR 状态
  - 实现可以提供 retry 机制
```

### 10.3 错误码规范

```typescript
type BridgeErrorCode =
  | 'HANDSHAKE_TIMEOUT'       // 握手超时
  | 'CALL_TIMEOUT'            // 能力调用超时
  | 'NOT_CONNECTED'           // 连接未建立
  | 'CONNECTION_DESTROYED'    // 连接已销毁
  | 'ACTION_NOT_FOUND'        // 能力未注册
  | 'ACTION_EXECUTION_ERROR'  // 能力执行异常
  | 'INVALID_PARAMETERS'      // 参数不符合 schema
  | 'SANDBOX_CRASH'           // 沙盒崩溃（仅 host 场景）
  | 'PROTOCOL_ERROR'          // 协议错误
  | 'TRANSPORT_ERROR'         // 传输层错误（新增）
  | 'AUTH_ERROR'              // 认证失败（新增）
  | 'AUTHORIZATION_ERROR';    // 授权不足（新增）
```

---

## 11. 跨语言协议规范

### 11.1 语言无关性

`@agent-bridge/protocol` 包的设计目标是 **README 即规范**。任何语言都可以通过阅读以下文件来实现 AgentBridge 协议：

| 文件 | 内容 | 作用 |
|------|------|------|
| `messages.ts` | 所有消息类型定义 | 协议消息格式 |
| `constants.ts` | NAMESPACE、VERSION | 握手标识 |
| `errors.ts` | 错误码枚举 | 错误语义 |
| `compliance.ts` | 合规级别定义 | 渐进实现指导 |

### 11.2 参考实现计划

| 语言 | 时机 | 优先级 |
|------|------|--------|
| TypeScript（`@agent-bridge/agent`） | Phase 3 | P0 — 当前项目 |
| Python（`agentbridge-py`） | Phase 5+ | P1 — MCP 生态集成 |
| Rust（`agentbridge-rs`） | Phase 5+ | P2 — 高性能场景 |

### 11.3 序列化格式

| 格式 | 适用场景 | 依赖 |
|------|----------|------|
| Structured Clone | 浏览器 postMessage | 浏览器内置 |
| JSON | WebSocket、stdio、HTTP | JSON.parse/stringify（所有语言内置） |
| MessagePack | 高性能场景（未来） | msgpack 库 |

---

## 12. 风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| 旧 API 兼容层过于复杂 | 维护双 API 负担大 | 中 | 委托模式，Agent 是唯一核心逻辑 |
| 传输实现质量参差不齐 | 不同传输行为不一致 | 中 | 共享握手测试套件，所有传输必须通过 |
| 协议版本碎片化 | 不同 Agent 无法互操作 | 低 | 严格版本检查，主流版本不兼容直接拒绝 |
| 性能损失（抽象层开销） | 简单场景引入不必要复杂度 | 低 | 零成本抽象 — TypeScript 接口在运行时无开销 |
| 过度工程化 | 当前项目规模不值得 | 中 | Phase 1-2 低成本（仅重组代码），Phase 3 有明显收益 |

---

## 附录 A：术语对照

| 旧术语 | 新术语 | 说明 |
|--------|--------|------|
| Host（宿主） | Agent（Host 角色） | 仍可 mount sandbox，但同时是对等 Agent |
| Guest / Client（子应用） | Agent（Guest 角色） | 运行在 sandbox 中的对等 Agent |
| `AgentBridgeHost` | `AgentBridgeAgent` + SandboxManager | 保留 Host 命名，内部委托 |
| `BridgeClient` | `AgentBridgeAgent` + PostMessageClientTransport | 保留 Client 命名，内部委托 |
| `Connection` | `PeerConnection` | 从 "宿主到子应用" 变为 "Agent 到 Agent" |
| `HostTransport` | `PostMessageHostTransport` | 移到传输包 |
| `ClientTransport` | `PostMessageClientTransport` | 移到传输包 |
| mount / unmount | 保留（Host 层专用） | 沙盒管理接口不变 |

## 附录 B：与现有协议的关系

| 协议 | AgentBridge 的定位 | 区别 |
|------|-------------------|------|
| **MCP** (Model Context Protocol) | 互补 — MCP 连接 LLM 和工具，AgentBridge 连接 Agent 和 Agent | MCP 是 C/S 模型，AgentBridge 是 P2P；MCP 绑定 JSON-RPC/stdio，AgentBridge 传输无关 |
| **A2A** (Google Agent-to-Agent) | 竞争/参考 — 同为 Agent 间通信协议 | A2A 偏重 HTTP/REST + Task 模型，AgentBridge 更轻量（零依赖）且支持浏览器 |
| **JSON-RPC** | 底层基础 — AgentBridge 的 CALL/REPLY 是 RPC | AgentBridge 增加了握手、能力发现、事件、状态同步等高层语义 |
| **postMessage** | 一种传输实现 | 仅传输层，AgentBridge 在此之上构建协议 |
