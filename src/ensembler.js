import { MODEL_WEIGHTS } from './config.js';
const DEFAULT_WEIGHTS = MODEL_WEIGHTS;

export function ensembleResponses(question, modelResponses, weights = DEFAULT_WEIGHTS, threshold = 0.25) {
  // modelResponses: [{model, parsed: {selected_options:[], confidence:...}}, ...]
  const optionScores = {}; // { 'A': total_weight }
  const perModel = [];
  let totalModelWeight = 0;
  let weightedConfidenceSum = 0;
  
  for (const r of modelResponses) {
    if (r.error) {
      perModel.push({ model: r.model, error: r.error });
      continue;
    }
    const parsed = r.parsed;
    if (!parsed) {
      perModel.push({ model: r.model, raw: r.text, parsed: null });
      continue;
    }
    const w = weights[r.model] || 0.15;
    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.5;
    
    totalModelWeight += w;
    weightedConfidenceSum += w * confidence;
    
    for (const opt of parsed.selected_options || []) {
      optionScores[opt] = (optionScores[opt] || 0) + w;
    }
    perModel.push({ model: r.model, selected_options: parsed.selected_options || [], confidence, reasoning: parsed.reasoning || '' });
  }

  // Select options that have enough weighted support
  const maxScore = Math.max(...Object.values(optionScores), 0);
  let winners = Object.entries(optionScores)
    .filter(([k, score]) => score >= threshold * totalModelWeight)
    .map(([k]) => k);
  
  if (!winners || winners.length === 0) {
    // choose argmax
    const arr = Object.entries(optionScores);
    if (arr.length === 0) winners = [];
    else winners = [arr.reduce((a,b) => a[1] > b[1] ? a : b)[0]];
  }
  
  // Final confidence = weighted average of all model confidences that contributed
  const finalConfidence = totalModelWeight > 0 ? weightedConfidenceSum / totalModelWeight : 0;
  
  // Keep probabilities for debugging
  const total = Object.values(optionScores).reduce((a,b) => a+b, 0) || 1;
  const probabilities = Object.fromEntries(Object.entries(optionScores).map(([k,v]) => [k, v/total]));

  return {
    question: question.question,
    question_id: question.id,
    options: question.options,
    selected_options: winners,
    final_confidence: finalConfidence,
    probabilities,
    per_model: perModel,
    ambiguous: winners.length > 1
  };
}
