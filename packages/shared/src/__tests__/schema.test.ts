import { describe, it, expect } from 'vitest';
import { toOpenAITool, toAnthropicTool, toGeminiTool } from '../index.js';
import type { ActionSchema } from '../index.js';

const action: ActionSchema = {
  name: 'get_weather',
  description: 'Get current weather',
  parameters: {
    type: 'object',
    properties: {
      location: { type: 'string', description: 'City name' },
      unit: { type: 'string', enum: ['celsius', 'fahrenheit'] },
    },
    required: ['location'],
    additionalProperties: false,
  },
};

describe('schema converters', () => {
  it('converts to OpenAI tool format', () => {
    const result = toOpenAITool(action);
    expect(result.type).toBe('function');
    expect(result.function.name).toBe('get_weather');
    expect(result.function.description).toBe('Get current weather');
    expect(result.function.parameters).toBe(action.parameters);
    expect(result.function.strict).toBe(true);
  });

  it('converts to Anthropic tool format', () => {
    const result = toAnthropicTool(action);
    expect(result.name).toBe('get_weather');
    expect(result.description).toBe('Get current weather');
    expect(result.input_schema).toBe(action.parameters);
  });

  it('converts to Gemini tool format with uppercase types', () => {
    const result = toGeminiTool(action);
    expect(result.name).toBe('get_weather');
    expect(result.parameters).toEqual({
      type: 'OBJECT',
      properties: {
        location: { type: 'STRING', description: 'City name' },
        unit: { type: 'STRING', enum: ['celsius', 'fahrenheit'] },
      },
      required: ['location'],
      additionalProperties: false,
    });
  });
});
