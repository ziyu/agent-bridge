import { describe, it, expect } from 'vitest';
import { BridgeError } from '../index.js';

describe('BridgeError', () => {
  it('creates error with code and message', () => {
    const err = new BridgeError('CALL_TIMEOUT', 'timed out');
    expect(err.code).toBe('CALL_TIMEOUT');
    expect(err.message).toBe('timed out');
    expect(err.name).toBe('BridgeError');
    expect(err.data).toBeUndefined();
    expect(err).toBeInstanceOf(Error);
  });

  it('creates error with data', () => {
    const err = new BridgeError('ACTION_EXECUTION_ERROR', 'failed', { detail: 'x' });
    expect(err.data).toEqual({ detail: 'x' });
  });

  it('serializes to JSON', () => {
    const err = new BridgeError('NOT_CONNECTED', 'not connected', 123);
    const json = err.toJSON();
    expect(json).toEqual({
      code: 'NOT_CONNECTED',
      message: 'not connected',
      data: 123,
    });
  });
});
