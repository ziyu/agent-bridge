// ── Constants ──
export { NAMESPACE, PROTOCOL_VERSION, DEFAULT_HANDSHAKE_TIMEOUT, DEFAULT_CALL_TIMEOUT } from './constants.js';

// ── Messages (core protocol types) ──
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
  AgentIdentityPayload,
  ConnectionState,
  ConnectionStateEvent,
  NotificationEvent,
  MountSource,
  SandboxConfig,
} from './messages.js';

// ── Guards ──
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
} from './guards.js';

// ── Errors ──
export { BridgeError } from './errors.js';
export type { BridgeErrorCode } from './errors.js';

// ── Transport ──
export type { Transport, ConnectableTransport, ListenableTransport } from './transport.js';

// ── Serializer ──
export type { MessageSerializer } from './serializer.js';
export { JSONSerializer } from './serializer.js';

// ── Identity ──
export type { AgentIdentity, TransportPreference, CapabilitiesDeclaration } from './identity.js';

// ── Compliance ──
export type { ComplianceLevel } from './compliance.js';
export { COMPLIANCE_REQUIREMENTS } from './compliance.js';
