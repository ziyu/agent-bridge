import { describe, it, expect } from 'vitest';
import {
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
  NAMESPACE,
} from '../index.js';

const base = { namespace: NAMESPACE, channel: 'test', timestamp: Date.now() };

describe('guards', () => {
  it('rejects non-objects', () => {
    expect(isValidBridgeMessage(null)).toBe(false);
    expect(isValidBridgeMessage(undefined)).toBe(false);
    expect(isValidBridgeMessage('string')).toBe(false);
    expect(isValidBridgeMessage(42)).toBe(false);
  });

  it('rejects wrong namespace', () => {
    expect(isValidBridgeMessage({ ...base, namespace: 'wrong', type: 'SYN' })).toBe(false);
  });

  it('rejects missing type', () => {
    expect(isValidBridgeMessage({ ...base })).toBe(false);
  });

  it('accepts valid SYN message', () => {
    const msg = { ...base, type: 'SYN', participantId: 'abc', protocolVersion: '1.0' };
    expect(isValidBridgeMessage(msg)).toBe(true);
    expect(isSynMessage(msg as any)).toBe(true);
    expect(isAck1Message(msg as any)).toBe(false);
  });

  it('accepts valid ACK1 message', () => {
    const msg = { ...base, type: 'ACK1' };
    expect(isValidBridgeMessage(msg)).toBe(true);
    expect(isAck1Message(msg as any)).toBe(true);
  });

  it('accepts valid ACK2 message', () => {
    const msg = { ...base, type: 'ACK2', capabilities: [] };
    expect(isValidBridgeMessage(msg)).toBe(true);
    expect(isAck2Message(msg as any)).toBe(true);
  });

  it('accepts valid CALL message', () => {
    const msg = { ...base, type: 'CALL', id: '1', actionName: 'test', parameters: {} };
    expect(isValidBridgeMessage(msg)).toBe(true);
    expect(isCallMessage(msg as any)).toBe(true);
  });

  it('accepts valid REPLY message', () => {
    const msg = { ...base, type: 'REPLY', callId: '1', success: true, value: 42 };
    expect(isValidBridgeMessage(msg)).toBe(true);
    expect(isReplyMessage(msg as any)).toBe(true);
  });

  it('accepts valid NOTIFY message', () => {
    const msg = { ...base, type: 'NOTIFY', eventName: 'click', eventData: {} };
    expect(isValidBridgeMessage(msg)).toBe(true);
    expect(isNotifyMessage(msg as any)).toBe(true);
  });

  it('accepts valid STATE_SYNC message', () => {
    const msg = { ...base, type: 'STATE_SYNC', snapshot: { count: 1 } };
    expect(isValidBridgeMessage(msg)).toBe(true);
    expect(isStateSyncMessage(msg as any)).toBe(true);
  });

  it('accepts valid DESTROY message', () => {
    const msg = { ...base, type: 'DESTROY' };
    expect(isValidBridgeMessage(msg)).toBe(true);
    expect(isDestroyMessage(msg as any)).toBe(true);
  });

  it('accepts valid CAPABILITIES_UPDATE message', () => {
    const msg = { ...base, type: 'CAPABILITIES_UPDATE', capabilities: [{ name: 'act', description: 'desc', parameters: { type: 'object', properties: {} } }] };
    expect(isValidBridgeMessage(msg)).toBe(true);
    expect(isCapabilitiesUpdateMessage(msg as any)).toBe(true);
    expect(isDestroyMessage(msg as any)).toBe(false);
  });

  it('accepts valid PEER_MESSAGE', () => {
    const msg = { ...base, type: 'PEER_MESSAGE', id: '1', targetConnectionId: 'conn-2', topic: 'sync', payload: {} };
    expect(isValidBridgeMessage(msg)).toBe(true);
    expect(isPeerMessage(msg as any)).toBe(true);
    expect(isBroadcastMessage(msg as any)).toBe(false);
  });

  it('accepts valid PEER_MESSAGE_DELIVERY', () => {
    const msg = { ...base, type: 'PEER_MESSAGE_DELIVERY', id: '1', fromConnectionId: 'conn-1', topic: 'sync', payload: {} };
    expect(isValidBridgeMessage(msg)).toBe(true);
    expect(isPeerMessageDelivery(msg as any)).toBe(true);
  });

  it('accepts valid BROADCAST', () => {
    const msg = { ...base, type: 'BROADCAST', id: '1', topic: 'hello', payload: {} };
    expect(isValidBridgeMessage(msg)).toBe(true);
    expect(isBroadcastMessage(msg as any)).toBe(true);
    expect(isPeerMessage(msg as any)).toBe(false);
  });

  it('accepts valid PEER_LIST_REQUEST and PEER_LIST_RESPONSE', () => {
    const req = { ...base, type: 'PEER_LIST_REQUEST', id: '1' };
    expect(isValidBridgeMessage(req)).toBe(true);
    expect(isPeerListRequest(req as any)).toBe(true);

    const res = { ...base, type: 'PEER_LIST_RESPONSE', id: '1', peers: [] };
    expect(isValidBridgeMessage(res)).toBe(true);
    expect(isPeerListResponse(res as any)).toBe(true);
  });

  it('accepts valid PEER_CHANGE', () => {
    const msg = { ...base, type: 'PEER_CHANGE', event: 'connected', peer: { connectionId: 'conn-2', capabilities: [] } };
    expect(isValidBridgeMessage(msg)).toBe(true);
    expect(isPeerChangeNotification(msg as any)).toBe(true);
  });
});
