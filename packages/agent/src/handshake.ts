import type { Transport, BridgeMessage, ActionSchema, AgentIdentityPayload } from '@agent_bridge/protocol';
import {
  NAMESPACE,
  PROTOCOL_VERSION,
  DEFAULT_HANDSHAKE_TIMEOUT,
  BridgeError,
  isSynMessage,
  isAck1Message,
  isAck2Message,
} from '@agent_bridge/protocol';

type HandshakeResult = {
  capabilities: ActionSchema[];
  remoteParticipantId: string;
  remoteIdentity?: AgentIdentityPayload;
};

type Ack2Payload = { capabilities: ActionSchema[] };

export function handshake(
  transport: Transport,
  channel: string,
  participantId: string,
  getCapabilitiesSnapshot: () => ActionSchema[],
  options?: {
    timeout?: number;
    identity?: AgentIdentityPayload;
  },
): Promise<HandshakeResult> {
  const timeout = options?.timeout ?? DEFAULT_HANDSHAKE_TIMEOUT;
  const identity = options?.identity;

  return new Promise((resolve, reject) => {
    let resolved = false;
    let remoteParticipantId = '';
    let remoteIdentity: AgentIdentityPayload | undefined;

    const timer = setTimeout(() => {
      cleanup();
      reject(new BridgeError('HANDSHAKE_TIMEOUT', `Handshake timed out after ${timeout}ms`));
    }, timeout);

    const cleanupTransport = transport.onMessage((msg: BridgeMessage) => {
      if (isSynMessage(msg)) {
        remoteParticipantId = msg.participantId;
        if (msg.identity) {
          remoteIdentity = msg.identity;
        }
        sendSyn();

        const isLeader = participantId > remoteParticipantId;
        if (isLeader) {
          sendAck1();
        }
      } else if (isAck1Message(msg)) {
        clearInterval(synInterval);
        sendAck2();
        finish({ capabilities: [], remoteParticipantId, remoteIdentity });
      } else if (isAck2Message(msg)) {
        clearInterval(synInterval);
        finish({
          capabilities: (msg as BridgeMessage & Ack2Payload).capabilities ?? [],
          remoteParticipantId,
          remoteIdentity,
        });
      }
    });

    function finish(result: HandshakeResult): void {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      cleanupTransport();
      resolve(result);
    }

    function cleanup(): void {
      clearInterval(synInterval);
      cleanupTransport();
    }

    function sendSyn(): void {
      const syn: BridgeMessage = {
        type: 'SYN',
        namespace: NAMESPACE,
        channel,
        timestamp: Date.now(),
        participantId,
        protocolVersion: PROTOCOL_VERSION,
      };
      if (identity) {
        (syn as any).identity = identity;
      }
      transport.send(syn);
    }

    function sendAck1(): void {
      transport.send({
        type: 'ACK1',
        namespace: NAMESPACE,
        channel,
        timestamp: Date.now(),
      });
    }

    function sendAck2(): void {
      transport.send({
        type: 'ACK2',
        namespace: NAMESPACE,
        channel,
        timestamp: Date.now(),
        capabilities: getCapabilitiesSnapshot(),
      });
    }

    sendSyn();
    const synInterval = setInterval(sendSyn, 100);
  });
}
