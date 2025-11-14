import { GoogleGenAI } from '@google/genai';
import { errorShort } from './logger.js';
import { tryParseJson } from './utils.js';
import { formatEvaluationPrompt } from './models/index.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

let aiClient = null;

function getGeminiClient() {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    aiClient = key ? new GoogleGenerativeAI(key || '') : null;
  }
  return aiClient;
}

// Normalize model name for SDK: SDK expects names like "gemini-2.5-flash" or "gemini-2.5-flash-image"
function normalizeModelName(modelId) {
  return modelId.startsWith('models/') ? modelId.replace(/^models\//, '') : modelId;
}

export async function queryGeminiModel({ modelId = 'gemini-2.5-flash', prompt, temperature = 0.2, maxTokens = 512 }) {
  const ai = getGeminiClient();
  if (!ai) {
    // mock - return a simple JSON guess for testing
    const fake = { question_id: '0', selected_options: ['A'], confidence: 0.6, reasoning: 'Mock gemini response - no GEMINI_API_KEY set.' };
    return { text: JSON.stringify(fake), raw: { mock: true } };
  }
  const modelName = normalizeModelName(modelId);
  const model = await ai.getGenerativeModel({ model: modelName });
  // Generate text content with the SDK
  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = await response.text();

    return { text, response }
  } catch (err) {
    errorShort(null, 'Gemini', `SDK call failed: ${err?.message || err}`, { err });
    throw err;
  }
}

// const prompt = formatEvaluationPrompt("what is the another name of india?", [
//   {label: "A", text: "germany"},
//   {label: "B", text: "france"},
//   {label: "C", text: "bhrat"},
//   {label: "D", text: "nepal"},
// ]);
// console.log(await queryGeminiModel({prompt}))
