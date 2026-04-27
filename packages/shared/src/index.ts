export {
  NAMESPACE,
  PROTOCOL_VERSION,
  DEFAULT_HANDSHAKE_TIMEOUT,
  DEFAULT_CALL_TIMEOUT,
} from '@agent_bridge/protocol';

export type {
  ActionSchema,
  JSONSchemaProperty,
  SynMessage,
  Ack1Message,
  Ack2Message,
  CallMessage,
  ReplyMessage,
  NotifyMessage,
  StateSyncMessage,
  CapabilitiesUpdateMessage,
  DestroyMessage,
  PeerMessage,
  PeerMessageDelivery,
  BroadcastMessage,
  PeerListRequest,
  PeerListResponse,
  PeerChangeNotification,
  PeerInfo,
  BridgeMessage,
  BridgeMessageType,
  ConnectionState,
  ConnectionStateEvent,
  NotificationEvent,
  Transport,
  MountSource,
  SandboxConfig,
  AgentIdentity,
  TransportPreference,
  CapabilitiesDeclaration,
  ComplianceLevel,
  MessageSerializer,
  ConnectableTransport,
  ListenableTransport,
} from '@agent_bridge/protocol';

export {
  isValidBridgeMessage,
  isSynMessage,
  isAck1Message,
  isAck2Message,
  isCallMessage,
  isReplyMessage,
  isNotifyMessage,
  isStateSyncMessage,
  isCapabilitiesUpdateMessage,
  isDestroyMessage,
  isPeerMessage,
  isPeerMessageDelivery,
  isBroadcastMessage,
  isPeerListRequest,
  isPeerListResponse,
  isPeerChangeNotification,
  BridgeError,
  JSONSerializer,
  COMPLIANCE_REQUIREMENTS,
} from '@agent_bridge/protocol';

export type { BridgeErrorCode } from '@agent_bridge/protocol';

// LLM converters (unique to shared — not part of core protocol)
export { toOpenAITool, toAnthropicTool, toGeminiTool } from './schema.js';
