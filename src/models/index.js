import { queryCerebrasModel } from '../cerebrasClient.js';
import { queryGeminiModel } from '../geminiClient.js';
import { tryParseJson } from '../utils.js';

export async function queryModels({ question, options, modelList = [], reqId }) {
  // modelList default: ['models/gemini-2.5-flash', 'cerebras:llama-3.3-70b', 'cerebras:qwen-3-32b']
  const modelResponses = [];
  // ensure Cerebras (if present) is the first to be queried so it can be the primary answer
  const ordered = [...modelList].sort((a, b) => (a.startsWith('cerebras:') ? -1 : 1));
  for (const model of ordered) {
    try {
      if (model.startsWith('models/')) {
        // Gemini model
        const prompt = formatEvaluationPrompt(question, options);
        const t0 = Date.now();
        // apply per-model timeout (will be handled by caller if desired), we keep shorter here
        const resp = await Promise.race([
          queryGeminiModel({ modelId: model, prompt, temperature: 0.1, maxTokens: 4096 }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('gemini_call_timeout')), 15000))
        ]);
        const t1 = Date.now();
        // calculate time in ms

        const time = t1 - t0
        console.log(model, "completed execution in:", Math.round(time), "ms")
        const parsed = safeParseJson(resp.text);
        modelResponses.push({ model, text: resp.text, parsed, raw: resp.raw });
      } else if (model.startsWith('cerebras:')) {
        const modelName = model.split(':')[1];
        const prompt = formatEvaluationPrompt(question, options);
        const t0 = Date.now();
        const resp = await Promise.race([
          queryCerebrasModel({ model: modelName, prompt, temperature: 0.1, maxTokens: 4096 }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('cerebras_call_timeout')), 15000))
        ]);
        const t1 = Date.now();
        const time = t1 - t0
        console.log(model, "completed execution in:", Math.round(time), "ms")
        const parsed = safeParseJson(resp.text);
        const {reasoning, ...etc} = parsed
        console.log("Response :", etc)
        modelResponses.push({ model, text: resp.text, parsed, raw: resp.raw });
      } else {
        console.log(`⚠ Unknown model type: ${model}`);
        modelResponses.push({ model, error: 'unknown_model_type' });
      }
    } catch (err) {
      console.log(`⚠ ${model} failed: ${err?.message || err}`);
      modelResponses.push({ model, error: err?.message || String(err) });
    }
  }
  return modelResponses;
}

export async function callModelsForPrompt({ prompt, modelList = [], reqId }) {
  const respArr = [];
  for (const model of modelList) {
    try {
      if (model.startsWith('models/')) {
        const r = await queryGeminiModel({ modelId: model, prompt, temperature: 0.1, maxTokens: 1024 });
        respArr.push({ model, text: r.text, raw: r.raw });
      } else if (model.startsWith('cerebras:')) {
        const modelName = model.split(':')[1];
        const r = await queryCerebrasModel({ model: modelName, prompt, temperature: 0.0, maxTokens: 1024 });
        respArr.push({ model, text: r.text, raw: r.raw });
      }
    } catch (e) {
      respArr.push({ model, error: e.message });
    }
  }
  return respArr;
}

export function formatEvaluationPrompt(question, options) {
  let optStr = '';
  for (const o of options) optStr += `${o.label}) ${o.text}\n`;
  return `You are an objective grader. For the given multiple choice question, evaluate which option or options are correct.

IMPORTANT: Multiple options can be correct. Carefully analyze if more than one option is valid and include ALL correct options in your answer.

Return ONLY valid JSON with this schema: {"question_id":"<id>","selected_options":["A","B"],"is_multiple_correct":true,"confidence":0.85,"reasoning":"Short chain-of-thought reasoning."}

Instructions:
- Set "is_multiple_correct" to true if multiple options are correct, false otherwise
- Include ALL correct options in "selected_options" array
- DO NOT add any surrounding commentary or markdown

Question: ${question}
Options:
${optStr}
Evaluate and return the JSON only.`;
}

function safeParseJson(maybeJson) {
  if (!maybeJson || typeof maybeJson !== 'string') return null;
  
  // Try direct parse first
  try {
    return JSON.parse(maybeJson.trim());
  } catch (e) {
    // Remove <think>...</think> tags if present (for thinking models)
    let cleaned = maybeJson.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    
    // Try parsing cleaned text
    try {
      return JSON.parse(cleaned);
    } catch (e2) {
      // Try to extract JSON from text (handles "Here's the answer: {...}" cases)
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (e3) {
          // Try cleaning markdown code blocks
          const markdownCleaned = cleaned.replace(/```json\s*|```\s*/g, '').trim();
          try {
            return JSON.parse(markdownCleaned);
          } catch (e4) {
            return null;
          }
        }
      }
      return null;
    }
  }
}
