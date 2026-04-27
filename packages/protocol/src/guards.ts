import { NAMESPACE } from './constants.js';
import type {
  BridgeMessage,
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
} from './messages.js';

export function isValidBridgeMessage(data: unknown): data is BridgeMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    'namespace' in data &&
    (data as Record<string, unknown>).namespace === NAMESPACE &&
    'type' in data &&
    typeof (data as Record<string, unknown>).type === 'string'
  );
}

export function isSynMessage(msg: BridgeMessage): msg is SynMessage {
  return msg.type === 'SYN';
}

export function isAck1Message(msg: BridgeMessage): msg is Ack1Message {
  return msg.type === 'ACK1';
}

export function isAck2Message(msg: BridgeMessage): msg is Ack2Message {
  return msg.type === 'ACK2';
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

export function isCapabilitiesUpdateMessage(msg: BridgeMessage): msg is CapabilitiesUpdateMessage {
  return msg.type === 'CAPABILITIES_UPDATE';
}

export function isDestroyMessage(msg: BridgeMessage): msg is DestroyMessage {
  return msg.type === 'DESTROY';
}

export function isPeerMessage(msg: BridgeMessage): msg is PeerMessage {
  return msg.type === 'PEER_MESSAGE';
}

export function isPeerMessageDelivery(msg: BridgeMessage): msg is PeerMessageDelivery {
  return msg.type === 'PEER_MESSAGE_DELIVERY';
}

export function isBroadcastMessage(msg: BridgeMessage): msg is BroadcastMessage {
  return msg.type === 'BROADCAST';
}

export function isPeerListRequest(msg: BridgeMessage): msg is PeerListRequest {
  return msg.type === 'PEER_LIST_REQUEST';
}

export function isPeerListResponse(msg: BridgeMessage): msg is PeerListResponse {
  return msg.type === 'PEER_LIST_RESPONSE';
}

export function isPeerChangeNotification(msg: BridgeMessage): msg is PeerChangeNotification {
  return msg.type === 'PEER_CHANGE';
}
