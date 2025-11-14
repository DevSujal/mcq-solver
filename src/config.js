export const DEFAULT_MODEL_LIST = [
  'cerebras:qwen-3-235b-a22b-thinking-2507',
  'cerebras:llama-3.3-70b',
  'cerebras:qwen-3-32b',
  'models/gemini-2.5-flash',
];

// Weights reflect Cerebras as the high-weighted model and Gemini models as lower-weighted validators
export const MODEL_WEIGHTS = {
  'cerebras:qwen-3-235b-a22b-thinking-2507': 0.3,
  'cerebras:llama-3.3-70b': 0.35,
  'cerebras:qwen-3-32b': 0.15,
  'models/gemini-2.5-flash': 0.2,
};
