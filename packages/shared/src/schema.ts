import type { ActionSchema } from '@agent_bridge/protocol';

export function toOpenAITool(action: ActionSchema) {
  return {
    type: 'function' as const,
    function: {
      name: action.name,
      description: action.description,
      parameters: action.parameters,
      strict: true,
    },
  };
}

export function toAnthropicTool(action: ActionSchema) {
  return {
    name: action.name,
    description: action.description,
    input_schema: action.parameters,
  };
}

export function toGeminiTool(action: ActionSchema) {
  return {
    name: action.name,
    description: action.description,
    parameters: convertTypesToUppercase(action.parameters),
  };
}

function convertTypesToUppercase(schema: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'type' && typeof value === 'string') {
      result[key] = value.toUpperCase();
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = convertTypesToUppercase(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}
