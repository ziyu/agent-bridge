# AgentBridge SDK 产品需求与架构设计文档

**文档版本**：v1.0
**当前日期**：2026年3月14日
**主题**：基于控制反转（IoC）的生成式智能体应用（Agentic UI）集成标准基石

## 1. 产品愿景与背景
在“大模型（LLM）+ 生成式 UI”的时代，应用形态正在从“静态预编码”向“运行时动态生成”演进。
**AgentBridge SDK** 旨在提供一套标准化的、极轻量的集成基石。它的核心目标是：让任何宿主应用（Host）都能在运行时安全地挂载 AI 动态生成的子应用（Guest），并建立一条让人类、子应用、AI 三者之间无缝交互的双向数据桥梁。

**核心设计哲学：极致解耦与控制反转（IoC）**
动态生成的子应用不应包含任何网络请求、大模型 API 调用或复杂的上下文管理逻辑。子应用只需声明“我能被 AI 怎么操作”以及“人类对我做了什么”，所有的复杂调度均由宿主环境通过 AgentBridge 统一接管。

---

## 2. 核心术语定义 (Terminology)
*   **Host App（宿主应用）**：集成了底层大模型能力的基础环境（如 Terminal 客户端、SaaS Dashboard、游戏大厅）。负责生命周期管理、LLM 会话维护及沙盒资源分配。
*   **Guest App（子应用/生成应用）**：由 AI 动态生成（或预置）的 UI/逻辑载体。它可以是一段纯代码字符串，也可以是一个远程服务地址（URI）。
*   **AgentBridge Host SDK**：运行在宿主环境的基石组件，负责沙盒控制和跨边界通信调度。
*   **AgentBridge Client SDK**：运行在子应用环境的微型代理，负责向上层 UI 暴露标准接口，并向下屏蔽跨边界通信细节。

---

## 3. 总体系统架构设计 (System Architecture)

系统被严格划分为三个逻辑层，强制要求层与层之间通过标准化契约（Contract）通信。

```text
┌─────────────────────────────────────────────────────────────┐
│                       Host Environment                      │
│                                                             │
│  ┌──────────────┐     ┌──────────────────────────────────┐  │
│  │              │     │       AgentBridge Host SDK       │  │
│  │ LLM Provider │<───>│ - Sandbox Lifecycle Management   │  │
│  │              │     │ - Connection & Handshake Control │  │
│  └──────────────┘     │ - Action Routing                 │  │
│                       └──────────────────────────────────┘  │
└─────────────────────────────────┬───────────────────────────┘
                                  │[ 严格的安全隔离边界 / Cross-boundary Communication Channel ]
                                  │
┌─────────────────────────────────┴───────────────────────────┐
│                       Guest Environment (Sandbox)           │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                 AgentBridge Client SDK                │  │
│  │ - Registration API | Notification API | State API     │  │
│  └──────────────────────────┬────────────────────────────┘  │
│                             │                               │
│  ┌──────────────────────────┴────────────────────────────┐  │
│  │     Dynamic Generated UI & Business Logic Layer       │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. 功能性需求 (Functional Requirements)

### 4.1 宿主端集成需求 (Host SDK)

**需求 1.0：异构挂载源支持 (Heterogeneous Mount Sources)**
*   系统必须支持至少两种子应用加载模式：
    *   **代码直出模式 (Raw Payload)**：直接接收并执行 AI 生成的原始 UI/业务逻辑代码片段。
    *   **远程地址模式 (Remote URI)**：加载已在远端部署或生成的应用资源地址。
*   系统必须为两种模式提供抹平差异的统一生命周期管理接口（Mount / Unmount）。

**需求 1.1：跨边界握手与连接状态管理 (Handshake & Connection Management)**
*   SDK 必须提供可靠的异步建联机制。在子应用完全加载并准备好之前，宿主不得下发操作指令。
*   必须暴露出状态监听接口，允许宿主应用感知子应用的连接状态（Connecting, Connected, Disconnected, Error）。

**需求 1.2：工具与能力发现 (Capability Discovery)**
*   宿主必须能够接收到子应用在运行时注册的所有“AI 工具/能力”清单，并提取其标准化的描述规范（Schema），以便宿主将其转发给 LLM。

**需求 1.3：指令下发与执行追踪 (Instruction Dispatch & Trace)**
*   宿主必须能够将 LLM 生成的操作指令（Tool Calling）精确路由至指定的子应用，并触发其相应的回调。
*   系统需支持异步指令的执行结果追踪，能够捕获子应用执行指令后的成功返回值或异常报错，并回传给宿主。

### 4.2 子应用端能力需求 (Client SDK)

**需求 2.0：环境探针与自动建联 (Auto-Bootstrap)**
*   Client SDK 必须具备独立运行的能力，通过调用初始化方法主动向宿主发起握手请求。
*   需内置“离线消息队列”机制：在握手成功前，子应用发起的任何注册请求或通知行为均需被安全暂存，待握手成功后按序重放，防止时序导致的事件丢失。

**需求 2.1：能力注册暴露 (Registration Interface)**
*   提供注册接口，允许子应用向宿主声明自身具备的“被控能力”。
*   注册要素必须包含：指令唯一标识、人类可读/大模型可读的自然语言描述、参数结构约束（Schema），以及具体的执行回调函数。

**需求 2.2：意图与事件上报 (Notification Interface)**
*   提供事件通知接口，让人类在子应用内的交互（如点击按钮、拖拽元素、输入文本）能上报给宿主。
*   上报要素必须包含：事件行为标识、结构化业务数据，以及**隐式提示语（Prompt）**（如：“人类刚刚落了一颗黑子，请你分析局势并决定下一步”）。

**需求 2.3：状态镜像同步 (State Synchronization)**
*   提供状态同步接口，允许子应用在自身内部状态发生变动时，将最新的“全局状态树”镜像同步给宿主，以保证 LLM 在任何时刻介入时均能获取最新上下文。

### 4.3 注入与分发需求 (Distribution & Injection)

**需求 3.0：无感注入机制 (Transparent Injection)**
*   在“代码直出模式”下，Host SDK 必须提供机制，将 Client SDK 的核心逻辑透明地包装或注入到 AI 生成的代码中，使得 AI 侧的代码产出极简，无需手动引入 SDK 包。

**需求 3.1：独立引入机制 (Standalone Import)**
*   在“远程地址模式”下，Client SDK 必须提供标准化的包分发方式（如通用依赖包管理器形式），允许复杂子应用作为标准第三方依赖进行显式集成。

---

## 5. 接口契约定义 (Interface Contract)

本部分定义各核心模块对外提供的逻辑抽象接口。

### 5.1 Host 暴露的逻辑接口

*   `mount(sourceContext, sandboxConfig)` -> `Promise<Connection>`
    根据来源（代码或 URI）及沙盒配置挂载应用，返回建立连接的 Promise。
*   `unmount(connectionId)` -> `void`
    销毁对应的沙盒环境并清理内存与通信监听。
*   `executeGuestAction(actionName, parameters)` -> `Promise<Result>`
    向子应用下发动作指令，并等待其内部回调执行完毕。
*   `onGuestCapabilitiesRegistered(callback(CapabilitiesSchema))`
    事件订阅：当子应用上报其能力列表时触发。
*   `onGuestNotification(callback(NotificationEvent))`
    事件订阅：当子应用上报人类交互事件时触发。

### 5.2 Client 暴露的逻辑接口

*   `initialize()` -> `Promise<void>`
    发起跨边界握手。
*   `registerAction(name, description, parameterSchema, executeCallback)` -> `void`
    向外界注册自身可被 AI 调用的能力。
*   `notifyHost(eventName, eventData, optionalSuggestion)` -> `void`
    主动通知外界发生了重要的用户交互。
*   `syncState(snapshotTree)` -> `void`
    同步当前子应用状态快照。

---

## 6. 非功能性需求 (Non-Functional Requirements)

**6.1 绝对安全与隔离 (Security & Isolation)**
*   **宿主防线**：子应用的运行环境必须受到严格的物理或逻辑隔离（Sandbox）。子应用在任何情况下均不得获取宿主环境的全局变量、本地存储及敏感运行上下文。
*   **通信防线**：所有跨边界的通信必须经过严格的源（Origin）校验与身份凭证检查，拒绝一切未授权的跨域指令注入（防 XSS 扩大化）。

**6.2 技术栈不可知 (Agnostic Design)**
*   SDK 必须与具体的 UI 渲染框架（React/Vue/Svelte 等）完全解耦。
*   SDK 的设计必须与底层通信媒介解耦（无论底层是 `postMessage`、WebSockets 还是底层的内存管道，抽象接口均保持不变）。

**6.3 极端轻量化 (Ultra-lightweight Client)**
*   为了确保在受限环境或 AI 极速生成的场景中能够秒级加载，Client SDK 的编译产物体积必须严格控制，且**严禁引入任何第三方外部依赖**，必须基于平台原生能力实现基础功能。

**6.4 容错与恢复机制 (Fault Tolerance)**
*   指令执行超时控制：当宿主调用 `executeGuestAction` 时，若子应用内部逻辑发生死循环或无响应，系统必须具备超时阻断机制，防止宿主主线程被挂起。
*   隔离区崩溃处理：沙盒环境崩溃（如 OOM）不得影响宿主环境的稳定性，宿主需能够捕获崩溃事件并支持应用的“热重启”。