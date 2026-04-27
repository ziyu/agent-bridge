import { isValidBridgeMessage } from './guards.js';
import type { BridgeMessage } from './messages.js';

export interface MessageSerializer {
  serialize(message: BridgeMessage): string | Uint8Array;
  deserialize(raw: string | Uint8Array): BridgeMessage;
}

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
