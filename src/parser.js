import { warnShort } from './logger.js';

/**
 * parseMcqsFromText - Strict LLM-only parser using Cerebras Llama
 * - Expects the model to return ONLY valid JSON (array of questions)
 * - Retries once with a stricter prompt if parsing fails
 * - Throws errors on failures so callers can decide fallback behavior
 */
export async function parseMcqsFromText(text, reqId = null) {
  if (!text || !text.trim()) throw new Error('parse_failed: empty input');

  const basePrompt = `You are a strict parser. Parse the following raw text into a JSON array of multiple choice questions using this schema: [{"id":"1","question":"...","options":[{"label":"A","text":"..."}],"multiChoice":true}].

Rules:
- Output ONLY valid JSON (no commentary).
- If options are unlabeled, assign labels A,B,C... in order.
- Set "multiChoice" to true if the question indicates multiple correct answers are possible (e.g., "select all that apply", "which are correct", etc.), otherwise false.
- Analyze the question text carefully to detect multi-answer questions.
- Do not add extra fields.

Text:

${text}`;

  const { callModelsForPrompt } = await import('./models/index.js');
  const modelList = [process.env.CEREBRAS_LLAMA || 'cerebras:llama-3.3-70b'];

  const respArr = await callModelsForPrompt({ prompt: basePrompt, modelList, reqId });
  if (!respArr || respArr.length === 0) throw new Error('parse_failed: no response from parser model');
  const first = respArr[0];
  if (!first || typeof first.text !== 'string') throw new Error('parse_failed: parser model returned no text');
  const jsonStr = first.text.trim();
  if (!jsonStr) throw new Error('parse_failed: parser returned empty');

  try {
    const parsed = JSON.parse(jsonStr);
    const normalized = normalizeParsedArray(parsed);
    console.log(`✓ Parsing complete: ${normalized.length} question(s) extracted`);
    return normalized;
  } catch (e) {
    warnShort(reqId, 'Parser', 'First parse attempt failed; retrying with stricter prompt', { error: e?.message });
    const retryPrompt = `STRICT JSON ONLY. Return ONLY a valid JSON array matching the schema: [{"id":"1","question":"...","options":[{"label":"A","text":"..."}],"multiChoice":true}]. Set multiChoice=true if multiple answers are correct, false otherwise. No commentary.

Text:

${text}`;
    const retryArr = await callModelsForPrompt({ prompt: retryPrompt, modelList, reqId });
    const retryFirst = retryArr?.[0];
    const retryJson = retryFirst?.text?.trim() || '';
    if (!retryJson) throw new Error('parse_failed: retry returned empty');
    try {
      const parsed2 = JSON.parse(retryJson);
      const normalized2 = normalizeParsedArray(parsed2);
      return normalized2;
    } catch (e2) {
      warnShort(reqId, 'Parser', 'Retry parse failed', { error: e2?.message });
      throw new Error('parse_failed: parser did not return valid JSON');
    }
  }
}

function normalizeParsedArray(arr) {
  if (!Array.isArray(arr)) arr = [arr];
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const p = arr[i] || {};
    const id = p.id !== undefined && p.id !== null ? String(p.id) : String(i + 1);
    const question = p.question || '';
    const multiChoice = !!p.multiChoice;
    const rawOptions = Array.isArray(p.options) ? p.options : [];
    const opts = rawOptions.map((o, idx) => {
      if (typeof o === 'string') return { label: String.fromCharCode(65 + idx), text: o };
      const label = (o?.label || String.fromCharCode(65 + idx)).toUpperCase();
      return { label, text: o?.text || '' };
    });
    out.push({ id, question, options: opts, multiChoice });
  }
  return out;
}

// Backwards-compatibility helper: if external code passes a specific callModel
export async function parseWithLLM({ text, callModel }) {
  if (!text || !text.trim()) return [];
  try {
    const prompt = `Parse the following text and output ONLY a JSON array matching schema [{"id":"1","question":"...","options":[{"label":"A","text":"..."}],"multiChoice":true}]. Set multiChoice=true if multiple answers are correct, false otherwise.

Text:

${text}`;
    const jsonStr = await callModel(prompt);
    if (!jsonStr || typeof jsonStr !== 'string') return [];
    const parsed = JSON.parse(jsonStr.trim());
    return normalizeParsedArray(parsed);
  } catch (e) {
    return [];
  }
}

export function normalizeParsedQuestion(p) {
  const options = (p?.options && Array.isArray(p.options)) ? p.options.map(o => ({ label: o.label || '', text: o.text || '' })) : [];
  return { id: p?.id ? String(p.id) : (p?.question_id || ''), question: p?.question || p?.prompt || '', options, multiChoice: !!p?.multiChoice };
}