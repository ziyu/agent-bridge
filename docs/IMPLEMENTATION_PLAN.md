# AgentBridge SDK 实现规划

> 版本：v1.0 | 日期：2026-03-14

---

## 一、项目总览

### 1.1 包结构（pnpm monorepo）

```
agent-bridge/
├── pnpm-workspace.yaml
├── package.json                 # private root
├── tsconfig.base.json
├── vitest.config.ts
├── packages/
│   ├── shared/                  # @agent-bridge/shared — 协议类型 & 常量
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── protocol.ts     # 消息类型 discriminated union
│   │   │   ├── schema.ts       # ActionDefinition, CapabilitiesSchema
│   │   │   └── constants.ts    # 命名空间、超时默认值
│   │   ├── tsup.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   ├── client/                  # @agent-bridge/client — 子应用端（零依赖 <5KB gzip）
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── client.ts       # BridgeClient 主类
│   │   │   ├── queue.ts        # 离线消息队列
│   │   │   └── transport.ts    # postMessage 发送/接收封装
│   │   ├── tsup.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   └── host/                    # @agent-bridge/host — 宿主端 SDK
│       ├── src/
│       │   ├── index.ts
│       │   ├── host.ts          # AgentBridgeHost 主类
│       │   ├── connection.ts    # Connection 状态机
│       │   ├── sandbox/
│       │   │   ├── iframe.ts    # iframe 挂载器（Remote URI）
│       │   │   ├── inline.ts    # 代码直出挂载器（Raw Payload）
│       │   │   └── types.ts     # Sandbox 抽象接口
│       │   ├── router.ts        # Action 路由
│       │   └── transport.ts     # 宿主侧 postMessage 管理
│       ├── tsup.config.ts
│       ├── tsconfig.json
│       └── package.json
```

### 1.2 技术选型

| 维度 | 选型 | 理由 |
|------|------|------|
| 包管理 | pnpm workspace | 3 包规模最优，`pnpm -r build` 自动拓扑排序 |
| 构建 | tsup (esbuild) | 双格式 ESM/CJS + .d.ts，30x 快于 tsc |
| 测试 | vitest | 原生 ESM、workspace projects 支持 |
| TypeScript | 5.7+ strict | `Node16` moduleResolution，declarationMap |
| 运行时依赖 | 全部零依赖 | PRD 要求极端轻量 |

### 1.3 npm scope

`@agent-bridge/shared`、`@agent-bridge/client`、`@agent-bridge/host`


---

## 二、核心协议设计

### 2.1 消息类型（Discriminated Union）

参考 Penpal 的 namespace + type 判别模式，所有跨边界消息共享统一信封：

```typescript
// packages/shared/src/protocol.ts

export const NAMESPACE = 'agent-bridge' as const;

interface MessageBase {
  namespace: typeof NAMESPACE;
  channel: string;        // 支持同一宿主挂载多个子应用的多路复用
  timestamp: number;
}

// ── 握手阶段 ──
export type SynMessage = MessageBase & {
  type: 'SYN';
  participantId: string;
  protocolVersion: string;
};

export type Ack1Message = MessageBase & {
  type: 'ACK1';
  capabilities: ActionSchema[];   // 子应用能力清单随握手传递
};

export type Ack2Message = MessageBase & {
  type: 'ACK2';
};

// ── 运行时通信 ──
export type CallMessage = MessageBase & {
  type: 'CALL';
  id: string;              // 请求关联 ID（crypto.randomUUID）
  actionName: string;
  parameters: Record<string, unknown>;
  timeout?: number;
};

export type ReplyMessage = MessageBase & {
  type: 'REPLY';
  callId: string;
} & (
  | { success: true; value: unknown }
  | { success: false; error: { code: string; message: string; data?: unknown } }
);

export type NotifyMessage = MessageBase & {
  type: 'NOTIFY';
  eventName: string;
  eventData: Record<string, unknown>;
  suggestion?: string;     // 隐式 prompt（PRD 需求 2.2）
};

export type StateSyncMessage = MessageBase & {
  type: 'STATE_SYNC';
  snapshot: Record<string, unknown>;
};

export type DestroyMessage = MessageBase & {
  type: 'DESTROY';
};

// ── 联合类型 ──
export type BridgeMessage =
  | SynMessage | Ack1Message | Ack2Message
  | CallMessage | ReplyMessage
  | NotifyMessage | StateSyncMessage
  | DestroyMessage;
```

### 2.2 能力注册 Schema（兼容主流 LLM tool-calling 格式）

设计原则：内部使用 JSON Schema draft-07 子集作为规范格式，提供零成本转换器到 OpenAI / Anthropic / Gemini / Vercel AI SDK 格式。

```typescript
// packages/shared/src/schema.ts

export interface ActionSchema {
  name: string;                    // max 64 chars, [a-zA-Z0-9_-]
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, JSONSchemaProperty>;
    required?: string[];
    additionalProperties?: false;
  };
}

export interface JSONSchemaProperty {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: string[];
  items?: JSONSchemaProperty;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
}

// ── LLM 格式转换器 ──

export function toOpenAITool(action: ActionSchema) {
  return {
    type: 'function' as const,
    function: {
      name: action.name,
      description: action.description,
      parameters: action.parameters,
      strict: true,
    },
  };
}

export function toAnthropicTool(action: ActionSchema) {
  return {
    name: action.name,
    description: action.description,
    input_schema: action.parameters,  // 唯一差异：字段名 parameters → input_schema
  };
}

export function toGeminiTool(action: ActionSchema) {
  return {
    name: action.name,
    description: action.description,
    parameters: convertTypesToUppercase(action.parameters),  // "object" → "OBJECT"
  };
}
```

**跨 LLM 兼容性矩阵**：

| | OpenAI | Anthropic | Gemini | Vercel AI SDK |
|---|---|---|---|---|
| 参数字段名 | `parameters` | `input_schema` | `parameters` | `parameters` |
| 类型字符串 | 小写 | 小写 | **大写** | 小写 (JSONSchema7) |
| 外层包装 | `{ type: 'function', function: {...} }` | 扁平 Tool 对象 | `function_declarations[]` | `{ type: 'function', ...}` |
| Schema 标准 | JSON Schema (loose) / 子集 (strict) | JSON Schema draft 2020-12 | OpenAPI 3.03 Schema | JSON Schema draft-07 |


### 2.3 握手协议（6 步对称握手）

参考 Penpal v7 的对称 SYN→ACK1→ACK2 模式，解决 iframe 加载时序竞争问题：

```
Guest (子应用)                        Host (宿主)
  │                                      │
  ├──── SYN {participantId: A} ─────────>│  ① Guest 加载完成，主动发 SYN
  │                                      │
  │<──── SYN {participantId: B} ─────────┤  ② Host 收到后也发 SYN
  │                                      │
  │  [比较 participantId: A > B → Guest 为 leader]
  │                                      │
  │── ACK1 {capabilities: [...]} ───────>│  ③ Leader 发 ACK1，携带能力清单
  │                                      │
  │<──────── ACK2 ──────────────────────-┤  ④ Non-leader 确认
  │                                      │
  │  [双方创建 MessageChannel]            │
  │  [后续通信走 port，不再走 postMessage] │
  │                                      │
  │  ══════ 连接建立完成 ══════           │
```

**关键设计决策**：

1. **双向 SYN**：双方同时发 SYN，无论谁先加载完成都能建联。Guest 的 SYN 在 Host 未就绪时会被忽略，Host 就绪后发自己的 SYN 触发流程继续。
2. **Leader 选举**：通过 participantId 字典序比较决定谁发 ACK1，避免双方同时发 ACK1 的竞争。
3. **能力随握手传递**：ACK1 携带 `capabilities: ActionSchema[]`，省去额外的能力发现往返。
4. **MessageChannel 升级**：ACK2 发送方创建 `MessageChannel`，将 `port2` 通过 `transfer` 传给对方。后续所有 CALL/REPLY/NOTIFY/STATE_SYNC 走 port 通信，origin 校验变为隐式（port 引用不可伪造）。
5. **SYN 阶段用 `'*'` origin**：SYN 不含敏感数据，安全地发到 `'*'`。ACK1 开始锁定具体 origin。

### 2.4 连接状态机

```
                    mount()
  DISCONNECTED ─────────────> CONNECTING
       ^                         │
       │                    SYN/ACK 完成
       │                         │
       │                         v
       │                     CONNECTED
       │                         │
       │              destroy() / crash / timeout
       │                         │
       └─────────────────────────┘
            (回到 DISCONNECTED)

  额外状态：ERROR（握手超时或沙盒崩溃，可通过 retry 回到 CONNECTING）
```

```typescript
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ConnectionStateEvent {
  previous: ConnectionState;
  current: ConnectionState;
  error?: Error;
}
```


---

## 三、模块详细设计

### 3.1 Client SDK（@agent-bridge/client）

**目标**：零依赖，<5KB gzip，AI 生成的代码可直接使用。

#### 核心 API

```typescript
// packages/client/src/client.ts

export class BridgeClient {
  private queue: OfflineQueue;
  private connected: boolean = false;
  private actions: Map<string, RegisteredAction> = new Map();
  private transport: ClientTransport;
  private participantId: string;

  constructor(options?: { channel?: string });

  /** 发起跨边界握手（PRD 需求 2.0） */
  async initialize(): Promise<void>;

  /** 注册可被 AI 调用的能力（PRD 需求 2.1） */
  registerAction(
    name: string,
    description: string,
    parameterSchema: ActionSchema['parameters'],
    callback: (params: Record<string, unknown>) => unknown | Promise<unknown>
  ): void;

  /** 上报用户交互事件（PRD 需求 2.2） */
  notifyHost(
    eventName: string,
    eventData: Record<string, unknown>,
    suggestion?: string   // 隐式 prompt
  ): void;

  /** 同步状态快照（PRD 需求 2.3） */
  syncState(snapshot: Record<string, unknown>): void;

  /** 销毁连接 */
  destroy(): void;
}

interface RegisteredAction {
  schema: ActionSchema;
  callback: (params: Record<string, unknown>) => unknown | Promise<unknown>;
}
```

#### 离线消息队列（PRD 需求 2.0 "离线消息队列"）

握手完成前的所有 registerAction / notifyHost / syncState 调用被暂存，握手成功后按序重放：

```typescript
// packages/client/src/queue.ts

export class OfflineQueue {
  private buffer: BridgeMessage[] = [];
  private flushed = false;

  enqueue(msg: BridgeMessage): void {
    if (this.flushed) {
      throw new Error('Cannot enqueue after flush — connection already established');
    }
    this.buffer.push(msg);
  }

  flush(send: (msg: BridgeMessage) => void): void {
    for (const msg of this.buffer) {
      send(msg);
    }
    this.buffer = [];
    this.flushed = true;
  }

  get size(): number {
    return this.buffer.length;
  }
}
```

#### Client Transport

```typescript
// packages/client/src/transport.ts

export class ClientTransport implements Transport {
  private port: MessagePort | null = null;
  private handlers: Set<(msg: BridgeMessage) => void> = new Set();

  /** 握手阶段：通过 window.parent.postMessage 发送 */
  sendViaWindow(message: BridgeMessage): void {
    window.parent.postMessage(message, '*');  // SYN 阶段安全
  }

  /** 握手完成后：升级到 MessageChannel port */
  upgradeToPort(port: MessagePort): void {
    this.port = port;
    port.addEventListener('message', (e) => {
      if (isValidBridgeMessage(e.data)) {
        this.handlers.forEach(h => h(e.data));
      }
    });
    port.start();
  }

  send(message: BridgeMessage): void {
    if (this.port) {
      this.port.postMessage(message);
    } else {
      this.sendViaWindow(message);
    }
  }

  onMessage(handler: (msg: BridgeMessage) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  destroy(): void {
    this.port?.close();
    this.port = null;
    this.handlers.clear();
  }
}
```


### 3.2 Host SDK（@agent-bridge/host）

#### 核心 API

```typescript
// packages/host/src/host.ts

export class AgentBridgeHost {
  private connections: Map<string, Connection> = new Map();
  private capabilitiesListeners: Set<(connId: string, caps: ActionSchema[]) => void> = new Set();
  private notificationListeners: Set<(connId: string, event: NotificationEvent) => void> = new Set();
  private stateSyncListeners: Set<(connId: string, snapshot: Record<string, unknown>) => void> = new Set();

  /** 挂载子应用（PRD 需求 1.0） */
  async mount(source: MountSource, config: SandboxConfig): Promise<Connection> {
    // 1. 根据 source.type 选择 IframeSandbox 或 InlineSandbox
    // 2. 创建沙盒，挂载到 config.container
    // 3. 创建 Connection，发起握手
    // 4. 等待握手完成（或超时抛错）
    // 5. 返回 Connection 实例
  }

  /** 卸载子应用 */
  unmount(connectionId: string): void {
    const conn = this.connections.get(connectionId);
    if (!conn) return;
    conn.destroy();
    this.connections.delete(connectionId);
  }

  /** 向子应用下发指令（PRD 需求 1.3） */
  async executeAction(
    connectionId: string,
    actionName: string,
    parameters: Record<string, unknown>,
    options?: { timeout?: number }
  ): Promise<unknown> {
    const conn = this.getConnectedOrThrow(connectionId);
    return conn.executeAction(actionName, parameters, options?.timeout);
  }

  /** 订阅：子应用注册能力（PRD 需求 1.2） */
  onCapabilitiesRegistered(
    callback: (connectionId: string, capabilities: ActionSchema[]) => void
  ): () => void;

  /** 订阅：子应用上报事件 */
  onNotification(
    callback: (connectionId: string, event: NotificationEvent) => void
  ): () => void;

  /** 订阅：子应用状态同步 */
  onStateSync(
    callback: (connectionId: string, snapshot: Record<string, unknown>) => void
  ): () => void;

  /** 获取指定连接的能力清单（用于转发给 LLM） */
  getCapabilities(connectionId: string): ActionSchema[];

  /** 获取所有连接的能力清单（聚合后转发给 LLM） */
  getAllCapabilities(): { connectionId: string; capabilities: ActionSchema[] }[];

  /** 销毁所有连接 */
  destroyAll(): void;
}

export interface NotificationEvent {
  eventName: string;
  eventData: Record<string, unknown>;
  suggestion?: string;
}
```

#### Connection 类（内部）

```typescript
// packages/host/src/connection.ts

export class Connection extends EventEmitter<ConnectionEvents> {
  readonly id: string;
  private state: ConnectionState = 'disconnected';
  private sandbox: Sandbox;
  private transport: HostTransport;
  private capabilities: ActionSchema[] = [];
  private pending: Map<string, PendingCall> = new Map();
  private participantId: string;

  constructor(sandbox: Sandbox, config: SandboxConfig);

  /** 发起握手 */
  async handshake(timeout: number): Promise<void> {
    this.setState('connecting');
    this.participantId = crypto.randomUUID();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.setState('error');
        reject(new BridgeError('HANDSHAKE_TIMEOUT', `Handshake timed out after ${timeout}ms`));
      }, timeout);

      // 监听 SYN → 比较 ID → 发/收 ACK1/ACK2
      this.transport.onMessage((msg) => {
        switch (msg.type) {
          case 'SYN': this.handleSyn(msg); break;
          case 'ACK1': this.handleAck1(msg, timer, resolve); break;
          case 'ACK2': this.handleAck2(msg, timer, resolve); break;
        }
      });

      // 主动发 SYN
      this.transport.send({
        type: 'SYN', namespace: NAMESPACE,
        channel: this.id, participantId: this.participantId,
        protocolVersion: '1.0', timestamp: Date.now(),
      });
    });
  }

  /** 下发指令 */
  async executeAction(name: string, params: Record<string, unknown>, timeout = 30000): Promise<unknown> {
    if (this.state !== 'connected') {
      throw new BridgeError('NOT_CONNECTED', 'Cannot execute action: not connected');
    }
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pending.delete(id);
        reject(new BridgeError('CALL_TIMEOUT', `Action "${name}" timed out after ${timeout}ms`));
      }, timeout);
      this.pending.set(id, { resolve, reject, timeoutId, actionName: name });
      this.transport.send({
        type: 'CALL', namespace: NAMESPACE, channel: this.id,
        id, actionName: name, parameters: params, timestamp: Date.now(),
      });
    });
  }

  /** 处理 REPLY */
  private handleReply(msg: ReplyMessage): void {
    const p = this.pending.get(msg.callId);
    if (!p) return;
    this.pending.delete(msg.callId);
    clearTimeout(p.timeoutId);
    msg.success ? p.resolve(msg.value) : p.reject(
      new BridgeError(msg.error.code, msg.error.message, msg.error.data)
    );
  }

  /** 销毁：清理所有 pending，关闭沙盒 */
  destroy(): void {
    // 发送 DESTROY 消息通知子应用
    if (this.state === 'connected') {
      this.transport.send({
        type: 'DESTROY', namespace: NAMESPACE,
        channel: this.id, timestamp: Date.now(),
      });
    }
    // reject 所有 pending calls
    for (const [id, p] of this.pending) {
      clearTimeout(p.timeoutId);
      p.reject(new BridgeError('CONNECTION_DESTROYED', 'Connection was destroyed'));
    }
    this.pending.clear();
    this.transport.destroy();
    this.sandbox.unmount();
    this.setState('disconnected');
  }
}

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
  actionName: string;
}

interface ConnectionEvents {
  stateChange: ConnectionStateEvent;
  capabilities: ActionSchema[];
  notification: NotificationEvent;
  stateSync: Record<string, unknown>;
}
```


### 3.3 沙盒实现

#### 沙盒抽象接口

```typescript
// packages/host/src/sandbox/types.ts

export type MountSource =
  | { type: 'uri'; url: string }                              // Remote URI 模式
  | { type: 'raw'; code: string; codeType?: 'html' | 'js' }; // 代码直出模式

export interface SandboxConfig {
  container: HTMLElement;                    // 挂载容器
  allowedOrigins?: (string | RegExp)[];     // origin 白名单
  handshakeTimeout?: number;                // 握手超时 ms，默认 10000
  sandbox?: string;                         // iframe sandbox 属性
  permissions?: string[];                   // iframe allow 属性
}

export interface Sandbox {
  mount(source: MountSource, config: SandboxConfig): HTMLIFrameElement;
  unmount(): void;
  getContentWindow(): Window | null;
  onCrash(callback: (error: Error) => void): () => void;
}
```

#### iframe 模式（Remote URI — PRD 需求 1.0）

```typescript
// packages/host/src/sandbox/iframe.ts

export class IframeSandbox implements Sandbox {
  private iframe: HTMLIFrameElement | null = null;
  private crashHandlers: Set<(error: Error) => void> = new Set();

  mount(source: MountSource & { type: 'uri' }, config: SandboxConfig): HTMLIFrameElement {
    this.iframe = document.createElement('iframe');
    this.iframe.src = source.url;
    this.iframe.sandbox = config.sandbox ?? 'allow-scripts allow-forms';
    if (config.permissions?.length) {
      this.iframe.allow = config.permissions.join('; ');
    }
    this.iframe.style.cssText = 'border:none;width:100%;height:100%';

    // 监听沙盒崩溃（PRD 需求 6.4）
    this.iframe.addEventListener('error', (e) => {
      this.crashHandlers.forEach(h => h(new Error('Sandbox iframe error')));
    });

    config.container.appendChild(this.iframe);
    return this.iframe;
  }

  unmount(): void {
    if (this.iframe) {
      this.iframe.remove();
      this.iframe = null;
    }
    this.crashHandlers.clear();
  }

  getContentWindow(): Window | null {
    return this.iframe?.contentWindow ?? null;
  }

  onCrash(callback: (error: Error) => void): () => void {
    this.crashHandlers.add(callback);
    return () => this.crashHandlers.delete(callback);
  }
}
```

#### 代码直出模式（Raw Payload — PRD 需求 1.0 + 3.0）

```typescript
// packages/host/src/sandbox/inline.ts

export class InlineSandbox implements Sandbox {
  private iframe: HTMLIFrameElement | null = null;
  private crashHandlers: Set<(error: Error) => void> = new Set();

  mount(source: MountSource & { type: 'raw' }, config: SandboxConfig): HTMLIFrameElement {
    this.iframe = document.createElement('iframe');
    this.iframe.sandbox = 'allow-scripts';  // 最小权限

    // 透明注入 Client SDK（PRD 需求 3.0 "无感注入"）
    const html = this.wrapWithClientSDK(source.code, source.codeType ?? 'html');
    this.iframe.srcdoc = html;

    this.iframe.style.cssText = 'border:none;width:100%;height:100%';
    config.container.appendChild(this.iframe);
    return this.iframe;
  }

  private wrapWithClientSDK(code: string, codeType: 'html' | 'js'): string {
    // clientBundle 是构建时内联的 @agent-bridge/client 编译产物
    const clientBundle = getInlinedClientBundle();

    if (codeType === 'html') {
      // HTML 模式：在 <head> 末尾注入 SDK
      if (code.includes('</head>')) {
        return code.replace(
          '</head>',
          `<script>${clientBundle}</script>\n</head>`
        );
      }
      // 无 head 标签：包装完整 HTML
      return `<!DOCTYPE html><html><head><script>${clientBundle}</script></head><body>${code}</body></html>`;
    }

    // JS 模式：包装成完整 HTML 文档
    return `<!DOCTYPE html><html><head><script>${clientBundle}</script></head><body><script>${code}</script></body></html>`;
  }

  unmount(): void {
    if (this.iframe) {
      this.iframe.remove();
      this.iframe = null;
    }
    this.crashHandlers.clear();
  }

  getContentWindow(): Window | null {
    return this.iframe?.contentWindow ?? null;
  }

  onCrash(callback: (error: Error) => void): () => void {
    this.crashHandlers.add(callback);
    return () => this.crashHandlers.delete(callback);
  }
}
```

**`getInlinedClientBundle()` 实现策略**：

构建时通过 tsup 的 `banner` 或自定义 esbuild plugin，将 `@agent-bridge/client` 的 minified 产物作为字符串常量内联到 host 包中。这样 host 包可以在运行时将 client SDK 注入到 srcdoc 中，无需网络请求。

```typescript
// packages/host/tsup.config.ts 中的构建时处理
import { readFileSync } from 'fs';

// 构建时读取 client 产物，作为字符串嵌入
const clientBundle = readFileSync('../client/dist/index.global.js', 'utf-8');

export default defineConfig({
  // ...
  define: {
    __CLIENT_BUNDLE__: JSON.stringify(clientBundle),
  },
});

// packages/host/src/sandbox/inline.ts 中使用
declare const __CLIENT_BUNDLE__: string;
function getInlinedClientBundle(): string {
  return __CLIENT_BUNDLE__;
}
```


### 3.4 Transport 抽象层

```typescript
// packages/shared/src/protocol.ts（追加）

export interface Transport {
  send(message: BridgeMessage, transferables?: Transferable[]): void;
  onMessage(handler: (message: BridgeMessage) => void): () => void;
  destroy(): void;
}
```

宿主侧 Transport 实现：

```typescript
// packages/host/src/transport.ts

export class HostTransport implements Transport {
  private port: MessagePort | null = null;
  private handlers: Set<(msg: BridgeMessage) => void> = new Set();
  private windowListener: ((e: MessageEvent) => void) | null = null;
  private targetWindow: Window;
  private allowedOrigins: (string | RegExp)[];
  private concreteOrigin: string | null = null;

  constructor(targetWindow: Window, allowedOrigins: (string | RegExp)[]) {
    this.targetWindow = targetWindow;
    this.allowedOrigins = allowedOrigins;

    // 握手阶段：监听 window message 事件
    this.windowListener = (e: MessageEvent) => {
      if (!this.isAllowedOrigin(e.origin)) return;
      if (!isValidBridgeMessage(e.data)) return;

      // 锁定具体 origin（首次 SYN 后）
      if (e.data.type === 'SYN' && !this.concreteOrigin) {
        this.concreteOrigin = e.origin;
      }

      this.handlers.forEach(h => h(e.data));
    };
    window.addEventListener('message', this.windowListener);
  }

  /** 创建 MessageChannel 并升级（握手完成时调用） */
  upgradeToMessageChannel(): MessagePort {
    const { port1, port2 } = new MessageChannel();
    this.port = port1;
    port1.addEventListener('message', (e) => {
      if (isValidBridgeMessage(e.data)) {
        this.handlers.forEach(h => h(e.data));
      }
    });
    port1.start();

    // 停止监听 window message
    if (this.windowListener) {
      window.removeEventListener('message', this.windowListener);
      this.windowListener = null;
    }

    return port2; // 通过 ACK2 的 transfer 传给子应用
  }

  send(message: BridgeMessage, transferables?: Transferable[]): void {
    if (this.port) {
      this.port.postMessage(message, { transfer: transferables ?? [] });
    } else {
      const origin = message.type === 'SYN' ? '*' : (this.concreteOrigin ?? '*');
      this.targetWindow.postMessage(message, origin, transferables ?? []);
    }
  }

  onMessage(handler: (msg: BridgeMessage) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private isAllowedOrigin(origin: string): boolean {
    return this.allowedOrigins.some(allowed =>
      allowed instanceof RegExp ? allowed.test(origin)
        : allowed === origin || allowed === '*'
    );
  }

  destroy(): void {
    if (this.windowListener) {
      window.removeEventListener('message', this.windowListener);
    }
    this.port?.close();
    this.port = null;
    this.handlers.clear();
  }
}
```

### 3.5 消息校验与类型守卫

```typescript
// packages/shared/src/guards.ts

export function isValidBridgeMessage(data: unknown): data is BridgeMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    'namespace' in data &&
    (data as any).namespace === NAMESPACE &&
    'type' in data &&
    typeof (data as any).type === 'string'
  );
}

export function isSynMessage(msg: BridgeMessage): msg is SynMessage {
  return msg.type === 'SYN';
}

export function isAck1Message(msg: BridgeMessage): msg is Ack1Message {
  return msg.type === 'ACK1';
}

export function isCallMessage(msg: BridgeMessage): msg is CallMessage {
  return msg.type === 'CALL';
}

export function isReplyMessage(msg: BridgeMessage): msg is ReplyMessage {
  return msg.type === 'REPLY';
}

export function isNotifyMessage(msg: BridgeMessage): msg is NotifyMessage {
  return msg.type === 'NOTIFY';
}

export function isStateSyncMessage(msg: BridgeMessage): msg is StateSyncMessage {
  return msg.type === 'STATE_SYNC';
}
```

### 3.6 错误体系

```typescript
// packages/shared/src/errors.ts

export type BridgeErrorCode =
  | 'HANDSHAKE_TIMEOUT'       // 握手超时
  | 'CALL_TIMEOUT'            // 指令执行超时
  | 'NOT_CONNECTED'           // 未建立连接就尝试操作
  | 'CONNECTION_DESTROYED'    // 连接已销毁
  | 'ACTION_NOT_FOUND'        // 子应用未注册该 action
  | 'ACTION_EXECUTION_ERROR'  // 子应用执行 action 时抛错
  | 'INVALID_PARAMETERS'      // 参数不符合 schema
  | 'SANDBOX_CRASH'           // 沙盒崩溃
  | 'PROTOCOL_ERROR';         // 协议层错误

export class BridgeError extends Error {
  readonly code: BridgeErrorCode;
  readonly data?: unknown;

  constructor(code: BridgeErrorCode, message: string, data?: unknown) {
    super(message);
    this.name = 'BridgeError';
    this.code = code;
    this.data = data;
  }

  toJSON() {
    return { code: this.code, message: this.message, data: this.data };
  }
}
```


---

## 四、非功能性设计

### 4.1 安全与隔离（PRD 需求 6.1）

| 层级 | 措施 | 实现 |
|------|------|------|
| 沙盒隔离 | iframe `sandbox` 属性 | 默认 `allow-scripts allow-forms`，代码直出模式仅 `allow-scripts` |
| Origin 校验 | `allowedOrigins` 白名单 | `(string \| RegExp)[]`，SYN 阶段锁定具体 origin |
| 通信防线 | MessageChannel 升级 | 握手后所有通信走 port，port 引用不可伪造 |
| 命名空间隔离 | `namespace: 'agent-bridge'` | 所有消息必须携带，首层过滤非本协议消息 |
| 子应用隔离 | `channel` 字段 | 多子应用场景下按 channel 路由，互不干扰 |

### 4.2 容错与恢复（PRD 需求 6.4）

**指令执行超时**：
- `executeAction` 默认 30s 超时，可配置
- 超时后自动 reject Promise，从 pending map 中清除
- 不会阻塞宿主主线程（iframe 天然隔离）

**沙盒崩溃处理**：
- 监听 iframe `error` 事件和 `unload` 事件
- 崩溃时：reject 所有 pending calls → 触发 `onCrash` 回调 → 状态转为 `error`
- 宿主可选择 `unmount` + 重新 `mount` 实现热重启

**连接断开恢复**：
- DESTROY 消息通知对方主动断开
- 意外断开（如 iframe 被移除）通过 heartbeat 检测（v0.2 考虑）

### 4.3 技术栈无关（PRD 需求 6.2）

- Client SDK 纯 TypeScript，零框架依赖
- Host SDK 仅依赖 DOM API（`document.createElement`、`postMessage`、`MessageChannel`）
- 不绑定任何 UI 框架（React/Vue/Svelte）
- Transport 接口抽象，未来可扩展 WebSocket / SharedWorker 等传输层

### 4.4 极端轻量化（PRD 需求 6.3）

**Client SDK 体积控制策略**：

| 策略 | 实现 |
|------|------|
| 零依赖 | `dependencies: {}` — 无任何第三方包 |
| 仅 `import type` 引用 shared | 编译后无运行时引用，类型在 .d.ts 中 |
| tsup minify | esbuild minify，单文件产出 |
| 无 sourcemap | 生产构建跳过 sourcemap |
| 代码精简 | 仅包含：握手、消息收发、队列、注册 — 无多余抽象 |

**体积预估**：
- `BridgeClient` 类 + `OfflineQueue` + `ClientTransport` + 类型守卫 ≈ 2-3KB minified ≈ <1.5KB gzip
- 远低于 5KB gzip 目标

---

## 五、构建与工程配置

### 5.1 Root package.json

```json
{
  "private": true,
  "scripts": {
    "build": "pnpm -r build",
    "build:client": "pnpm --filter @agent-bridge/client build",
    "build:host": "pnpm --filter @agent-bridge/host build",
    "dev": "pnpm -r --parallel dev",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "pnpm -r typecheck",
    "clean": "pnpm -r exec rm -rf dist",
    "pretest": "pnpm -r build"
  },
  "engines": {
    "node": ">=22",
    "pnpm": ">=9"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "tsup": "^8.0.0",
    "vitest": "^3.0.0"
  }
}
```

### 5.2 tsconfig.base.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true
  }
}
```

### 5.3 Client tsup 配置（体积优先）

```typescript
// packages/client/tsup.config.ts
import { defineConfig } from 'tsup';

export default defineConfig([
  // ESM + CJS（npm 分发）
  {
    entry: { index: 'src/index.ts' },
    format: ['cjs', 'esm'],
    dts: true,
    clean: true,
    treeshake: true,
    minify: true,
    splitting: false,
    sourcemap: false,
    external: [],
  },
  // IIFE（用于 host 内联注入到 srcdoc）
  {
    entry: { 'index.global': 'src/index.ts' },
    format: ['iife'],
    globalName: 'AgentBridgeClient',
    clean: false,
    treeshake: true,
    minify: true,
    splitting: false,
    sourcemap: false,
  },
]);
```

### 5.4 package.json exports（双格式发布）

```json
{
  "name": "@agent-bridge/client",
  "version": "0.1.0",
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.mts", "default": "./dist/index.mjs" },
      "require": { "types": "./dist/index.d.ts", "default": "./dist/index.js" }
    }
  },
  "files": ["dist", "README.md"],
  "dependencies": {},
  "devDependencies": {
    "@agent-bridge/shared": "workspace:*"
  }
}
```

### 5.5 Vitest 配置

```typescript
// vitest.config.ts (root)
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*'],
  },
});
```

```typescript
// packages/shared/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    restoreMocks: true,
  },
});
```

```typescript
// packages/host/vitest.config.ts（需要 DOM 环境）
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    restoreMocks: true,
  },
});
```


---

## 六、实现分阶段计划

### Phase 0：项目脚手架（预计 0.5 天）

**目标**：可构建、可测试的空 monorepo 骨架。

| 步骤 | 产出 | 验收标准 |
|------|------|----------|
| 0.1 初始化 pnpm workspace | `pnpm-workspace.yaml`、root `package.json` | `pnpm install` 成功 |
| 0.2 创建 3 个包目录 | `packages/{shared,client,host}/` 各含 `package.json`、`tsconfig.json`、`tsup.config.ts`、`src/index.ts` | `pnpm -r build` 全部成功 |
| 0.3 配置 vitest | root `vitest.config.ts` + 各包 vitest 配置 | `pnpm test` 运行通过（空测试） |
| 0.4 配置 tsconfig.base.json | 共享编译选项 | `pnpm -r typecheck` 通过 |

### Phase 1：共享协议层 @agent-bridge/shared（预计 1 天）

**目标**：定义所有跨边界通信的类型契约。

| 步骤 | 产出 | 验收标准 |
|------|------|----------|
| 1.1 消息协议类型 | `protocol.ts` — 全部 BridgeMessage 联合类型 | 类型编译通过 |
| 1.2 能力 Schema 类型 | `schema.ts` — ActionSchema + JSONSchemaProperty + LLM 转换器 | 单测：转换器输出符合 OpenAI/Anthropic/Gemini 格式 |
| 1.3 类型守卫 | `guards.ts` — isValidBridgeMessage + 各消息类型守卫 | 单测：正确识别/拒绝各类消息 |
| 1.4 错误体系 | `errors.ts` — BridgeError + BridgeErrorCode | 类型编译通过 |
| 1.5 常量 | `constants.ts` — NAMESPACE、默认超时值 | 导出正确 |

### Phase 2：Client SDK @agent-bridge/client（预计 1.5 天）

**目标**：零依赖、<5KB gzip 的子应用端 SDK。

| 步骤 | 产出 | 验收标准 |
|------|------|----------|
| 2.1 OfflineQueue | `queue.ts` | 单测：enqueue → flush 按序重放；flush 后 enqueue 抛错 |
| 2.2 ClientTransport | `transport.ts` — window.postMessage + MessageChannel 升级 | 单测：mock postMessage 验证发送/接收 |
| 2.3 BridgeClient 核心 | `client.ts` — initialize / registerAction / notifyHost / syncState / destroy | 集成测试：模拟握手流程 |
| 2.4 IIFE 构建 | tsup IIFE 产出 `index.global.js` | 构建成功，`ls -lh` 确认 <5KB gzip |
| 2.5 导出验证 | `index.ts` 导出所有公共 API | `import { BridgeClient } from '@agent-bridge/client'` 编译通过 |

### Phase 3：Host SDK @agent-bridge/host（预计 2 天）

**目标**：完整的宿主端 SDK，支持双模式挂载。

| 步骤 | 产出 | 验收标准 |
|------|------|----------|
| 3.1 Sandbox 抽象 | `sandbox/types.ts` — Sandbox 接口 + MountSource + SandboxConfig | 类型编译通过 |
| 3.2 IframeSandbox | `sandbox/iframe.ts` — Remote URI 模式 | 单测（jsdom）：创建 iframe、设置属性、unmount 清理 |
| 3.3 InlineSandbox | `sandbox/inline.ts` — Raw Payload 模式 + Client SDK 注入 | 单测：srcdoc 包含 client bundle；HTML/JS 两种 codeType 正确包装 |
| 3.4 HostTransport | `transport.ts` — origin 校验 + MessageChannel 升级 | 单测：origin 白名单过滤、port 升级后消息路由 |
| 3.5 Connection | `connection.ts` — 状态机 + 握手 + executeAction + pending 管理 | 集成测试：完整握手流程、超时处理、destroy 清理 |
| 3.6 AgentBridgeHost | `host.ts` — mount/unmount/executeAction/事件订阅 | 集成测试：mount → 握手 → executeAction → unmount 全流程 |
| 3.7 Client Bundle 内联 | tsup 构建时 define `__CLIENT_BUNDLE__` | 构建成功，InlineSandbox 可获取 client 代码 |

### Phase 4：端到端集成测试（预计 1 天）

**目标**：验证 Host ↔ Client 完整通信链路。

| 步骤 | 产出 | 验收标准 |
|------|------|----------|
| 4.1 握手 E2E | 测试：Host mount → Client initialize → 连接建立 | 状态从 connecting → connected |
| 4.2 能力注册 E2E | 测试：Client registerAction → Host onCapabilitiesRegistered 触发 | Host 收到正确的 ActionSchema[] |
| 4.3 指令执行 E2E | 测试：Host executeAction → Client callback 执行 → 结果返回 | Host 收到正确返回值 |
| 4.4 事件上报 E2E | 测试：Client notifyHost → Host onNotification 触发 | Host 收到 eventName + eventData + suggestion |
| 4.5 状态同步 E2E | 测试：Client syncState → Host onStateSync 触发 | Host 收到完整 snapshot |
| 4.6 超时与错误 E2E | 测试：executeAction 超时、action 执行抛错 | 正确的 BridgeError code |
| 4.7 销毁 E2E | 测试：Host unmount → Client 收到 DESTROY → 清理 | 无内存泄漏，pending 全部 reject |
| 4.8 离线队列 E2E | 测试：Client 在握手前 registerAction → 握手后 Host 收到能力 | 队列按序重放 |
| 4.9 双模式 E2E | 测试：分别用 URI 模式和 Raw Payload 模式完成全流程 | 两种模式行为一致 |

### Phase 5：文档与示例（预计 0.5 天）

| 步骤 | 产出 |
|------|------|
| 5.1 README.md | 项目介绍、快速开始、API 概览 |
| 5.2 Host SDK 使用示例 | 最小可运行的宿主端代码 |
| 5.3 Client SDK 使用示例 | 最小可运行的子应用代码 |
| 5.4 LLM 集成示例 | 展示如何将 capabilities 转为 OpenAI tool-calling 格式并路由回 guest |

---

## 七、关键设计决策记录

| # | 决策 | 理由 | 替代方案 | 否决原因 |
|---|------|------|----------|----------|
| D1 | 对称 SYN 握手（Penpal 模式） | 解决 iframe 加载时序竞争，无需轮询 | 单向 HELLO（post-robot 模式） | 单向模式需要 Host 先就绪，不适合代码直出场景 |
| D2 | MessageChannel 升级 | 握手后消除 origin 伪造风险 | 始终用 window.postMessage | 每条消息都需 origin 校验，性能和安全均不如 port |
| D3 | 能力随 ACK1 传递 | 省去额外的 CAPABILITIES 消息往返 | 握手后单独发 CAPABILITIES | 增加一次 RTT，且握手时能力已确定 |
| D4 | JSON Schema draft-07 子集作为内部格式 | 与 Vercel AI SDK 一致，转换到各 LLM 格式成本最低 | OpenAPI Schema / 自定义格式 | OpenAPI 需大写类型字符串，自定义格式增加学习成本 |
| D5 | Client SDK 构建 IIFE 产物 | 支持 Host 内联注入到 srcdoc | 仅 ESM/CJS | 代码直出模式需要在 script 标签中直接执行 |
| D6 | tsup 而非 unbuild/rollup | 3M 周下载量，esbuild 驱动，单命令双格式+dts | unbuild（Nuxt 生态）/ rollup（更灵活） | unbuild 社区较小；rollup 配置复杂度高 |
| D7 | 不使用 TypeScript project references | 3 包规模下维护成本 > 收益 | 启用 references | 10+ 包时再考虑 |

---

## 八、风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| srcdoc 模式下 origin 为 `'null'`（opaque origin） | 代码直出模式无法做 origin 校验 | 高 | 依赖 MessageChannel 升级后的 port 通信；握手阶段 allowedOrigins 需显式包含 `'*'` |
| Client SDK 体积超标 | 影响 AI 生成场景的加载速度 | 低 | 构建后自动检查 gzip 体积，CI 中设置 5KB 阈值 |
| 子应用死循环导致 iframe 无响应 | executeAction 永远不返回 | 中 | 超时机制兜底；未来可考虑 Web Worker 隔离计算密集型 action |
| 多子应用并发时 channel 路由错误 | 指令发到错误的子应用 | 低 | channel 使用 UUID，消息校验包含 channel 匹配 |
| 浏览器兼容性（MessageChannel） | 极老浏览器不支持 | 极低 | MessageChannel 在所有现代浏览器中均支持（IE10+） |

---

## 九、PRD 需求追溯矩阵

| PRD 需求 | 实现位置 | Phase |
|----------|----------|-------|
| 1.0 异构挂载源 | `IframeSandbox` + `InlineSandbox` | Phase 3 |
| 1.1 握手与连接管理 | `Connection.handshake()` + 状态机 | Phase 3 |
| 1.2 能力发现 | `onCapabilitiesRegistered` + ACK1 携带 capabilities | Phase 3 |
| 1.3 指令下发与追踪 | `Connection.executeAction()` + pending map | Phase 3 |
| 2.0 自动建联 + 离线队列 | `BridgeClient.initialize()` + `OfflineQueue` | Phase 2 |
| 2.1 能力注册 | `BridgeClient.registerAction()` | Phase 2 |
| 2.2 事件上报 | `BridgeClient.notifyHost()` | Phase 2 |
| 2.3 状态同步 | `BridgeClient.syncState()` | Phase 2 |
| 3.0 无感注入 | `InlineSandbox.wrapWithClientSDK()` + IIFE 构建 | Phase 3 |
| 3.1 独立引入 | npm 包 `@agent-bridge/client` ESM/CJS 分发 | Phase 2 |
| 6.1 安全隔离 | iframe sandbox + origin 校验 + MessageChannel | Phase 3 |
| 6.2 技术栈无关 | 零框架依赖，纯 DOM API | 全局 |
| 6.3 极端轻量 | 零依赖 + minify + IIFE | Phase 2 |
| 6.4 容错恢复 | 超时机制 + destroy 清理 + onCrash | Phase 3 |

