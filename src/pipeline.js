import { extractTextFromImageBuffer } from './ocr.js';
import { parseMcqsFromText, parseWithLLM } from './parser.js';
import { queryModels, callModelsForPrompt } from './models/index.js';
import { normalizeModelList } from './utils.js';
import { DEFAULT_MODEL_LIST } from './config.js';
import { ensembleResponses } from './ensembler.js';
import { errorShort } from './logger.js';

const DEFAULT_REQUEST_TIMEOUT_MS = 60 * 1000; // 60s
const OCR_TIMEOUT_MS = 25 * 1000; // 25s for OCR
const MODEL_TIMEOUT_MS = 25 * 1000; // 25s per model

export async function processImage({ imageBuffer, debug = false, requestedModels = undefined, reqId = null, requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS }) {
  const startTime = Date.now();
  const requestTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('request_timeout')), requestTimeoutMs));
  const modelsToCall = normalizeModelList(requestedModels || DEFAULT_MODEL_LIST);
  
  // Place the main pipeline logic here as a function so we can race with the request timeout
  const mainFlow = async () => {
    // 1. Extract MCQs directly from image using Gemini Vision (returns JSON array)
  const ocrPromise = (async () => {
    const t0 = Date.now();
    const mcqs = await extractTextFromImageBuffer(imageBuffer);
    return mcqs;
  })();
  let mcqs = null;
  try {
    mcqs = await Promise.race([ocrPromise, new Promise((_, reject) => setTimeout(() => reject(new Error('ocr_timeout')), OCR_TIMEOUT_MS))]);
  } catch (err) {
    errorShort(reqId, 'OCR', `Failed: ${err.message}`, { err: err.message });
    return { error: 'ocr_failed', message: err.message };
  }
    if (!mcqs || !Array.isArray(mcqs) || mcqs.length === 0) {
      return { error: 'No complete questions detected in image', recommendation: 'Ensure image contains complete questions with all options visible.' };
    }

  // 3. Query models for each question
  // Use Cerebras as the primary model with higher weight, and call Gemini models once per question as validators
  const results = [];
    for (const q of mcqs) {
    // call selected models
    let modelResponses = [];
    try {
      modelResponses = await Promise.race([
        queryModels({ question: q.question, options: q.options, modelList: modelsToCall, reqId }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('models_query_timeout')), MODEL_TIMEOUT_MS))
      ]);
    } catch (err) {
      errorShort(reqId, 'Model', `Question ${q.id}: model calls failed: ${err.message}`, { questionId: q.id, err: err.message });
      modelResponses = [{ error: err.message }];
    }
    const ensembled = ensembleResponses(q, modelResponses);
    const selected = ensembled.selected_options;
    console.log(`✓ Q${q.id} answered: ${selected.join(',')} (confidence: ${Math.round(ensembled.final_confidence * 100)}%)`);
    results.push({
      question: q.question,
      answer: selected.map(opt => `${opt}) ${q.options.find(o => o.label === opt)?.text || opt}`),
      question_id: q.id
    });
  }

    return {
    questions: results,
    metadata: { models: modelsToCall, timestamp: new Date().toISOString() },
    debug: debug ? { per_question_raw: results } : undefined
  };
  };

  try {
    const result = await Promise.race([mainFlow(), requestTimeout]);
    console.log(`✓ Image processing complete: ${result.questions?.length || 0} questions, ${modelsToCall.length} models used`);
    return result;
  } catch (e) {
    errorShort(reqId, 'Pipeline', `Error: ${e.message}`, { err: e.message });
    return { error: 'processing_failed', message: e.message };
  }
}

// Additional helper to process a plain text input (useful for testing and offline cases)
export async function processText({ text, debug = false, requestedModels = undefined, reqId = null, requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS }) {
  const startTime = Date.now();
  let extractedText = text;
  if (!extractedText || extractedText.trim().length === 0) {
    return { error: 'No text provided' };
  }

  let mcqs = await parseMcqsFromText(extractedText, reqId);
  if (!mcqs || mcqs.length === 0) {
    const callModel = async (prompt) => {
      const { callModelsForPrompt } = await import('./models/index.js');
      const resp = await callModelsForPrompt({ prompt, modelList: [process.env.CEREBRAS_LLAMA || 'cerebras:llama-3.3-70b'], reqId });
      if (resp && resp[0] && resp[0].text) return resp[0].text;
      return '';
    };
    mcqs = await parseWithLLM({ text: extractedText, callModel });
  }
  if (!Array.isArray(mcqs)) mcqs = [];
  // No heuristic fallback for text form either - parser is LLM-only
  
  const modelsToCall = normalizeModelList(requestedModels || DEFAULT_MODEL_LIST);
  const results = [];
  for (const q of mcqs) {
    let modelResponses = [];
    try {
      modelResponses = await queryModels({ question: q.question, options: q.options, modelList: modelsToCall, reqId });
    } catch (err) {
      errorShort(reqId, 'Model', `Question ${q.id}: model calls failed: ${err?.message || String(err)}`, { questionId: q.id, err: err?.message || String(err) });
      modelResponses = [{ error: err.message }];
    }
    const ensembled = ensembleResponses(q, modelResponses);
    const selected = ensembled.selected_options;
    const answerTextArr = selected.map(opt => `${opt}) ${q.options.find(o => o.label === opt)?.text || opt}`);
    results.push({ question: q.question, answer: answerTextArr, question_id: q.id });
  }
  return { originalText: extractedText, questions: results, metadata: { models: modelsToCall, timestamp: new Date().toISOString() } };
}