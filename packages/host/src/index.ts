export { AgentBridgeHost } from './host.js';
export { Connection } from './connection.js';
export { HostTransport } from './transport.js';
export { IframeSandbox } from './sandbox/iframe.js';
export { InlineSandbox } from './sandbox/inline.js';
export type { Sandbox } from './sandbox/types.js';

export type {
  ActionSchema,
  MountSource,
  SandboxConfig,
  ConnectionState,
  ConnectionStateEvent,
  NotificationEvent,
  BridgeMessage,
} from '@agent_bridge/shared';
export { toOpenAITool, toAnthropicTool, toGeminiTool } from '@agent_bridge/shared';
export { BridgeError } from '@agent_bridge/shared';
export type { BridgeErrorCode } from '@agent_bridge/shared';
