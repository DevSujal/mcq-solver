export function tryParseJson(maybeJson) {
  try {
    return JSON.parse(maybeJson);
  } catch (e) {
    const re = /\{[\s\S]*\}/; // crude
    const m = maybeJson.match(re);
    if (m) {
      try { return JSON.parse(m[0]); } catch (e2) { return null; }
    }
    return null;
  }
}

export function normalizeModelList(models) {
  if (!models || models.length === 0) return [process.env.GEMINI_MODEL || 'models/gemini-2.5-flash', process.env.CEREBRAS_LLAMA && `cerebras:${process.env.CEREBRAS_LLAMA}` || 'cerebras:llama-3.3-70b', process.env.CEREBRAS_QWEN && `cerebras:${process.env.CEREBRAS_QWEN}` || 'cerebras:qwen-3-32b'].filter(Boolean);
  return models;
}
